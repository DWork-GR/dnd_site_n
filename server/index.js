const path = require("path");
const projectRoot = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(projectRoot, ".env") });
const express = require("express");
const crypto = require("crypto");
const { promisify } = require("util");
const { Pool } = require("pg");
const scrypt = promisify(crypto.scrypt);
const fs = require("fs");
const uploadsDirectory = path.join(projectRoot, "uploads", "images");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const masterPassword = process.env.MASTER_PASSWORD || "master";
const defaultCampaignId = "00000000-0000-0000-0000-000000000001";
const databaseRetryAttempts = Math.max(1, Number(process.env.DB_RETRY_ATTEMPTS || 8));
const databaseRetryDelay = Math.max(250, Number(process.env.DB_RETRY_DELAY_MS || 750));
const databaseStartupAttempts = Math.max(databaseRetryAttempts, Number(process.env.DB_STARTUP_ATTEMPTS || 40));
const loginAttempts = new Map();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://dnd_app:dnd_local_only@localhost:5432/dnd_archive",
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  keepAlive: true
});
const masterEventStreams = new Set();
const playerEventStreams = new Set();
const databaseWarningTimes = new Map();
let databaseOutageStartedAt = 0;

function databaseWarningOnce(key, message, cooldown = 5000) {
  const now = Date.now();
  if (now - (databaseWarningTimes.get(key) || 0) < cooldown) return;
  databaseWarningTimes.set(key, now);
  console.warn(message);
}

function markDatabaseUnavailable() {
  databaseOutageStartedAt ||= Date.now();
}

function markDatabaseAvailable() {
  if (!databaseOutageStartedAt) return;
  const seconds = Math.max(1, Math.round((Date.now() - databaseOutageStartedAt) / 1000));
  console.log(`[PostgreSQL] Соединение восстановлено после ${seconds} сек.`);
  databaseOutageStartedAt = 0;
  databaseWarningTimes.clear();
}

function closeEventStream(stream, streams) {
  streams.delete(stream);
  if (!stream.destroyed && !stream.writableEnded) {
    try { stream.end(); } catch {}
  }
}

function writeEventStream(stream, streams, message) {
  if (stream.destroyed || stream.writableEnded) {
    closeEventStream(stream, streams);
    return false;
  }

  try {
    stream.write(message);
    return true;
  } catch (error) {
    console.warn(`[SSE] Потеряно соединение с клиентом: ${error.message}`);
    closeEventStream(stream, streams);
    return false;
  }
}

function openEventStream(req, res, streams) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  streams.add(res);

  req.socket.setKeepAlive?.(true, 30000);
  req.socket.setTimeout?.(0);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    closeEventStream(res, streams);
  };
  const heartbeat = setInterval(() => {
    if (!writeEventStream(res, streams, ": heartbeat\n\n")) cleanup();
  }, 20000);

  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", error => {
    console.warn(`[SSE] Ошибка потока: ${error.message}`);
    cleanup();
  });

  if (!writeEventStream(res, streams, "event: connected\ndata: {}\n\n")) cleanup();
}

function broadcastStateChanged() {
  for (const stream of masterEventStreams) writeEventStream(stream, masterEventStreams, "event: state\ndata: {}\n\n");
  for (const stream of playerEventStreams) writeEventStream(stream, playerEventStreams, "event: state\ndata: {}\n\n");
}

pool.on("error", error => {
  // Idle PostgreSQL connections can be reset when the service or computer restarts.
  // pg-pool removes the broken client automatically; handling the event keeps Node alive.
  markDatabaseUnavailable();
  databaseWarningOnce("idle-connection", `[PostgreSQL] Потеряно соединение из пула: ${error.code || error.message}`);
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "5mb" }));
app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/player.html", (_req, res) => res.sendFile(path.join(projectRoot, "player.html")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(projectRoot, "styles.css")));
app.use("/assets", express.static(path.join(projectRoot, "assets"), { dotfiles: "deny" }));
app.use("/uploads", express.static(path.join(projectRoot, "uploads"), { dotfiles: "deny" }));

const transientDatabaseErrors = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03"  // cannot_connect_now
]);

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function isTransientDatabaseError(error) {
  return transientDatabaseErrors.has(error?.code)
    || /connection terminated unexpectedly|connection ended unexpectedly|the database system is starting up/i.test(error?.message || "");
}

function retryDelay(attempt) {
  return Math.min(databaseRetryDelay * attempt, 5000);
}

async function queryWithRetry(text, params = [], attempts = databaseRetryAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await pool.query(text, params);
      markDatabaseAvailable();
      return result;
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) throw error;
      markDatabaseUnavailable();
      const delay = retryDelay(attempt);
      databaseWarningOnce(`query-${error.code || "connection"}-${attempt}`, `[PostgreSQL] База временно недоступна (${error.code || error.message}). Повтор ${attempt}/${attempts - 1} через ${delay} мс.`);
      await wait(delay);
    }
  }
  throw lastError;
}

async function connectWithRetry(attempts = databaseRetryAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const client = await pool.connect();
      markDatabaseAvailable();
      return client;
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) throw error;
      markDatabaseUnavailable();
      const delay = retryDelay(attempt);
      databaseWarningOnce(`connect-${error.code || "connection"}-${attempt}`, `[PostgreSQL] Не удалось получить соединение (${error.code || error.message}). Повтор ${attempt}/${attempts - 1} через ${delay} мс.`);
      await wait(delay);
    }
  }
  throw lastError;
}

