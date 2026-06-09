const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
localStorage.removeItem("dnd-archive");

const abilities = [["str", "Сила"], ["dex", "Ловкость"], ["con", "Телосложение"], ["int", "Интеллект"], ["wis", "Мудрость"], ["cha", "Харизма"]];
const skills = [["acrobatics","Акробатика","dex"],["animalHandling","Уход за животными","wis"],["arcana","Магия","int"],["athletics","Атлетика","str"],["deception","Обман","cha"],["history","История","int"],["insight","Проницательность","wis"],["intimidation","Запугивание","cha"],["investigation","Анализ","int"],["medicine","Медицина","wis"],["nature","Природа","int"],["perception","Внимательность","wis"],["performance","Выступление","cha"],["persuasion","Убеждение","cha"],["religion","Религия","int"],["sleightOfHand","Ловкость рук","dex"],["stealth","Скрытность","dex"],["survival","Выживание","wis"]];
let character = null;
let spells = [];
let inventoryItems = [];
let featureCards = [];
let attackCards = [];
let traitCards = {};
let dirty = false;
let combatState = { active: false };
let playerEvents = null;

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const setStatus = text => $("#sync-status").textContent = text;
const markDirty = () => { dirty = true; setStatus("Есть несохранённые изменения"); };
const signed = value => `${value >= 0 ? "+" : ""}${value}`;
const modifier = score => Math.floor((Number(score || 10) - 10) / 2);
const proficiency = level => Math.ceil(Math.max(1, Number(level || 1)) / 4) + 1;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || (response.status === 404 ? "Сервер ещё не обновлён. Перезапустите npm.cmd start." : `Ошибка сервера (${response.status})`));
  return data;
}

function renderSpells() {
  $("#player-spells").innerHTML = spells.length ? spells.map((spell, index) => `
    <article class="spell-card" data-spell="${index}">
      <div class="spell-card-top">
        <label class="spell-prepared"><input data-field="prepared" type="checkbox" ${spell.prepared ? "checked" : ""}> Подготовлено</label>
        <label class="spell-name">Название<input data-field="name" value="${escapeHtml(spell.name)}" placeholder="Название заклинания"></label>
        <label>Уровень<select data-field="level">${Array.from({ length: 10 }, (_, level) => `<option value="${level}" ${Number(spell.level) === level ? "selected" : ""}>${level === 0 ? "Заговор" : level}</option>`).join("")}</select></label>
        <label>Школа<input data-field="school" value="${escapeHtml(spell.school || "")}" placeholder="Воплощение"></label>
        <button type="button" class="danger" data-delete-spell="${index}">Удалить</button>
      </div>
      <div class="spell-meta">
        <label>Время накладывания<input data-field="castingTime" value="${escapeHtml(spell.castingTime || "")}" placeholder="1 действие"></label>
        <label>Дистанция<input data-field="range" value="${escapeHtml(spell.range || "")}" placeholder="18 метров"></label>
        <label>Компоненты<input data-field="components" value="${escapeHtml(spell.components || "")}" placeholder="В, С, М"></label>
        <label>Длительность<input data-field="duration" value="${escapeHtml(spell.duration || "")}" placeholder="Мгновенная"></label>
        <label class="spell-ritual"><input data-field="ritual" type="checkbox" ${spell.ritual ? "checked" : ""}> Ритуал</label>
        <label class="spell-concentration"><input data-field="concentration" type="checkbox" ${spell.concentration ? "checked" : ""}> Концентрация</label>
      </div>
      <label class="spell-description">Описание и эффект
        <textarea data-field="description" placeholder="Эффект, спасбросок, урон на больших уровнях и остальные подробности...">${escapeHtml(spell.description || "")}</textarea>
      </label>
    </article>`).join("") : "<p class='empty'>В гримуаре пока нет заклинаний.</p>";
}