function databaseErrorResponse(res, error) {
  const temporary = isTransientDatabaseError(error);
  res.status(temporary ? 503 : 500).json({
    error: temporary ? "PostgreSQL временно недоступна. Повторите попытку." : error.message,
    code: error.code
  });
}

function loginAttemptKey(req) {
  return req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "unknown";
}

function loginRateLimit(req, res, next) {
  const key = loginAttemptKey(req);
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(timestamp => now - timestamp < 15 * 60 * 1000);
  if (recent.length >= 12) return res.status(429).json({ error: "Слишком много попыток входа. Подождите 15 минут." });
  recent.push(now);
  loginAttempts.set(key, recent);
  next();
}

function clearLoginAttempts(req) {
  loginAttempts.delete(loginAttemptKey(req));
}

function sessionCookie(req, name, value, maxAge) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = req.secure || forwardedProto === "https";
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

async function initializeDatabase() {
  await queryWithRetry(`
    CREATE TABLE IF NOT EXISTS campaign_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS campaign_backups (
      id BIGSERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS player_accounts (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      character_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS player_invitations (
      token_hash TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS player_sessions (
      token_hash TEXT PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_notes (
      player_id BIGINT PRIMARY KEY REFERENCES player_accounts(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS master_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Моя кампания',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS campaign_states (
      campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS campaign_state_backups (
      id BIGSERIAL PRIMARY KEY,
      campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS master_accounts (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS master_invitations (
      token_hash TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE master_sessions ADD COLUMN IF NOT EXISTS master_id BIGINT;
    ALTER TABLE master_sessions ADD COLUMN IF NOT EXISTS campaign_id UUID;
    ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS campaign_id UUID;
    ALTER TABLE player_invitations ADD COLUMN IF NOT EXISTS campaign_id UUID;
    ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS campaign_id UUID;
    CREATE INDEX IF NOT EXISTS player_accounts_campaign_idx ON player_accounts(campaign_id);
    CREATE INDEX IF NOT EXISTS player_invitations_campaign_idx ON player_invitations(campaign_id);
    CREATE INDEX IF NOT EXISTS media_assets_campaign_idx ON media_assets(campaign_id);
    CREATE INDEX IF NOT EXISTS campaign_state_backups_campaign_idx ON campaign_state_backups(campaign_id, created_at DESC);
  `, [], databaseStartupAttempts);
  await queryWithRetry("INSERT INTO campaigns (id, name) VALUES ($1, 'Основная кампания') ON CONFLICT (id) DO NOTHING", [defaultCampaignId], databaseStartupAttempts);
  await queryWithRetry("INSERT INTO campaign_states (campaign_id, data) SELECT $1, data FROM campaign_state WHERE id = 1 ON CONFLICT (campaign_id) DO NOTHING", [defaultCampaignId], databaseStartupAttempts);
  await queryWithRetry("UPDATE master_sessions SET campaign_id = $1 WHERE campaign_id IS NULL", [defaultCampaignId], databaseStartupAttempts);
  await queryWithRetry("UPDATE player_accounts SET campaign_id = $1 WHERE campaign_id IS NULL", [defaultCampaignId], databaseStartupAttempts);
  await queryWithRetry("UPDATE player_invitations SET campaign_id = $1 WHERE campaign_id IS NULL", [defaultCampaignId], databaseStartupAttempts);
  await queryWithRetry("UPDATE media_assets SET campaign_id = $1 WHERE campaign_id IS NULL", [defaultCampaignId], databaseStartupAttempts);
}

const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const editableCharacterFields = new Set([
  "name", "className", "level", "background", "player", "race", "alignment", "xp",
  "ac", "speed", "gold", "cp", "sp", "ep", "pp",
  "abilities", "saveProficiencies", "skillProficiencies", "skillExpertise",
  "proficiencies", "inspiration", "attacks", "equipment", "personality", "ideals", "bonds",
  "flaws", "features", "featureCards", "attackCards", "traitCards", "spellcastingClass", "spellAbility", "spellSlots",
  "spellNotes", "spells", "personalInventory"
]);

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const key = await scrypt(password, salt, 64);
  return { salt, hash: key.toString("hex") };
}

async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function getPlayer(req) {
  const token = parseCookies(req).dnd_player_session;
  if (!token) return null;
  const result = await queryWithRetry(
    `SELECT a.id, a.username, a.character_id, a.display_name, a.enabled, a.campaign_id
     FROM player_sessions s JOIN player_accounts a ON a.id = s.player_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

async function requirePlayer(req, res, next) {
  try {
    const player = await getPlayer(req);
    if (!player || !player.enabled) return res.status(401).json({ error: "Требуется вход игрока" });
    req.player = player;
    next();
  } catch (error) {
    databaseErrorResponse(res, error);
  }
}

async function requireMaster(req, res, next) {
  try {
    const token = parseCookies(req).dnd_master_session;
    if (!token) return res.status(401).json({ error: "Требуется вход мастера" });
    const result = await queryWithRetry(
      `SELECT s.token_hash, s.master_id, s.campaign_id, a.username, a.display_name, a.enabled
       FROM master_sessions s LEFT JOIN master_accounts a ON a.id = s.master_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: "Требуется вход мастера" });
    if (result.rows[0].master_id && result.rows[0].enabled !== true) return res.status(401).json({ error: "Кабинет мастера отключён" });
    req.master = result.rows[0];
    next();
  } catch (error) {
    databaseErrorResponse(res, error);
  }
}

function publicCharacter(character) {
  const copy = structuredClone(character);
  copy.abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(ability => [ability, clampNumber(copy.abilities?.[ability] ?? 10, 1, 30)]));
  copy.maxHp = Math.max(0, Number(copy.maxHp || 0));
  copy.hp = clampNumber(copy.hp, 0, copy.maxHp);
  delete copy.dmNotes;
  delete copy.playerAccessEnabled;
  delete copy.packId;
  delete copy.kind;
  return copy;
}

function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function sanitizePlayerCharacterUpdate(body) {
  const update = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!editableCharacterFields.has(key)) continue;
    if (key === "abilities") {
      update[key] = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(ability => [ability, clampNumber(value?.[ability] ?? 10, 1, 30)]));
    } else if (key === "featureCards") {
      update[key] = Array.isArray(value) ? value.slice(0, 100).map(feature => ({
        name: String(feature?.name || "").slice(0, 200),
        description: String(feature?.description || "").slice(0, 50000)
      })) : [];
    } else if (key === "attackCards") {
      update[key] = Array.isArray(value) ? value.slice(0, 100).map(item => ({
        name: String(item?.name || "").slice(0, 200),
        damageDie: String(item?.damageDie || "").slice(0, 100),
        proficient: item?.proficient === true,
        description: String(item?.description || "").slice(0, 50000)
      })) : [];
    } else if (key === "traitCards") {
      update[key] = Object.fromEntries(["personality","ideals","bonds","flaws"].map(trait => [trait, Array.isArray(value?.[trait]) ? value[trait].slice(0, 100).map(item => ({
        name: String(item?.name || "").slice(0, 200),
        description: String(item?.description || "").slice(0, 50000)
      })) : []]));
    } else {
      update[key] = value;
    }
  }
  return update;
}

function publicCombatForPlayer(state, characterId) {
  const combat = state?.combat;
  if (!combat?.active) return { active: false };
  return {
    active: true,
    round: Number(combat.round || 1),
    turnIndex: Number(combat.turnIndex || 0),
    participants: (combat.participants || []).map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      initiative: Number(participant.initiative || 0),
      hp: Number(participant.hp || 0),
      maxHp: Number(participant.maxHp || 0),
      isCurrent: index === Number(combat.turnIndex || 0),
      isSelf: participant.characterId === characterId,
      deathSuccesses: participant.characterId === characterId ? Number(participant.deathSuccesses || 0) : undefined,
      deathFailures: participant.characterId === characterId ? Number(participant.deathFailures || 0) : undefined,
      canMarkDeathSave: participant.characterId === characterId
        ? index === Number(combat.turnIndex || 0) && Number(participant.hp || 0) === 0 && Number(participant.lastDeathSaveRound || 0) !== Number(combat.round || 1)
        : undefined
    }))
  };
}

async function updateCombatAsPlayer(player, action) {
  let client;
  let releaseError;
  try {
    client = await connectWithRetry();
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM campaign_states WHERE campaign_id = $1 FOR UPDATE", [player.campaign_id]);
    if (!result.rowCount) throw new Error("State is not initialized");
    const state = result.rows[0].data;
    const response = action(state, player.character_id);
    await client.query("UPDATE campaign_states SET data = $1, updated_at = NOW() WHERE campaign_id = $2", [state, player.campaign_id]);
    await client.query("COMMIT");
    broadcastStateChanged();
    return response;
  } catch (error) {
    releaseError = error;
    try { if (client) await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    if (client) client.release(releaseError);
  }
}

async function loadState(campaignId = defaultCampaignId) {
  const result = await queryWithRetry("SELECT data FROM campaign_states WHERE campaign_id = $1", [campaignId]);
  return result.rows[0]?.data || null;
}

app.get("/api/health", async (_req, res) => {
  try {
    await queryWithRetry("SELECT 1");
    res.json({ ok: true, storage: "postgresql" });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message, code: error.code });
  }
});