function renderInventory() {
  $("#player-inventory").innerHTML = inventoryItems.length ? inventoryItems.map((item, index) => `
    <article class="inventory-card ${item.magic ? "is-magic" : ""}" data-inventory-item="${index}">
      <div class="inventory-card-head">
        <label class="inventory-name">Название предмета<input data-field="name" value="${escapeHtml(item.name || "")}" placeholder="Название"></label>
        <label>Категория<input data-field="category" value="${escapeHtml(item.category || "")}" placeholder="Артефакт, оружие, зелье..."></label>
        <label>Количество<input data-field="quantity" type="number" min="0" value="${Number(item.quantity ?? 1)}"></label>
      </div>
      <div class="inventory-flags">
        <label><input data-field="magic" type="checkbox" ${item.magic ? "checked" : ""}> Магический предмет</label>
        <label><input data-field="equipped" type="checkbox" ${item.equipped ? "checked" : ""}> Экипировано</label>
      </div>
      <label>Свойства и правила<textarea data-field="properties" placeholder="Бонусы, заряды, настройка, ограничения...">${escapeHtml(item.properties || "")}</textarea></label>
      <label>Описание и история<textarea data-field="description" placeholder="Как выглядит предмет, откуда он появился и что о нём известно...">${escapeHtml(item.description || "")}</textarea></label>
      <button type="button" class="danger" data-delete-inventory-item="${index}">Удалить предмет</button>
    </article>`).join("") : "<p class='empty'>Инвентарь пока пуст. Добавьте первый предмет или артефакт.</p>";
}

function renderFeatures() {
  $("#player-feature-cards").innerHTML = featureCards.length ? featureCards.map((feature, index) => feature._editing ? `
    <article class="feature-card-editor editing" data-player-feature="${index}">
      <div class="feature-card-title">
        <input data-field="name" value="${escapeHtml(feature.name || "")}" placeholder="Название способности">
        <button type="button" class="danger" data-delete-player-feature="${index}">Удалить</button>
      </div>
      <textarea data-field="description" placeholder="Описание, правила и ограничения способности">${escapeHtml(feature.description || "")}</textarea>
      <button type="button" class="feature-save-button" data-save-player-feature="${index}">Сохранить способность</button>
    </article>` : `
    <article class="feature-card-view" data-player-feature="${index}">
      <button type="button" class="feature-edit-button" data-edit-player-feature="${index}" title="Редактировать способность" aria-label="Редактировать способность">✎</button>
      <h4>${escapeHtml(feature.name || "Без названия")}</h4>
      <div>${window.RichText.render(feature.description || "", escapeHtml) || "<span class='feature-empty-description'>Описание не заполнено</span>"}</div>
    </article>`).join("") : "<p class='empty'>Добавьте первую способность персонажа.</p>";
  window.RichText.enhance($("#player-feature-cards"));
}

function renderCharacterCards() {
  $("#player-attack-cards").innerHTML=attackCards.map((item,index)=>item._editing?`<article class="feature-card-editor weapon-card-editor" data-player-attack="${index}"><div class="weapon-fields"><input data-field="name" value="${escapeHtml(item.name||"")}" placeholder="Название оружия"><input data-field="damageDie" value="${escapeHtml(item.damageDie||"")}" placeholder="Кость: 1d8"><label><input data-field="proficient" type="checkbox" ${item.proficient?"checked":""}> Владение</label></div><textarea data-field="description" placeholder="Описание оружия">${escapeHtml(item.description||"")}</textarea><div class="card-edit-actions"><button type="button" class="danger" data-delete-player-attack="${index}">Удалить</button><button type="button" class="feature-save-button" data-save-player-attack="${index}">Сохранить оружие</button></div></article>`:`<article class="feature-card-view weapon-card-view"><button type="button" class="feature-edit-button" data-edit-player-attack="${index}">✎</button><h4>${escapeHtml(item.name||"Без названия")}</h4><div class="weapon-badges"><b>${escapeHtml(item.damageDie||"Без кости")}</b>${item.proficient?"<b>Владение</b>":""}</div><div>${window.RichText.render(item.description||"",escapeHtml)}</div></article>`).join("")||"<p class='empty'>Добавьте первое оружие.</p>";
  ["personality","ideals","bonds","flaws"].forEach(key=>{const container=$(`[data-player-trait-cards="${key}"]`);container.innerHTML=(traitCards[key]||[]).map((item,index)=>item._editing?`<article class="feature-card-editor" data-player-trait="${key}:${index}"><div class="feature-card-title"><input data-field="name" value="${escapeHtml(item.name||"")}" placeholder="Название"><button type="button" class="danger" data-delete-player-trait="${key}:${index}">Удалить</button></div><textarea data-field="description" placeholder="Описание">${escapeHtml(item.description||"")}</textarea><button type="button" class="feature-save-button" data-save-player-trait="${key}:${index}">Сохранить</button></article>`:`<article class="feature-card-view"><button type="button" class="feature-edit-button" data-edit-player-trait="${key}:${index}">✎</button><h4>${escapeHtml(item.name||"Без названия")}</h4><div>${window.RichText.render(item.description||"",escapeHtml)}</div></article>`).join("")||"<p class='empty'>Карточек пока нет.</p>";});
  window.RichText.enhance();
}