app.post("/api/master/login", loginRateLimit, async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const accountPassword = String(req.body?.password || "");
  if (username) {
    try {
      const result = await queryWithRetry("SELECT * FROM master_accounts WHERE username = $1 AND enabled = TRUE", [username]);
      const account = result.rows[0];
      if (!account || !(await verifyPassword(accountPassword, account.password_salt, account.password_hash))) {
        return res.status(401).json({ error: "Неверный логин или пароль мастера" });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      await queryWithRetry("DELETE FROM master_sessions WHERE expires_at <= NOW()");
      await queryWithRetry("INSERT INTO master_sessions (token_hash, master_id, campaign_id, expires_at) VALUES ($1, $2, $3, $4)", [hashToken(token), account.id, account.campaign_id, new Date(Date.now() + sessionLifetime)]);
      clearLoginAttempts(req);
      res.setHeader("Set-Cookie", sessionCookie(req, "dnd_master_session", encodeURIComponent(token), sessionLifetime / 1000));
      return res.json({ ok: true });
    } catch (error) {
      return databaseErrorResponse(res, error);
    }
  }
  const supplied = Buffer.from(String(req.body?.password || ""));
  const expected = Buffer.from(masterPassword);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Неверный пароль мастера" });
  }
  try {
    const token = crypto.randomBytes(32).toString("base64url");
    await queryWithRetry("DELETE FROM master_sessions WHERE expires_at <= NOW()");
    await queryWithRetry("INSERT INTO master_sessions (token_hash, campaign_id, expires_at) VALUES ($1, $2, $3)", [hashToken(token), defaultCampaignId, new Date(Date.now() + sessionLifetime)]);
    clearLoginAttempts(req);
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_master_session", encodeURIComponent(token), sessionLifetime / 1000));
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/master/logout", requireMaster, async (req, res) => {
  try {
    const token = parseCookies(req).dnd_master_session;
    await queryWithRetry("DELETE FROM master_sessions WHERE token_hash = $1", [hashToken(token)]);
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_master_session", "", 0));
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/state", requireMaster, async (req, res) => {
  try {
    const result = await queryWithRetry("SELECT data, updated_at FROM campaign_states WHERE campaign_id = $1", [req.master.campaign_id]);
    if (!result.rowCount) return res.status(404).json({ error: "State is not initialized" });
    res.json(result.rows[0]);
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/master/events", requireMaster, (req, res) => openEventStream(req, res, masterEventStreams));
app.get("/api/player/events", requirePlayer, (req, res) => openEventStream(req, res, playerEventStreams));

app.put("/api/state", requireMaster, async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "State must be a JSON object" });
  }

  for (const character of req.body.characters || []) {
    character.abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(ability => [ability, clampNumber(character.abilities?.[ability] ?? 10, 1, 30)]));
    character.maxHp = Math.max(0, Number(character.maxHp || 0));
    character.hp = clampNumber(character.hp, 0, character.maxHp);
    character.hitDieType = [6, 8, 10, 12].includes(Number(character.hitDieType)) ? Number(character.hitDieType) : 8;
    character.hitDiceTotal = Math.max(0, Number(character.hitDiceTotal || 0));
    character.usedHitDice = clampNumber(character.usedHitDice, 0, character.hitDiceTotal);
  }
  for (const participant of req.body.combat?.participants || []) {
    participant.maxHp = Math.max(0, Number(participant.maxHp || 0));
    participant.hp = clampNumber(participant.hp, 0, participant.maxHp);
  }

  let client;
  let releaseError;
  try {
    client = await connectWithRetry();
    await client.query("BEGIN");
    await client.query("INSERT INTO campaign_state_backups (campaign_id, data) SELECT campaign_id, data FROM campaign_states WHERE campaign_id = $1", [req.master.campaign_id]);
    await client.query(
      `INSERT INTO campaign_states (campaign_id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (campaign_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [req.master.campaign_id, req.body]
    );
    await client.query(`
      DELETE FROM campaign_state_backups
      WHERE campaign_id = $1 AND id NOT IN (SELECT id FROM campaign_state_backups WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 30)
    `, [req.master.campaign_id]);
    await client.query("COMMIT");
    broadcastStateChanged();
    res.json({ ok: true });
  } catch (error) {
    releaseError = error;
    try { if (client) await client.query("ROLLBACK"); } catch (rollbackError) {
      console.error(`[PostgreSQL] Ошибка отката транзакции: ${rollbackError.code || rollbackError.message}`);
    }
    databaseErrorResponse(res, error);
  } finally {
    if (client) client.release(releaseError);
  }
});

app.get("/api/backups", requireMaster, async (req, res) => {
  try {
    const result = await queryWithRetry("SELECT id, created_at FROM campaign_state_backups WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 30", [req.master.campaign_id]);
    res.json(result.rows);
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/master/player-accounts", requireMaster, async (req, res) => {
  try {
    const result = await queryWithRetry(
      "SELECT id, username, character_id, display_name, enabled, updated_at FROM player_accounts WHERE campaign_id = $1 ORDER BY username",
      [req.master.campaign_id]
    );
    res.json(result.rows);
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/master/me", requireMaster, async (req, res) => {
  try {
    const campaign = await queryWithRetry("SELECT id, name FROM campaigns WHERE id = $1", [req.master.campaign_id]);
    res.json({ account: { username: req.master.username || "owner", displayName: req.master.display_name || "Главный мастер", legacy: !req.master.master_id }, campaign: campaign.rows[0] });
  } catch (error) { databaseErrorResponse(res, error); }
});

app.patch("/api/master/me", requireMaster, async (req, res) => {
  const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
  const campaignName = String(req.body?.campaignName || "").trim().slice(0, 160);
  try {
    if (campaignName) await queryWithRetry("UPDATE campaigns SET name = $1, updated_at = NOW() WHERE id = $2", [campaignName, req.master.campaign_id]);
    if (req.master.master_id && displayName) await queryWithRetry("UPDATE master_accounts SET display_name = $1, updated_at = NOW() WHERE id = $2", [displayName, req.master.master_id]);
    res.json({ ok: true });
  } catch (error) { databaseErrorResponse(res, error); }
});

app.post("/api/master/invitations", requireMaster, async (req, res) => {
  const token = crypto.randomBytes(24).toString("base64url");
  const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  try {
    await queryWithRetry("INSERT INTO master_invitations (token_hash, display_name, expires_at) VALUES ($1, $2, $3)", [hashToken(token), displayName, expiresAt]);
    res.json({ token, expiresAt });
  } catch (error) { databaseErrorResponse(res, error); }
});

app.post("/api/master/register", loginRateLimit, async (req, res) => {
  const token = String(req.body?.token || "");
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const requestedName = String(req.body?.displayName || "").trim().slice(0, 120);
  const campaignName = String(req.body?.campaignName || "").trim().slice(0, 160) || "Новая кампания";
  if (!/^[a-z0-9_.-]{3,40}$/i.test(username)) return res.status(400).json({ error: "Логин: 3–40 латинских символов, цифр, точек, дефисов или подчёркиваний" });
  if (password.length < 6) return res.status(400).json({ error: "Пароль должен содержать минимум 6 символов" });
  let client;
  try {
    client = await connectWithRetry();
    await client.query("BEGIN");
    const inviteResult = await client.query("SELECT * FROM master_invitations WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE", [hashToken(token)]);
    const invitation = inviteResult.rows[0];
    if (!invitation) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Приглашение недействительно или уже использовано" }); }
    const campaignId = crypto.randomUUID();
    const credentials = await hashPassword(password);
    const displayName = requestedName || invitation.display_name || username;
    await client.query("INSERT INTO campaigns (id, name) VALUES ($1, $2)", [campaignId, campaignName]);
    const account = await client.query(`INSERT INTO master_accounts (username, password_hash, password_salt, display_name, campaign_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [username, credentials.hash, credentials.salt, displayName, campaignId]);
    await client.query("DELETE FROM master_invitations WHERE token_hash = $1", [hashToken(token)]);
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    await client.query("INSERT INTO master_sessions (token_hash, master_id, campaign_id, expires_at) VALUES ($1, $2, $3, $4)", [hashToken(sessionToken), account.rows[0].id, campaignId, new Date(Date.now() + sessionLifetime)]);
    await client.query("COMMIT");
    clearLoginAttempts(req);
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_master_session", sessionToken, Math.floor(sessionLifetime / 1000)));
    res.json({ ok: true });
  } catch (error) {
    try { if (client) await client.query("ROLLBACK"); } catch {}
    if (error.code === "23505") return res.status(409).json({ error: "Этот логин уже занят" });
    databaseErrorResponse(res, error);
  } finally { if (client) client.release(); }
});