function parseJournal(rawNotes) {
  const fallback = { knowledge: "", memories: "", goals: "", notes: rawNotes || "" };
  if (!rawNotes) return fallback;
  try {
    const parsed = JSON.parse(rawNotes);
    if (!parsed || typeof parsed !== "object" || parsed.version !== 2) return fallback;
    return { knowledge: parsed.knowledge || "", memories: parsed.memories || "", goals: parsed.goals || "", notes: parsed.notes || "" };
  } catch {
    return fallback;
  }
}

function renderShops(shops = []) {
  $("#player-shops").innerHTML = shops.length ? shops.map(shop => `
    <details class="player-shop ${escapeHtml(shop.status || "open")}">
      <summary><span>${escapeHtml(shop.status || "открыт")}</span><h3>${escapeHtml(shop.name || "Торговец")}</h3><small>${escapeHtml(shop.locationName || "")}</small></summary>
      ${shop.description ? `<p>${escapeHtml(shop.description)}</p>` : ""}
      <div class="player-shop-table">${(shop.items || []).map(item => `<article class="${item.sold ? "sold" : ""}"><strong>${escapeHtml(item.name)}</strong><b>${escapeHtml(item.price)}</b><small>${escapeHtml(item.quantity)}</small><p>${escapeHtml(item.description)}</p></article>`).join("") || "<p class='empty'>Товары пока не выставлены.</p>"}</div>
    </details>`).join("") : "<p class='empty'>Сейчас доступных торговцев нет.</p>";
}

function renderDerivedStats() {
  const form = $("#sheet-page");
  const level = Number(form.elements.level?.value || 1);
  const prof = proficiency(level);
  const scores = Object.fromEntries(abilities.map(([key]) => [key, Math.max(1, Math.min(30, Number(form.elements[`ability-${key}`]?.value || 10)))]));
  abilities.forEach(([key]) => {
    const output = $(`[data-player-ability-mod="${key}"]`);
    if (output) output.textContent = signed(modifier(scores[key]));
    const save = $(`[data-player-save-value="${key}"]`);
    if (save) save.textContent = signed(modifier(scores[key]) + (form.elements[`save-${key}`]?.checked ? prof : 0));
  });
  skills.forEach(([key,, ability]) => {
    const output = $(`[data-player-skill-value="${key}"]`);
    if (!output) return;
    const trained = form.elements[`skill-${key}`]?.checked;
    const expert = form.elements[`expertise-${key}`]?.checked;
    output.textContent = signed(modifier(scores[ability]) + (expert ? prof * 2 : trained ? prof : 0));
  });
  $("#player-prof").textContent = signed(prof);
  $("#player-initiative").textContent = signed(modifier(scores.dex));
  const perception = form.elements["skill-perception"]?.checked;
  const perceptionExpertise = form.elements["expertise-perception"]?.checked;
  $("#player-passive").textContent = 10 + modifier(scores.wis) + (perceptionExpertise ? prof * 2 : perception ? prof : 0);
  const spellAbility = $("#spell-ability")?.value || "int";
  $("#player-spell-save-dc").textContent = 8 + prof + modifier(scores[spellAbility]);
  $("#player-spell-attack").textContent = signed(prof + modifier(scores[spellAbility]));
}