app.get("/api/master/player-invitations", requireMaster, async (_req, res) => {
  try {
    const result = await queryWithRetry(
      "SELECT token_hash AS id, display_name, expires_at, created_at FROM player_invitations WHERE campaign_id = $1 AND expires_at > NOW() ORDER BY created_at DESC",
      [req.master.campaign_id]
    );
    res.json(result.rows);
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/master/player-invitations", requireMaster, async (req, res) => {
  const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  try {
    await queryWithRetry(
      "INSERT INTO player_invitations (token_hash, display_name, expires_at, campaign_id) VALUES ($1, $2, $3, $4)",
      [hashToken(token), displayName, expiresAt, req.master.campaign_id]
    );
    res.json({ token, displayName, expiresAt });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.delete("/api/master/player-invitations/:id", requireMaster, async (req, res) => {
  try {
    await queryWithRetry("DELETE FROM player_invitations WHERE token_hash = $1 AND campaign_id = $2", [req.params.id, req.master.campaign_id]);
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.patch("/api/master/player-accounts/:id", requireMaster, async (req, res) => {
  try {
    await queryWithRetry(
      "UPDATE player_accounts SET enabled = $1, updated_at = NOW() WHERE id = $2 AND campaign_id = $3",
      [req.body?.enabled === true, req.params.id, req.master.campaign_id]
    );
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

const imageExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
function hasValidImageSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

app.get("/api/master/images", requireMaster, async (req, res) => {
  try {
    const result = await queryWithRetry("SELECT id, original_name, title, category, mime_type, size_bytes, created_at, '/uploads/images/' || filename AS url FROM media_assets WHERE campaign_id = $1 ORDER BY created_at DESC", [req.master.campaign_id]);
    res.json(result.rows);
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/master/images", requireMaster, express.raw({ type: Object.keys(imageExtensions), limit: "10mb" }), async (req, res) => {
  const extension = imageExtensions[req.headers["content-type"]];
  if (!extension || !Buffer.isBuffer(req.body) || !req.body.length || !hasValidImageSignature(req.body, req.headers["content-type"])) return res.status(400).json({ error: "Поддерживаются настоящие JPG, PNG, WebP и GIF до 10 МБ" });
  const id = crypto.randomUUID();
  const filename = `${id}${extension}`;
  const originalName = decodeURIComponent(String(req.headers["x-file-name"] || "image").slice(0, 240));
  const title = decodeURIComponent(String(req.headers["x-image-title"] || originalName).slice(0, 240));
  const category = String(req.headers["x-image-category"] || "other").slice(0, 40);
  try {
    await fs.promises.writeFile(path.join(uploadsDirectory, filename), req.body);
    await queryWithRetry("INSERT INTO media_assets (id, filename, original_name, title, category, mime_type, size_bytes, campaign_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, filename, originalName, title, category, req.headers["content-type"], req.body.length, req.master.campaign_id]);
    res.json({ id, original_name: originalName, title, category, mime_type: req.headers["content-type"], size_bytes: req.body.length, url: `/uploads/images/${filename}` });
  } catch (error) {
    await fs.promises.rm(path.join(uploadsDirectory, filename), { force: true }).catch(() => {});
    databaseErrorResponse(res, error);
  }
});

app.delete("/api/master/images/:id", requireMaster, async (req, res) => {
  try {
    const result = await queryWithRetry("DELETE FROM media_assets WHERE id = $1 AND campaign_id = $2 RETURNING filename", [req.params.id, req.master.campaign_id]);
    if (result.rows[0]) await fs.promises.rm(path.join(uploadsDirectory, result.rows[0].filename), { force: true });
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.put("/api/master/player-accounts/:characterId", requireMaster, async (req, res) => {
  const characterId = req.params.characterId;
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const displayName = String(req.body?.displayName || "").trim();
  const enabled = req.body?.enabled !== false;
  if (!username || (!/^[a-z0-9_.-]{3,40}$/i.test(username))) {
    return res.status(400).json({ error: "Логин: 3–40 латинских символов, цифр, точек, дефисов или подчёркиваний" });
  }
  try {
    const state = await loadState(req.master.campaign_id);
    if (!state?.characters?.some(character => character.id === characterId)) return res.status(404).json({ error: "Персонаж не найден в вашей кампании" });
    const existing = await queryWithRetry("SELECT id FROM player_accounts WHERE character_id = $1 AND campaign_id = $2", [characterId, req.master.campaign_id]);
    if (!existing.rowCount && password.length < 6) return res.status(400).json({ error: "Для нового входа нужен пароль минимум из 6 символов" });
    if (password) {
      const credentials = await hashPassword(password);
      await queryWithRetry(
        `INSERT INTO player_accounts (username, password_hash, password_salt, character_id, display_name, enabled, campaign_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (character_id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash,
         password_salt = EXCLUDED.password_salt, display_name = EXCLUDED.display_name, enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [username, credentials.hash, credentials.salt, characterId, displayName, enabled, req.master.campaign_id]
      );
    } else {
      await queryWithRetry(
        "UPDATE player_accounts SET username = $1, display_name = $2, enabled = $3, updated_at = NOW() WHERE character_id = $4 AND campaign_id = $5",
        [username, displayName, enabled, characterId, req.master.campaign_id]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Этот логин уже занят другим игроком" });
    databaseErrorResponse(res, error);
  }
});

app.delete("/api/master/player-accounts/:characterId", requireMaster, async (req, res) => {
  try {
    await queryWithRetry("DELETE FROM player_accounts WHERE character_id = $1 AND campaign_id = $2", [req.params.characterId, req.master.campaign_id]);
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/player/login", loginRateLimit, async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  try {
    const result = await queryWithRetry("SELECT * FROM player_accounts WHERE username = $1 AND enabled = TRUE", [username]);
    const account = result.rows[0];
    if (!account || !(await verifyPassword(password, account.password_salt, account.password_hash))) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    await queryWithRetry("DELETE FROM player_sessions WHERE expires_at <= NOW()");
    await queryWithRetry(
      "INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(token), account.id, new Date(Date.now() + sessionLifetime)]
    );
    clearLoginAttempts(req);
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_player_session", encodeURIComponent(token), sessionLifetime / 1000));
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/player/register", loginRateLimit, async (req, res) => {
  const token = String(req.body?.token || "");
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const requestedName = String(req.body?.displayName || "").trim().slice(0, 120);
  if (!/^[a-z0-9_.-]{3,40}$/i.test(username)) {
    return res.status(400).json({ error: "Логин: 3–40 латинских символов, цифр, точек, дефисов или подчёркиваний" });
  }
  if (password.length < 6) return res.status(400).json({ error: "Пароль должен содержать минимум 6 символов" });
  let client;
  try {
    client = await connectWithRetry();
    await client.query("BEGIN");
    const inviteResult = await client.query(
      "SELECT * FROM player_invitations WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE",
      [hashToken(token)]
    );
    const invitation = inviteResult.rows[0];
    if (!invitation) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Приглашение недействительно или уже использовано" });
    }
    const stateResult = await client.query("SELECT data FROM campaign_states WHERE campaign_id = $1 FOR UPDATE", [invitation.campaign_id]);
    const state = stateResult.rows[0]?.data;
    if (!state) throw new Error("Campaign state is not initialized");
    const displayName = requestedName || invitation.display_name || username;
    const characterId = crypto.randomUUID();
    await client.query("INSERT INTO campaign_state_backups (campaign_id, data) SELECT campaign_id, data FROM campaign_states WHERE campaign_id = $1", [invitation.campaign_id]);
    const character = {
      id: characterId, kind: "player", name: "Новый персонаж", player: displayName,
      packId: state.packs?.[0]?.id || "", group: state.packs?.[0]?.name || "",
      className: "", race: "", background: "", alignment: "", level: 1, xp: 0,
      hp: 10, maxHp: 10, tempHp: 0, ac: 10, speed: 30, gold: 0,
      hitDieType: 8, hitDiceTotal: 1, usedHitDice: 0,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProficiencies: [], skillProficiencies: [], skillExpertise: [],
      spellAbility: "int", spellSlots: Array.from({ length: 9 }, (_, index) => ({ level: index + 1, max: 0, used: 0 })),
      spells: [], featureCards: [], attackCards: [], traitCards: {}, personalInventory: [],
      playerAccessEnabled: true
    };
    state.characters ||= [];
    state.characters.push(character);
    const credentials = await hashPassword(password);
    const accountResult = await client.query(
      `INSERT INTO player_accounts (username, password_hash, password_salt, character_id, display_name, enabled, campaign_id)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
      [username, credentials.hash, credentials.salt, characterId, displayName, invitation.campaign_id]
    );
    await client.query("UPDATE campaign_states SET data = $1, updated_at = NOW() WHERE campaign_id = $2", [state, invitation.campaign_id]);
    await client.query("DELETE FROM player_invitations WHERE token_hash = $1", [hashToken(token)]);
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    await client.query(
      "INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(sessionToken), accountResult.rows[0].id, new Date(Date.now() + sessionLifetime)]
    );
    await client.query("COMMIT");
    clearLoginAttempts(req);
    broadcastStateChanged();
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_player_session", sessionToken, Math.floor(sessionLifetime / 1000)));
    res.json({ ok: true });
  } catch (error) {
    try { if (client) await client.query("ROLLBACK"); } catch {}
    if (error.code === "23505") return res.status(409).json({ error: "Этот логин уже занят" });
    databaseErrorResponse(res, error);
  } finally {
    if (client) client.release();
  }
});

app.post("/api/player/logout", async (req, res) => {
  try {
    const token = parseCookies(req).dnd_player_session;
    if (token) await queryWithRetry("DELETE FROM player_sessions WHERE token_hash = $1", [hashToken(token)]);
    res.setHeader("Set-Cookie", sessionCookie(req, "dnd_player_session", "", 0));
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/player/data", requirePlayer, async (req, res) => {
  try {
    const state = await loadState(req.player.campaign_id);
    const character = state?.characters?.find(item => item.id === req.player.character_id);
    if (!character || character.playerAccessEnabled !== true) return res.status(403).json({ error: "Мастер пока не открыл доступ к листу" });
    const notesResult = await queryWithRetry("SELECT body FROM player_notes WHERE player_id = $1", [req.player.id]);
    res.json({
      account: { username: req.player.username, displayName: req.player.display_name },
      character: publicCharacter(character),
      lore: (state.lore || []).filter(item => item.visibleToPlayers === true || item.visibleToCharacterIds?.includes(req.player.character_id)),
      shops: (state.shops || []).filter(item => item.visibleToPlayers === true || item.visibleToCharacterIds?.includes(req.player.character_id)).map(shop => ({ ...shop, visibleToPlayers: undefined, visibleToCharacterIds: undefined })),
      notes: notesResult.rows[0]?.body || ""
    });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.get("/api/player/combat", requirePlayer, async (req, res) => {
  try {
    res.json(publicCombatForPlayer(await loadState(req.player.campaign_id), req.player.character_id));
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.post("/api/player/combat/end-turn", requirePlayer, async (req, res) => {
  try {
    const combat = await updateCombatAsPlayer(req.player, (state, characterId) => {
      const current = state.combat?.participants?.[state.combat.turnIndex];
      if (!state.combat?.active || current?.characterId !== characterId) {
        const error = new Error("Сейчас не ваш ход");
        error.status = 403;
        throw error;
      }
      state.combat.turnIndex++;
      if (state.combat.turnIndex >= state.combat.participants.length) {
        state.combat.turnIndex = 0;
        state.combat.round = Number(state.combat.round || 1) + 1;
      }
      return publicCombatForPlayer(state, characterId);
    });
    res.json(combat);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseErrorResponse(res, error);
  }
});

app.post("/api/player/combat/death-save", requirePlayer, async (req, res) => {
  const result = req.body?.result;
  if (!["success", "failure"].includes(result)) return res.status(400).json({ error: "Укажите успех или провал" });
  try {
    const combat = await updateCombatAsPlayer(req.player, (state, characterId) => {
      const participant = state.combat?.participants?.find(item => item.characterId === characterId);
      const character = state.characters?.find(item => item.id === characterId);
      const current = state.combat?.participants?.[state.combat.turnIndex];
      if (!state.combat?.active || !participant || current?.characterId !== characterId || Number(participant.hp || 0) > 0) {
        const error = new Error("Спасбросок можно отметить только при 0 HP в свой ход");
        error.status = 403;
        throw error;
      }
      if (Number(participant.lastDeathSaveRound || 0) === Number(state.combat.round || 1)) {
        const error = new Error("Спасбросок этого хода уже отмечен");
        error.status = 403;
        throw error;
      }
      const key = result === "success" ? "deathSuccesses" : "deathFailures";
      participant[key] = Math.min(3, Number(participant[key] || 0) + 1);
      participant.lastDeathSaveRound = Number(state.combat.round || 1);
      if (character) character[key] = participant[key];
      return publicCombatForPlayer(state, characterId);
    });
    res.json(combat);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseErrorResponse(res, error);
  }
});

app.post("/api/player/heal", requirePlayer, async (req, res) => {
  try {
    const result = await updateCombatAsPlayer(req.player, (state, characterId) => {
      const character = state.characters?.find(item => item.id === characterId);
      if (!character || character.playerAccessEnabled !== true) {
        const error = new Error("Доступ к листу закрыт");
        error.status = 403;
        throw error;
      }
      const legacyDie = Number(String(character.hitDice || "").match(/\d+/)?.[0]);
      const die = [6, 8, 10, 12].includes(Number(character.hitDieType)) ? Number(character.hitDieType) : [6, 8, 10, 12].includes(legacyDie) ? legacyDie : 8;
      const total = Math.max(0, Number(character.hitDiceTotal ?? character.level ?? 1));
      const used = Math.max(0, Number(character.usedHitDice || 0));
      if (used >= total) {
        const error = new Error("Доступные кости хитов закончились");
        error.status = 400;
        throw error;
      }
      if (Number(character.hp || 0) >= Number(character.maxHp || 0)) {
        const error = new Error("Здоровье уже максимальное");
        error.status = 400;
        throw error;
      }
      const roll = crypto.randomInt(1, die + 1);
      const constitution = Math.floor((clampNumber(character.abilities?.con ?? 10, 1, 30) - 10) / 2);
      const healing = Math.max(1, roll + constitution);
      character.hp = Math.min(Number(character.maxHp || 0), Math.max(0, Number(character.hp || 0)) + healing);
      character.hitDieType = die;
      character.hitDiceTotal = total;
      character.usedHitDice = used + 1;
      character.deathSuccesses = 0;
      character.deathFailures = 0;
      const participant = state.combat?.participants?.find(item => item.characterId === characterId);
      if (participant) {
        participant.hp = character.hp;
        participant.maxHp = character.maxHp;
        participant.deathSuccesses = 0;
        participant.deathFailures = 0;
        participant.lastDeathSaveRound = 0;
      }
      return { ok: true, roll, die, constitution, healing, character: publicCharacter(character), combat: publicCombatForPlayer(state, characterId) };
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseErrorResponse(res, error);
  }
});

app.put("/api/player/character", requirePlayer, async (req, res) => {
  let client;
  try {
    client = await connectWithRetry();
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM campaign_states WHERE campaign_id = $1 FOR UPDATE", [req.player.campaign_id]);
    const state = result.rows[0]?.data;
    const index = state?.characters?.findIndex(item => item.id === req.player.character_id);
    if (index == null || index < 0 || state.characters[index].playerAccessEnabled !== true) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Доступ к листу закрыт" });
    }
    Object.assign(state.characters[index], sanitizePlayerCharacterUpdate(req.body));
    state.characters[index].maxHp = Math.max(0, Number(state.characters[index].maxHp || 0));
    state.characters[index].hp = clampNumber(state.characters[index].hp, 0, state.characters[index].maxHp);
    await client.query("INSERT INTO campaign_state_backups (campaign_id, data) VALUES ($1, $2)", [req.player.campaign_id, result.rows[0].data]);
    await client.query("UPDATE campaign_states SET data = $1, updated_at = NOW() WHERE campaign_id = $2", [state, req.player.campaign_id]);
    await client.query("COMMIT");
    broadcastStateChanged();
    res.json({ ok: true, character: publicCharacter(state.characters[index]) });
  } catch (error) {
    try { if (client) await client.query("ROLLBACK"); } catch {}
    databaseErrorResponse(res, error);
  } finally {
    if (client) client.release();
  }
});

app.put("/api/player/notes", requirePlayer, async (req, res) => {
  const body = String(req.body?.body || "").slice(0, 100000);
  try {
    await queryWithRetry(
      `INSERT INTO player_notes (player_id, body, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (player_id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
      [req.player.id, body]
    );
    res.json({ ok: true });
  } catch (error) {
    databaseErrorResponse(res, error);
  }
});

app.use((error, req, res, next) => {
  console.error(`[HTTP] ${req.method} ${req.originalUrl}:`, error);
  if (res.headersSent) return next(error);
  const status = error.type === "entity.too.large" ? 413 : 500;
  res.status(status).json({ error: status === 413 ? "Request is too large" : "Internal server error" });
});

let httpServer;
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[Server] Shutting down...");

  const forceExit = setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout.");
    process.exit(exitCode || 1);
  }, 8000);
  forceExit.unref();

  for (const stream of masterEventStreams) closeEventStream(stream, masterEventStreams);
  for (const stream of playerEventStreams) closeEventStream(stream, playerEventStreams);

  try {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    await pool.end();
  } catch (error) {
    console.error("[Server] Error during shutdown:", error);
    exitCode = exitCode || 1;
  }
  process.exit(exitCode);
}

async function startServer() {
  await initializeDatabase();
  httpServer = app.listen(port, host, () => {
    setTimeout(() => {
      if (!httpServer?.listening || shuttingDown) return;
      console.log(`D&D Archive: http://localhost:${port}`);
      if (!process.env.MASTER_PASSWORD) console.warn("[Безопасность] Используется временный пароль мастера: master. Задайте MASTER_PASSWORD в .env.");
    }, 100);
  });
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 70000;
  httpServer.requestTimeout = 120000;
  httpServer.on("clientError", (error, socket) => {
    console.warn(`[HTTP] Broken client connection: ${error.code || error.message}`);
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });
  httpServer.on("error", error => {
    if (error.code === "EADDRINUSE") {
      console.error(`[Server] Port ${port} is already in use. The site is probably already running.`);
      shutdown(98);
      return;
    }
    console.error("[Server] HTTP server error:", error);
    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("unhandledRejection", reason => {
  console.error("[Server] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", error => {
  console.error("[Server] Uncaught exception:", error);
  shutdown(1);
});

startServer().catch(error => {
  console.error("Не удалось подключиться к PostgreSQL:", error.message);
  console.error("Сначала выполните: npm run setup:db");
  process.exit(1);
});