function renderCombat(combat) {
  combatState = combat || { active: false };
  const dock = $("#combat-dock");
  dock.classList.toggle("hidden", !combatState.active);
  ["hp", "maxHp", "tempHp", "deathSuccesses", "deathFailures"].forEach(name => {
    const input = $("#sheet-page").elements[name];
    if (input) input.disabled = true;
  });
  if (!combatState.active) return;
  const self = combatState.participants.find(item => item.isSelf);
  const current = combatState.participants.find(item => item.isCurrent);
  if (self) {
    character.hp = self.hp;
    character.maxHp = self.maxHp;
    $("#sheet-page").elements.hp.value = self.hp;
    $("#sheet-page").elements.maxHp.value = self.maxHp;
    $("#sheet-page").elements.deathSuccesses.value = self.deathSuccesses || 0;
    $("#sheet-page").elements.deathFailures.value = self.deathFailures || 0;
    const available = Math.max(0, Number(character.hitDiceTotal ?? character.level ?? 1) - Number(character.usedHitDice || 0));
    $("#heal-with-hit-die").disabled = available <= 0 || self.hp >= self.maxHp;
  }
  $("#combat-round").textContent = `Раунд ${combatState.round}`;
  $("#combat-turn-title").textContent = current?.isSelf ? "Сейчас твой ход" : `Ходит: ${current?.name || "—"}`;
  $("#combat-order").innerHTML = combatState.participants.map(item => {
    const percent = item.maxHp > 0 ? Math.max(0, Math.min(100, item.hp / item.maxHp * 100)) : 0;
    return `<article class="${item.isCurrent ? "active" : ""} ${item.isSelf ? "self" : ""}">
      <b>${escapeHtml(item.name)}</b><span>${item.initiative}</span>
      <div class="combat-hp"><i style="width:${percent}%"></i></div><small>${item.hp} / ${item.maxHp} HP</small>
    </article>`;
  }).join("");
  $("#end-player-turn").classList.toggle("hidden", !current?.isSelf);
  $("#player-death-saves").classList.toggle("hidden", !self || self.hp > 0);
  if (self) {
    $("#player-death-saves strong").textContent = `Спасброски: ${"●".repeat(self.deathSuccesses || 0)}${"○".repeat(3 - (self.deathSuccesses || 0))} успехи · ${"●".repeat(self.deathFailures || 0)}${"○".repeat(3 - (self.deathFailures || 0))} провалы`;
    $$("#player-death-saves [data-death-save]").forEach(button => button.disabled = !self.canMarkDeathSave);
  }
}

async function loadCombat() {
  try { renderCombat(await api("/api/player/combat")); } catch {}
}

async function receivePlayerUpdate() {
  await loadCombat();
  if (dirty || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  try { render(await api("/api/player/data")); setStatus("Получены изменения мастера"); } catch {}
}

function render(data) {
  character = data.character;
  spells = structuredClone(character.spells || []);
  inventoryItems = structuredClone(character.personalInventory || []);
  featureCards = structuredClone(character.featureCards || (character.features ? [{ name: "Общие умения и особенности", description: character.features }] : [])).map(feature => ({ ...feature, _editing: false }));
  attackCards=structuredClone(character.attackCards||(character.attacks?[{name:"Общие атаки",damageDie:"",proficient:false,description:character.attacks}]:[])).map(item=>({...item,_editing:false}));
  traitCards=Object.fromEntries(["personality","ideals","bonds","flaws"].map(key=>[key,structuredClone(character.traitCards?.[key]||(character[key]?[{name:"Общее",description:character[key]}]:[])).map(item=>({...item,_editing:false}))]));
  $("#character-title").textContent = character.name || "Персонаж";
  $("#player-portrait").src = character.portraitUrl || "";
  $("#player-portrait").classList.toggle("visible", Boolean(character.portraitUrl));
  const form = $("#sheet-page");
  ["name","className","level","race","background","alignment","xp","ac","speed","hp","maxHp","tempHp","gold","cp","sp","ep","pp","deathSuccesses","deathFailures","equipment","proficiencies"].forEach(key => {
    if (form.elements[key]) form.elements[key].value = character[key] ?? "";
  });
  form.elements.inspiration.checked = character.inspiration === true;
  $("#abilities").innerHTML = abilities.map(([key, label]) => {
    const score = Number(character.abilities?.[key] ?? 10);
    const modifier = Math.floor((score - 10) / 2);
    return `<label class="ability-box"><span>${label}</span><strong data-player-ability-mod="${key}">${modifier >= 0 ? "+" : ""}${modifier}</strong><input name="ability-${key}" type="number" min="1" max="30" value="${score}"></label>`;
  }).join("");
  $("#player-saves").innerHTML = abilities.map(([key, label]) => `<label><input name="save-${key}" type="checkbox" ${(character.saveProficiencies || []).includes(key) ? "checked" : ""}><b data-player-save-value="${key}">+0</b><span>${label}</span></label>`).join("");
  $("#player-skills").innerHTML = abilities.map(([ability, label]) => `<section class="sheet-skill-group"><h5>${label}</h5>${skills.filter(item => item[2] === ability).map(([key, skill]) => `<label><input name="skill-${key}" type="checkbox" ${(character.skillProficiencies || []).includes(key) ? "checked" : ""}><b data-player-skill-value="${key}">+0</b><span>${skill}</span><input class="expertise-check" name="expertise-${key}" type="checkbox" ${(character.skillExpertise || []).includes(key) ? "checked" : ""} title="Экспертиза"></label>`).join("")}</section>`).join("");
  const hitDiceTotal = Math.max(0, Number(character.hitDiceTotal ?? character.level ?? 1));
  const usedHitDice = Math.max(0, Number(character.usedHitDice || 0));
  $("#hit-dice-status").textContent = `${Math.max(0, hitDiceTotal - usedHitDice)} из ${hitDiceTotal} костей d${Number(character.hitDieType || 8)} доступно`;
  $("#heal-with-hit-die").disabled = usedHitDice >= hitDiceTotal || Number(character.hp || 0) >= Number(character.maxHp || 0);
  $("#spell-class").value = character.spellcastingClass || "";
  $("#spell-ability").value = character.spellAbility || "int";
  $("#spell-notes").value = character.spellNotes || "";
  $("#player-spell-slots").innerHTML = Array.from({ length: 9 }, (_, index) => {
    const slot = character.spellSlots?.find(item => Number(item.level) === index + 1) || {};
    return `<div class="slot-card"><strong>${index + 1}</strong><span>уровень</span><label>Всего<input data-slot-max="${index + 1}" type="number" min="0" value="${Number(slot.max || 0)}"></label><label>Использовано<input data-slot-used="${index + 1}" type="number" min="0" value="${Number(slot.used || 0)}"></label></div>`;
  }).join("");
  const journal = parseJournal(data.notes);
  $("#journal-knowledge").value = journal.knowledge;
  $("#journal-memories").value = journal.memories;
  $("#journal-goals").value = journal.goals;
  $("#personal-notes").value = journal.notes;
  $("#public-lore").innerHTML = data.lore.length ? data.lore.map(item => `<article class="lore-card">${item.images?.length ? `<div class="player-lore-images">${item.images.map(image => `<a href="${escapeHtml(image.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.title || item.title)}"></a>`).join("")}</div>` : ""}<span>${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3>${item.ideology ? `<strong>${window.RichText.render(item.ideology, escapeHtml)}</strong>` : ""}<p>${window.RichText.render(item.text, escapeHtml)}</p></article>`).join("") : "<p class='empty'>Мастер пока ничего не опубликовал.</p>";
  renderSpells();
  renderInventory();
  renderFeatures();
  renderCharacterCards();
  window.RichText.enhance();
  renderShops(data.shops || []);
  renderDerivedStats();
  dirty = false;
  $("#login-view").classList.add("hidden");
  $("#player-app").classList.remove("hidden");
  if (!playerEvents) {
    playerEvents = new EventSource("/api/player/events");
    playerEvents.addEventListener("state", receivePlayerUpdate);
  }
  loadCombat();
}

async function load() {
  try { render(await api("/api/player/data")); } catch { $("#login-view").classList.remove("hidden"); }
}

async function saveCharacter() {
  const form = $("#sheet-page");
  const update = {};
  ["name","className","race","background","alignment","equipment","proficiencies"].forEach(key => update[key] = form.elements[key].value);
  ["level","xp","ac","speed","gold","cp","sp","ep","pp"].forEach(key => update[key] = Number(form.elements[key].value || 0));
  update.inspiration = form.elements.inspiration.checked;
  update.abilities = Object.fromEntries(abilities.map(([key]) => [key, Math.max(1, Math.min(30, Number(form.elements[`ability-${key}`].value || 10)))]));
  update.saveProficiencies = abilities.filter(([key]) => form.elements[`save-${key}`].checked).map(([key]) => key);
  update.skillProficiencies = skills.filter(([key]) => form.elements[`skill-${key}`].checked).map(([key]) => key);
  update.skillExpertise = skills.filter(([key]) => form.elements[`expertise-${key}`].checked).map(([key]) => key);
  update.spellcastingClass = $("#spell-class").value;
  update.spellAbility = $("#spell-ability").value;
  update.spellNotes = $("#spell-notes").value;
  update.spells = spells;
  update.personalInventory = inventoryItems;
  update.featureCards = featureCards.map(({ name, description }) => ({ name, description }));
  update.attackCards=attackCards.map(({name,damageDie,proficient,description})=>({name,damageDie,proficient,description}));
  update.traitCards=Object.fromEntries(Object.entries(traitCards).map(([key,items])=>[key,items.map(({name,description})=>({name,description}))]));
  update.spellSlots = Array.from({ length: 9 }, (_, index) => ({ level: index + 1, max: Number($(`[data-slot-max="${index + 1}"]`).value || 0), used: Number($(`[data-slot-used="${index + 1}"]`).value || 0) }));
  setStatus("Сохраняем...");
  const result = await api("/api/player/character", { method: "PUT", body: JSON.stringify(update) });
  character = result.character;
  dirty = false;
  setStatus("Сохранено");
}

$("#login-form").onsubmit = async event => {
  event.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/api/player/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    render(await api("/api/player/data"));
  } catch (error) { $("#login-error").textContent = error.message; }
};
$("#logout").onclick = async () => { await api("/api/player/logout", { method: "POST" }); location.reload(); };
$("#save-character").onclick = saveCharacter;
$("#save-notes").onclick = async () => {
  const body = JSON.stringify({ version: 2, knowledge: $("#journal-knowledge").value, memories: $("#journal-memories").value, goals: $("#journal-goals").value, notes: $("#personal-notes").value });
  await api("/api/player/notes", { method: "PUT", body: JSON.stringify({ body }) });
  setStatus("Дневник сохранён");
};
$$("[data-tab]").forEach(button => button.onclick = () => {
  $$("[data-tab]").forEach(item => item.classList.toggle("active", item === button));
  $$(".tab-page").forEach(page => page.classList.toggle("active", page.id === `${button.dataset.tab}-page`));
});
$("#add-player-spell").onclick = () => {
  spells.push({ name: "", level: 0, prepared: false, school: "", castingTime: "", range: "", components: "", duration: "", ritual: false, concentration: false, description: "" });
  markDirty();
  renderSpells();
};
$("#add-inventory-item").onclick = () => {
  inventoryItems.push({ name: "", category: "", quantity: 1, magic: false, equipped: false, properties: "", description: "" });
  markDirty();
  renderInventory();
};
$("#add-player-feature").onclick = () => {
  featureCards.push({ name: "", description: "", _editing: true });
  markDirty();
  renderFeatures();
};
$("#add-player-attack").onclick=()=>{attackCards.push({name:"",damageDie:"",proficient:false,description:"",_editing:true});markDirty();renderCharacterCards();};
$$("[data-add-player-trait]").forEach(button=>button.onclick=()=>{traitCards[button.dataset.addPlayerTrait].push({name:"",description:"",_editing:true});markDirty();renderCharacterCards();});
$("#player-spells").addEventListener("input", event => {
  const card = event.target.closest("[data-spell]");
  if (!card || !event.target.dataset.field) return;
  spells[+card.dataset.spell][event.target.dataset.field] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "number" ? Number(event.target.value) : event.target.value;
  markDirty();
});
$("#player-spells").addEventListener("click", event => {
  if (event.target.dataset.deleteSpell === undefined) return;
  spells.splice(+event.target.dataset.deleteSpell, 1);
  markDirty();
  renderSpells();
});
$("#player-inventory").addEventListener("input", event => {
  const card = event.target.closest("[data-inventory-item]");
  if (!card || !event.target.dataset.field) return;
  inventoryItems[+card.dataset.inventoryItem][event.target.dataset.field] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "number" ? Number(event.target.value) : event.target.value;
  card.classList.toggle("is-magic", Boolean(inventoryItems[+card.dataset.inventoryItem].magic));
  markDirty();
});
$("#player-inventory").addEventListener("click", event => {
  if (event.target.dataset.deleteInventoryItem === undefined) return;
  inventoryItems.splice(+event.target.dataset.deleteInventoryItem, 1);
  markDirty();
  renderInventory();
});
$("#player-feature-cards").addEventListener("input", event => {
  const card = event.target.closest("[data-player-feature]");
  if (!card || !event.target.dataset.field) return;
  featureCards[+card.dataset.playerFeature][event.target.dataset.field] = event.target.value;
  markDirty();
});
$("#player-feature-cards").addEventListener("click", event => {
  if (event.target.dataset.deletePlayerFeature !== undefined) {
    featureCards.splice(+event.target.dataset.deletePlayerFeature, 1);
    markDirty();
    renderFeatures();
  } else if (event.target.dataset.editPlayerFeature !== undefined) {
    featureCards[+event.target.dataset.editPlayerFeature]._editing = true;
    renderFeatures();
  } else if (event.target.dataset.savePlayerFeature !== undefined) {
    const feature = featureCards[+event.target.dataset.savePlayerFeature];
    feature.name = feature.name.trim() || "Без названия";
    feature._editing = false;
    markDirty();
    renderFeatures();
  }
});
$("#player-attack-cards").addEventListener("input",event=>{const card=event.target.closest("[data-player-attack]"),field=event.target.dataset.field;if(card&&field){attackCards[+card.dataset.playerAttack][field]=event.target.type==="checkbox"?event.target.checked:event.target.value;markDirty();}});
$("#player-attack-cards").addEventListener("click",event=>{for(const action of ["edit","save","delete"]){const value=event.target.dataset[`${action}PlayerAttack`];if(value===undefined)continue;if(action==="delete")attackCards.splice(+value,1);else attackCards[+value]._editing=action==="edit";markDirty();renderCharacterCards();break;}});
$$("[data-player-trait-cards]").forEach(container=>{
  container.addEventListener("input",event=>{const card=event.target.closest("[data-player-trait]"),field=event.target.dataset.field;if(card&&field){const[key,index]=card.dataset.playerTrait.split(":");traitCards[key][+index][field]=event.target.value;markDirty();}});
  container.addEventListener("click",event=>{for(const action of ["edit","save","delete"]){const value=event.target.dataset[`${action}PlayerTrait`];if(value===undefined)continue;const[key,index]=value.split(":");if(action==="delete")traitCards[key].splice(+index,1);else traitCards[key][+index]._editing=action==="edit";markDirty();renderCharacterCards();break;}});
});
$("#sheet-page").addEventListener("input", event => {
  if (event.target.name?.startsWith("ability-")) {
    const value = Number(event.target.value);
    if (value > 30) event.target.value = 30;
    if (value < 1) event.target.value = 1;
  }
  if (event.target.name?.startsWith("expertise-") && event.target.checked) {
    const skill = event.target.name.replace("expertise-", "");
    const form = $("#sheet-page");
    if (form.elements[`skill-${skill}`]) form.elements[`skill-${skill}`].checked = true;
  }
  renderDerivedStats();
  markDirty();
});
$("#spells-page").addEventListener("input", markDirty);
$("#spell-ability").addEventListener("change", () => {
  renderDerivedStats();
  markDirty();
});
$("#inventory-page").addEventListener("input", markDirty);
$("#heal-with-hit-die").onclick = async () => {
  try {
    const result = await api("/api/player/heal", { method: "POST", body: "{}" });
    character = result.character;
    $("#sheet-page").elements.hp.value = character.hp;
    $("#sheet-page").elements.deathSuccesses.value = character.deathSuccesses || 0;
    $("#sheet-page").elements.deathFailures.value = character.deathFailures || 0;
    const total = Number(character.hitDiceTotal ?? character.level ?? 1);
    const available = Math.max(0, total - Number(character.usedHitDice || 0));
    $("#hit-dice-status").textContent = `${available} из ${total} костей d${character.hitDieType || 8} доступно`;
    $("#heal-with-hit-die").disabled = available <= 0 || Number(character.hp) >= Number(character.maxHp);
    $("#healing-result").textContent = `d${result.die}: ${result.roll}${result.constitution ? ` ${signed(result.constitution)}` : ""} = лечение ${result.healing}`;
    renderCombat(result.combat);
  } catch (error) {
    $("#healing-result").textContent = error.message;
  }
};
$("#combat-collapse").onclick = () => {
  $("#combat-dock").classList.toggle("collapsed");
  $("#combat-collapse").textContent = $("#combat-dock").classList.contains("collapsed") ? "+" : "−";
};
$("#end-player-turn").onclick = async () => {
  try { renderCombat(await api("/api/player/combat/end-turn", { method: "POST", body: "{}" })); } catch (error) { setStatus(error.message); }
};
$("#player-death-saves").addEventListener("click", async event => {
  const result = event.target.dataset.deathSave;
  if (!result) return;
  try { renderCombat(await api("/api/player/combat/death-save", { method: "POST", body: JSON.stringify({ result }) })); } catch (error) { setStatus(error.message); }
});
setInterval(loadCombat, 2500);
setInterval(async () => {
  if (dirty || document.hidden || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  try { render(await api("/api/player/data")); setStatus("Получены изменения мастера"); } catch {}
}, 15000);
load();
