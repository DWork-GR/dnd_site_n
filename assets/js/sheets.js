Object.assign(DndApp, {
  // Здесь собраны функции открытия и заполнения больших форм-редакторов.
  openNpcDossier(index = null) {
    this.editingNpcIndex = index;
    const source =
      index === null
        ? { name: "", race: "", portraitUrl: "", ac: 10, hp: 10, npc: {} }
        : this.data.characters[index];
    const npc = {
        nickname: source.player || "",
        appearance: source.personality || "",
        character: source.ideals || "",
        motives: source.bonds || "",
        fears: source.flaws || "",
        dmNotes: source.dmNotes || "",
        combatAttacks: source.attacks || "",
        status: "alive",
        partyAttitude: "0",
        ...(source.npc || {}),
      },
      form = this.$("#npc-form");
    form.elements.name.value = source.name || "";
    form.elements.race.value = source.race || "";
    [
      "nickname",
      "age",
      "gender",
      "locationId",
      "factionId",
      "status",
      "appearance",
      "character",
      "motives",
      "fears",
      "partyAttitude",
      "connections",
      "secrets",
      "dmNotes",
      "combatAttacks",
    ].forEach(
      (key) =>
        (form.elements[key].value =
          npc[key] ?? (key === "status" ? "alive" : key === "partyAttitude" ? "0" : "")),
    );
    form.elements.visibleToPlayers.checked = npc.visibleToPlayers === true;
    const visibleIds = npc.visibleToCharacterIds || [],
      publicFields = npc.publicFields || [];
    this.$$("#npc-public-fields input").forEach(
      (input) => (input.checked = publicFields.includes(input.value)),
    );
    this.$("#npc-player-access").innerHTML =
      this.data.characters
        .filter((character) => character.kind === "player")
        .map(
          (character) =>
            `<label><input type="checkbox" value="${character.id}" ${visibleIds.includes(character.id) ? "checked" : ""}><span>${this.escapeHtml(character.name || "Без имени")}<small>${this.escapeHtml(character.player || "игрок не указан")}</small></span></label>`,
        )
        .join("") || "<small>Сначала создайте персонажей игроков.</small>";
    form.elements.ac.value = source.ac ?? 10;
    form.elements.hp.value = source.hp ?? 10;
    this.$("#npc-location").innerHTML =
      `<option value="">Не привязан</option>` +
      this.data.lore
        .filter((item) => item.type === "Место")
        .map(
          (item) =>
            `<option value="${item.id}" ${item.id === npc.locationId ? "selected" : ""}>${this.escapeHtml(item.title)}</option>`,
        )
        .join("");
    this.$("#npc-faction").innerHTML =
      `<option value="">Без фракции</option>` +
      this.data.lore
        .filter((item) => item.type === "Фракция")
        .map(
          (item) =>
            `<option value="${item.id}" ${item.id === npc.factionId ? "selected" : ""}>${this.escapeHtml(item.title)}</option>`,
        )
        .join("");
    this.$("#npc-portrait-select").innerHTML =
      `<option value="">Без портрета</option>` +
      this.mediaAssets
        .filter((item) => item.category === "portrait")
        .map(
          (item) =>
            `<option value="${this.escapeHtml(item.url)}" ${item.url === source.portraitUrl ? "selected" : ""}>${this.escapeHtml(item.title || item.original_name)}</option>`,
        )
        .join("");
    this.updateNpcPortrait();
    this.$("#npc-dialog-title").textContent = source.name || "Новый NPC";
    this.$("#delete-npc").style.visibility = index === null ? "hidden" : "visible";
    this.$("#npc-dialog").showModal();
    window.RichText.enhance(this.$("#npc-dialog"));
  },
  openNpcView(index) {
    // Обычный клик показывает досье, а карандаш открывает форму редактирования.
    const source = this.data.characters[index];
    if (!source || source.kind !== "npc") return;
    const npc = source.npc || {};
    const status =
      { alive: "Жив", dead: "Мёртв", missing: "Пропал", unknown: "Неизвестно" }[npc.status] || "Не указан";
    const attitude =
      { "-2": "Враждебный", "-1": "Неприязненный", 0: "Нейтральный", 1: "Дружелюбный", 2: "Союзник" }[
        npc.partyAttitude
      ] || "Не указано";
    const location = this.data.lore.find((item) => item.id === npc.locationId)?.title || "Не указано";
    const faction = this.data.lore.find((item) => item.id === npc.factionId)?.title || "Без фракции";
    const block = (title, text, privateBlock = false) =>
      text
        ? `<section class="npc-view-section ${privateBlock ? "private" : ""}"><h3>${title}</h3><div>${window.RichText.render(text, this.escapeHtml)}</div></section>`
        : "";
    this.$("#npc-view-content").innerHTML =
      `<header class="npc-view-head">${source.portraitUrl ? `<img src="${this.escapeHtml(source.portraitUrl)}" alt="">` : `<span class="npc-view-initials">${this.initials(source.name)}</span>`}<div><span class="eyebrow">Досье NPC</span><h2>${this.escapeHtml(source.name)}</h2><p>${this.escapeHtml(npc.nickname || source.race || "NPC")} · ${status}</p></div><div class="npc-view-actions"><button type="button" class="ghost-button" data-edit-npc="${index}">✎ Редактировать</button><button type="button" class="modal-close" data-close-dialog="npc-view-dialog">×</button></div></header><div class="npc-view-facts"><span><b>Раса</b>${this.escapeHtml(source.race || "Не указана")}</span><span><b>Возраст и пол</b>${this.escapeHtml([npc.age, npc.gender].filter(Boolean).join(" · ") || "Не указаны")}</span><span><b>Местонахождение</b>${this.escapeHtml(location)}</span><span><b>Фракция</b>${this.escapeHtml(faction)}</span><span><b>Отношение к партии</b>${attitude}</span><span><b>Открыто игрокам</b>${npc.publicFields?.length || 0} блоков</span></div><div class="npc-view-grid">${block("Внешность", npc.appearance)}${block("Характер и манера речи", npc.character)}${block("Мотивы", npc.motives, true)}${block("Страхи и слабости", npc.fears, true)}${block("Связи", npc.connections)}${block("Что знает и секреты", npc.secrets, true)}${block("Заметки мастера", npc.dmNotes, true)}${block("Боевые данные", `AC ${source.ac || 0} · HP ${source.hp || 0}\n${npc.combatAttacks || ""}`, true)}</div>`;
    this.$("#npc-view-dialog").showModal();
  },
  updateNpcPortrait() {
    const url = this.$("#npc-form").elements.portraitUrl.value,
      image = this.$("#npc-portrait-preview");
    image.src = url || "";
    image.classList.toggle("empty", !url);
  },
  openLoreSheet(index = null) {
    this.editingLoreIndex = index;
    const entry =
      index === null ? { type: "Место", title: "", ideology: "", text: "" } : this.data.lore[index];
    const form = this.$("#lore-form");
    ["type", "title", "ideology", "text"].forEach((key) => (form.elements[key].value = entry[key] || ""));
    form.elements.visibleToPlayers.checked = entry.visibleToPlayers === true;
    const visibleIds = entry.visibleToCharacterIds || [];
    this.editingLoreImages = structuredClone(entry.images || []);
    this.renderLoreImages();
    this.$("#lore-player-access").innerHTML =
      this.data.characters
        .filter((character) => character.kind === "player")
        .map(
          (character) =>
            `<label><input type="checkbox" value="${character.id}" ${visibleIds.includes(character.id) ? "checked" : ""}> <span>${this.escapeHtml(character.name || "Без имени")}<small>${this.escapeHtml(character.player || "игрок не указан")}</small></span></label>`,
        )
        .join("") || "<small>Сначала создайте персонажей игроков.</small>";
    this.$("#lore-sheet-heading").textContent = entry.title || "Новая запись";
    this.$("#delete-lore-sheet").style.visibility = index === null ? "hidden" : "visible";
    this.updateLoreFields();
    this.$("#lore-dialog").showModal();
  },

  openLoreView(index) {
    const entry = this.data.lore[index];
    if (!entry) return;
    const audience = entry.visibleToPlayers
      ? "Видно всем игрокам"
      : entry.visibleToCharacterIds?.length
        ? `Видно выбранным игрокам: ${entry.visibleToCharacterIds.length}`
        : "Видно только мастеру";
    const images = (entry.images || [])
      .map(
        (image) =>
          `<button type="button" class="lore-view-image" data-open-image="${this.escapeHtml(image.url)}" title="Открыть изображение в полном размере"><img src="${this.escapeHtml(image.url)}" alt="${this.escapeHtml(image.title || entry.title)}"><span>${this.escapeHtml(image.title || "Открыть полностью")}</span></button>`,
      )
      .join("");
    this.$("#lore-view-content").innerHTML =
      `<header class="lore-view-head"><div><span class="eyebrow">${this.escapeHtml(entry.type)}</span><h2>${this.escapeHtml(entry.title)}</h2><small>${audience}</small></div><div class="lore-view-actions"><button type="button" class="ghost-button" data-edit-lore="${index}">✎ Редактировать</button><button type="button" class="modal-close" data-close-dialog="lore-view-dialog">×</button></div></header>${images ? `<section class="lore-view-gallery">${images}</section>` : ""}${entry.type === "Фракция" && entry.ideology ? `<section class="lore-view-ideology"><strong>Идеология</strong><div>${window.RichText.render(entry.ideology, this.escapeHtml)}</div></section>` : ""}<section class="lore-view-text">${window.RichText.render(entry.text, this.escapeHtml)}</section>`;
    this.$("#lore-view-dialog").showModal();
  },

  updateLoreFields() {
    this.$("#lore-ideology").classList.toggle(
      "visible",
      this.$("#lore-form").elements.type.value === "Фракция",
    );
  },

  renderLoreImages() {
    this.$("#lore-image-list").innerHTML =
      this.editingLoreImages
        .map(
          (image, index) =>
            `<article><button type="button" class="lore-editor-image" data-open-image="${this.escapeHtml(image.url)}" title="Открыть полностью"><img src="${this.escapeHtml(image.url)}" alt="${this.escapeHtml(image.title || "")}"></button><span>${this.escapeHtml(image.title || "Изображение")}</span><button type="button" class="delete" data-remove-lore-image="${index}">×</button></article>`,
        )
        .join("") || "<small>У этой записи пока нет изображений.</small>";
  },

  openSessionEditor(id = null, suggestedDate = "") {
    this.editingSessionId = id;
    const session = this.data.sessions.find((item) => item.id === id) || {
      title: "",
      date: suggestedDate,
      time: "",
      status: "planned",
      plan: "",
      summary: "",
    };
    const form = this.$("#session-form");
    ["title", "date", "time", "status", "plan", "summary"].forEach(
      (key) => (form.elements[key].value = session[key] || ""),
    );
    this.$("#session-dialog-title").textContent = id ? session.title : "Новая сессия";
    this.$("#delete-session").style.visibility = id ? "visible" : "hidden";
    this.$("#session-dialog").showModal();
  },

  openMonsterEditor(id = null) {
    this.editingMonsterId = id;
    const m = this.data.bestiary.find((item) => item.id === id) || {
      name: "",
      type: "Гуманоид",
      size: "Средний",
      alignment: "",
      ac: 10,
      hp: 1,
      hitDice: "",
      speed: "",
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      advantageSaves: [],
      skills: "",
      damageImmunities: "",
      damageResistances: "",
      damageVulnerabilities: "",
      conditionImmunities: "",
      senses: "",
      passivePerception: 10,
      languages: "",
      cr: "0",
      xp: 0,
      campaignTag: "",
      traits: "",
      actions: [],
      reactions: "",
      legendaryActions: "",
      lair: "",
      dmNotes: "",
    };
    const form = this.$("#monster-form");
    [
      "name",
      "type",
      "size",
      "alignment",
      "ac",
      "hp",
      "hitDice",
      "speed",
      "skills",
      "damageImmunities",
      "damageResistances",
      "damageVulnerabilities",
      "conditionImmunities",
      "senses",
      "passivePerception",
      "languages",
      "cr",
      "xp",
      "campaignTag",
      "traits",
      "reactions",
      "legendaryActions",
      "lair",
      "dmNotes",
    ].forEach((k) => (form.elements[k].value = m[k] ?? ""));
    this.$("#monster-abilities-editor").innerHTML = this.abilities
      .map(
        ([k, label]) =>
          `<label>${label}<input name="monster-${k}" type="number" value="${m.abilities?.[k] ?? 10}"><strong data-monster-mod="${k}">${this.signed(this.modifier(m.abilities?.[k]))}</strong></label>`,
      )
      .join("");
    this.$("#monster-advantage-saves").innerHTML = this.abilities
      .map(
        ([k, label]) =>
          `<label><input name="monster-save-${k}" type="checkbox" ${m.advantageSaves?.includes(k) ? "checked" : ""}> ${label}</label>`,
      )
      .join("");
    this.editingMonsterActions = structuredClone(m.actions || []);
    this.renderMonsterActions();
    this.$("#monster-dialog-title").textContent = m.name || "Новое существо";
    this.$("#delete-monster").style.visibility = id ? "visible" : "hidden";
    this.$("#monster-dialog").showModal();
  },
  renderMonsterActions() {
    this.$("#monster-actions-editor").innerHTML =
      this.editingMonsterActions
        .map(
          (a, i) =>
            `<article data-monster-action="${i}"><input data-action-field="name" value="${this.escapeHtml(a.name)}" placeholder="Название действия"><textarea data-action-field="description" placeholder="Описание">${this.escapeHtml(a.description)}</textarea><button type="button" class="delete" data-delete-monster-action="${i}">Удалить</button></article>`,
        )
        .join("") || "<small>Действий пока нет.</small>";
  },
  openShopEditor(id = null) {
    this.editingShopId = id;
    const s = this.data.shops.find((x) => x.id === id) || {
      name: "",
      locationId: "",
      status: "open",
      description: "",
      items: [],
      visibleToPlayers: false,
      visibleToCharacterIds: [],
    };
    const f = this.$("#shop-form");
    ["name", "locationId", "status", "description"].forEach((k) => (f.elements[k].value = s[k] || ""));
    f.elements.visibleToPlayers.checked = s.visibleToPlayers === true;
    this.$("#shop-location").innerHTML =
      `<option value="">Без привязки</option>` +
      this.data.lore
        .filter((x) => x.type === "Место")
        .map(
          (x) =>
            `<option value="${x.id}" ${x.id === s.locationId ? "selected" : ""}>${this.escapeHtml(x.title)}</option>`,
        )
        .join("");
    this.$("#shop-player-access").innerHTML =
      this.data.characters
        .filter((c) => c.kind === "player")
        .map(
          (c) =>
            `<label><input type="checkbox" value="${c.id}" ${s.visibleToCharacterIds?.includes(c.id) ? "checked" : ""}><span>${this.escapeHtml(c.name)}<small>${this.escapeHtml(c.player || "")}</small></span></label>`,
        )
        .join("") || "<small>Нет персонажей игроков.</small>";
    this.editingShopItems = structuredClone(s.items || []);
    this.renderShopItems();
    this.$("#shop-dialog-title").textContent = s.name || "Новый магазин";
    this.$("#delete-shop").style.visibility = id ? "visible" : "hidden";
    this.$("#shop-dialog").showModal();
  },
  renderShopItems() {
    this.$("#shop-items-editor").innerHTML =
      this.editingShopItems
        .map(
          (item, i) =>
            `<article class="${item.sold ? "sold" : ""}" data-shop-item="${i}"><input data-item-field="name" value="${this.escapeHtml(item.name)}" placeholder="Название товара"><input data-item-field="price" value="${this.escapeHtml(item.price)}" placeholder="Цена: 5 зм"><input data-item-field="quantity" value="${this.escapeHtml(item.quantity)}" placeholder="Количество или ∞"><textarea data-item-field="description" placeholder="Описание и свойства">${this.escapeHtml(item.description)}</textarea><label><input data-item-field="sold" type="checkbox" ${item.sold ? "checked" : ""}> Продан</label><button type="button" class="delete" data-delete-shop-item="${i}">Удалить</button></article>`,
        )
        .join("") || "<small>Товаров пока нет.</small>";
  },

  async loadPlayerAccess(character) {
    const login = this.$("#player-access-login");
    const password = this.$("#player-access-password");
    const status = this.$("#player-access-status");
    login.value = "";
    password.value = "";
    status.textContent = character.id
      ? "Проверяем настроенный вход..."
      : "Сначала сохраните нового персонажа";
    this.$("#save-player-access").disabled = !character.id;
    this.$("#delete-player-access").disabled = !character.id;
    if (!character.id) return;
    try {
      const response = await fetch("/api/master/player-accounts");
      const accounts = await response.json();
      const account = accounts.find((item) => item.character_id === character.id);
      login.value = account?.username || "";
      status.textContent = account
        ? `Вход настроен для ${account.display_name || account.username}`
        : "Вход ещё не настроен";
      this.$("#delete-player-access").disabled = !account;
    } catch {
      status.textContent = "Не удалось проверить вход";
    }
  },

  async savePlayerAccess() {
    const character = this.data.characters[this.editingCharacterIndex];
    if (!character?.id) return this.toast("Сначала сохраните персонажа");
    character.playerAccessEnabled = this.$("#player-access-enabled").checked;
    this.save();
    const response = await fetch(`/api/master/player-accounts/${encodeURIComponent(character.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.$("#player-access-login").value,
        password: this.$("#player-access-password").value,
        displayName: character.player || character.name,
        enabled: true,
      }),
    });
    const result = await response.json();
    if (!response.ok) return this.toast(result.error || "Не удалось сохранить вход");
    this.$("#player-access-password").value = "";
    this.$("#player-access-status").textContent = "Вход настроен и сохранён";
    this.toast("Доступ игрока сохранён");
  },

  async deletePlayerAccess() {
    const character = this.data.characters[this.editingCharacterIndex];
    if (!character?.id || !confirm("Удалить логин игрока для этого персонажа?")) return;
    await fetch(`/api/master/player-accounts/${encodeURIComponent(character.id)}`, { method: "DELETE" });
    character.playerAccessEnabled = false;
    this.$("#player-access-enabled").checked = false;
    this.$("#player-access-login").value = "";
    this.$("#player-access-status").textContent = "Вход ещё не настроен";
    this.save();
    this.toast("Вход игрока удалён");
  },

  openModal(type) {
    const configs = {
      character: {
        title: "Добавить героя",
        fields: [
          ["name", "Имя героя"],
          ["player", "Имя игрока"],
          ["group", "Группа"],
          ["className", "Класс"],
          ["level", "Уровень", "number"],
          ["hp", "Текущее здоровье", "number"],
          ["maxHp", "Макс. здоровье", "number"],
          ["ac", "Класс брони", "number"],
          ["gold", "Золото", "number"],
        ],
      },
    };
    const config = configs[type];
    if (!config) return;
    this.$("#modal-title").textContent = config.title;
    this.$("#modal-form").dataset.type = type;
    this.$("#modal-fields").innerHTML =
      `<div class="form-grid">${config.fields.map(([name, label, input = "input"]) => `<label>${label}<input name="${name}" type="${input}" ${input === "number" ? 'step="any"' : ""} required></label>`).join("")}</div>`;
    this.$("#modal").showModal();
  },

  openCharacterSheet(index = null) {
    this.editingCharacterIndex = index;
    const c =
      index === null
        ? {
            name: "",
            kind: "player",
            player: "",
            packId: this.selectedPackId === "all" ? this.data.packs[0]?.id : this.selectedPackId,
            className: "",
            race: "",
            level: 1,
            xp: 0,
            hp: 10,
            maxHp: 10,
            tempHp: 0,
            ac: 10,
            speed: 30,
            gold: 0,
            hitDieType: 8,
            hitDiceTotal: 1,
            usedHitDice: 0,
            abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            saveProficiencies: [],
            skillProficiencies: [],
            skillExpertise: [],
            spellAbility: "int",
            spellSlots: Array.from({ length: 9 }, (_, i) => ({ level: i + 1, max: 0, used: 0 })),
            spells: [],
          }
        : this.data.characters[index];
    const form = this.$("#sheet-form");
    this.editingPortraitUrl = c.portraitUrl || "";
    this.updatePortraitPreview();
    this.$("#sheet-heading").textContent = c.name || "Новый персонаж";
    this.$("#player-access-enabled").checked = c.playerAccessEnabled === true;
    this.loadPlayerAccess(c);
    this.$("#grimoire-owner").textContent = c.name ? `Гримуар · ${c.name}` : "Книга заклинаний";
    this.$("#sheet-pack").innerHTML = this.data.packs
      .map((pack) => `<option value="${pack.id}">${this.escapeHtml(pack.name)}</option>`)
      .join("");
    const textKeys = [
      "name",
      "kind",
      "player",
      "packId",
      "className",
      "race",
      "level",
      "xp",
      "hp",
      "maxHp",
      "tempHp",
      "ac",
      "speed",
      "gold",
      "background",
      "alignment",
      "proficiencies",
      "hitDieType",
      "hitDiceTotal",
      "usedHitDice",
      "deathSuccesses",
      "deathFailures",
      "cp",
      "sp",
      "ep",
      "pp",
      "spellcastingClass",
      "spellAbility",
      "spellNotes",
      "equipment",
      "dmNotes",
    ];
    textKeys.forEach((key) => {
      if (form.elements[key]) form.elements[key].value = c[key] ?? "";
    });
    form.elements.inspiration.checked = Boolean(c.inspiration);
    this.editingSpells = structuredClone(c.spells || []).map((spell) => ({ ...spell, _editing: false }));
    this.editingFeatures = structuredClone(
      c.featureCards || (c.features ? [{ name: "Общие умения и особенности", description: c.features }] : []),
    ).map((feature) => ({ ...feature, _editing: false }));
    this.editingAttackCards = structuredClone(
      c.attackCards ||
        (c.attacks
          ? [{ name: "Общие атаки", damageDie: "", proficient: false, description: c.attacks }]
          : []),
    ).map((item) => ({ ...item, _editing: false }));
    this.editingTraitCards = Object.fromEntries(
      ["personality", "ideals", "bonds", "flaws"].map((key) => [
        key,
        structuredClone(c.traitCards?.[key] || (c[key] ? [{ name: "Общее", description: c[key] }] : [])).map(
          (item) => ({ ...item, _editing: false }),
        ),
      ]),
    );
    this.$("#ability-grid").innerHTML = this.abilities
      .map(
        ([key, label]) =>
          `<label class="ability-box"><span>${label}</span><strong data-ability-mod="${key}">+0</strong><input name="ability-${key}" type="number" min="1" max="30" value="${c.abilities?.[key] ?? 10}"></label>`,
      )
      .join("");
    this.$("#save-proficiencies").innerHTML = this.abilities
      .map(
        ([key, label]) =>
          `<label><input type="checkbox" name="save-${key}" ${c.saveProficiencies?.includes(key) ? "checked" : ""}><b data-save-value="${key}">+0</b><span>${label}</span></label>`,
      )
      .join("");
    this.$("#skill-proficiencies").innerHTML = this.abilities
      .map(
        ([ability, abilityLabel]) =>
          `<section class="sheet-skill-group"><h5>${abilityLabel}</h5>${this.skills
            .filter((item) => item[2] === ability)
            .map(
              ([key, label]) =>
                `<label><input type="checkbox" name="skill-${key}" ${c.skillProficiencies?.includes(key) ? "checked" : ""}><b data-skill-value="${key}">+0</b><span>${label}</span><input class="expertise-check" type="checkbox" name="expertise-${key}" ${c.skillExpertise?.includes(key) ? "checked" : ""} title="Экспертиза"></label>`,
            )
            .join("")}</section>`,
      )
      .join("");
    this.$("#spell-slots").innerHTML = Array.from({ length: 9 }, (_, i) => {
      const slot = c.spellSlots?.find((s) => s.level === i + 1) || { max: 0, used: 0 };
      return `<div class="slot-card"><strong>${i + 1}</strong><span>уровень</span><label>Всего<input name="slot-max-${i + 1}" type="number" min="0" value="${slot.max}"></label><label>Использовано<input name="slot-used-${i + 1}" type="number" min="0" value="${slot.used}"></label></div>`;
    }).join("");
    this.renderSpells();
    this.renderFeatures();
    this.renderAttacks();
    this.renderTraits();
    this.updateSheetCalculations();
    this.$("#delete-sheet").style.visibility = index === null ? "hidden" : "visible";
    this.$$(".sheet-tabs button").forEach((button) =>
      button.classList.toggle("active", button.dataset.sheetTab === "main"),
    );
    this.$$(".sheet-tab-page").forEach((page) =>
      page.classList.toggle("active", page.id === "sheet-tab-main"),
    );
    this.$("#sheet-dialog").showModal();
    window.RichText.enhance();
  },

  updateSheetCalculations() {
    const form = this.$("#sheet-form");
    const prof = this.proficiency(form.elements.level.value);
    this.$("#grimoire-owner").textContent = form.elements.name.value
      ? `Гримуар · ${form.elements.name.value}`
      : "Книга заклинаний";
    this.abilities.forEach(([key]) => {
      const mod = this.modifier(form.elements[`ability-${key}`]?.value);
      this.$(`[data-ability-mod="${key}"]`).textContent = this.signed(mod);
      this.$(`[data-save-value="${key}"]`).textContent = this.signed(
        mod + (form.elements[`save-${key}`]?.checked ? prof : 0),
      );
    });
    this.skills.forEach(([key, , ability]) => {
      const expert = form.elements[`expertise-${key}`]?.checked;
      if (expert) form.elements[`skill-${key}`].checked = true;
      const trained = form.elements[`skill-${key}`]?.checked;
      this.$(`[data-skill-value="${key}"]`).textContent = this.signed(
        this.modifier(form.elements[`ability-${ability}`]?.value) + (trained ? prof * (expert ? 2 : 1) : 0),
      );
    });
    this.$("#sheet-prof").textContent = this.signed(prof);
    this.$("#sheet-initiative").textContent = this.signed(this.modifier(form.elements["ability-dex"]?.value));
    const perception = form.elements["skill-perception"]?.checked,
      expertise = form.elements["expertise-perception"]?.checked;
    this.$("#sheet-passive").textContent =
      10 + this.modifier(form.elements["ability-wis"]?.value) + (perception ? prof * (expertise ? 2 : 1) : 0);
    const ability = form.elements.spellAbility?.value || "int",
      spellMod = this.modifier(form.elements[`ability-${ability}`]?.value);
    this.$("#spell-save-dc").textContent = 8 + prof + spellMod;
    this.$("#spell-attack-bonus").textContent = this.signed(prof + spellMod);
  },

  updatePortraitPreview() {
    const preview = this.$("#sheet-portrait-preview");
    preview.src = this.editingPortraitUrl || "";
    preview.classList.toggle("empty", !this.editingPortraitUrl);
    this.$("#remove-character-portrait").style.visibility = this.editingPortraitUrl ? "visible" : "hidden";
  },

  renderSpells() {
    const sorted = this.editingSpells
      .map((spell, index) => ({ spell, index }))
      .sort(
        (a, b) =>
          Number(a.spell.level) - Number(b.spell.level) ||
          String(a.spell.name).localeCompare(String(b.spell.name), "ru"),
      );
    this.$("#spell-list").innerHTML =
      sorted
        .map(
          ({ spell, index }) =>
            spell._editing
              ? `<article class="spell-card editing" data-spell-card="${index}"><div class="spell-card-top"><label class="spell-prepared"><input type="checkbox" data-spell-field="prepared" ${spell.prepared ? "checked" : ""}>Подготовлено</label><label class="spell-name">Название<input data-spell-field="name" value="${this.escapeHtml(spell.name || "")}"></label><label>Уровень<select data-spell-field="level">${Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${Number(spell.level) === i ? "selected" : ""}>${i === 0 ? "Заговор" : i}</option>`).join("")}</select></label><label>Школа<input data-spell-field="school" value="${this.escapeHtml(spell.school || "")}"></label><button type="button" class="delete" data-delete-spell="${index}">Удалить</button></div><div class="spell-meta">${[
                  ["castingTime", "Время накладывания"],
                  ["range", "Дистанция"],
                  ["components", "Компоненты"],
                  ["duration", "Длительность"],
                ]
                  .map(
                    ([key, label]) =>
                      `<label>${label}<input data-spell-field="${key}" value="${this.escapeHtml(spell[key] || "")}"></label>`,
                  )
                  .join("")}<label class="spell-ritual"><input type="checkbox" data-spell-field="ritual" ${spell.ritual ? "checked" : ""}>Ритуал</label><label class="spell-concentration"><input type="checkbox" data-spell-field="concentration" ${spell.concentration ? "checked" : ""}>Концентрация</label></div><label class="spell-description">Описание и эффект<textarea data-spell-field="description">${this.escapeHtml(spell.description || "")}</textarea></label><button type="button" class="spell-save-button" data-save-spell="${index}">Сохранить заклинание</button></article>`
              : `<article class="spell-card spell-card-view" data-spell-card="${index}"><button type="button" class="feature-edit-button" data-edit-spell="${index}" title="Редактировать заклинание" aria-label="Редактировать заклинание">✎</button><header><div><small>${Number(spell.level) === 0 ? "Заговор" : `${Number(spell.level)} уровень`}${spell.school ? ` · ${this.escapeHtml(spell.school)}` : ""}</small><h4>${this.escapeHtml(spell.name || "Без названия")}</h4></div><div class="spell-view-badges">${spell.prepared ? "<b>Подготовлено</b>" : ""}${spell.ritual ? "<b>Ритуал</b>" : ""}${spell.concentration ? "<b>Концентрация</b>" : ""}</div></header><div class="spell-view-meta">${[
                  ["Время", spell.castingTime],
                  ["Дистанция", spell.range],
                  ["Компоненты", spell.components],
                  ["Длительность", spell.duration],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => `<span><small>${label}</small><strong>${this.escapeHtml(value)}</strong></span>`)
                  .join("")}</div><div class="spell-view-description">${window.RichText.render(spell.description || "", this.escapeHtml) || "Описание не заполнено"}</div></article>`,
        )
        .join("") ||
      `<div class="empty-state"><strong>Книга заклинаний пуста</strong><span>Добавьте первое заклинание игрока.</span></div>`;
    window.RichText.enhance(this.$("#spell-list"));
  },

  renderFeatures() {
    this.$("#feature-cards-editor").innerHTML =
      this.editingFeatures
        .map((feature, index) =>
          feature._editing
            ? `<article class="feature-card-editor editing" data-feature-card="${index}"><div class="feature-card-title"><input data-feature-field="name" value="${this.escapeHtml(feature.name || "")}" placeholder="Название способности"><button type="button" class="delete" data-delete-feature="${index}">Удалить</button></div><textarea data-feature-field="description" placeholder="Описание, правила и ограничения способности">${this.escapeHtml(feature.description || "")}</textarea><button type="button" class="feature-save-button" data-save-feature="${index}">Сохранить способность</button></article>`
            : `<article class="feature-card-view" data-feature-card="${index}"><button type="button" class="feature-edit-button" data-edit-feature="${index}" title="Редактировать способность" aria-label="Редактировать способность">✎</button><h4>${this.escapeHtml(feature.name || "Без названия")}</h4><div>${window.RichText.render(feature.description || "", this.escapeHtml) || "<span class='feature-empty-description'>Описание не заполнено</span>"}</div></article>`,
        )
        .join("") || `<div class="empty-feature-cards">Добавьте первую способность</div>`;
    window.RichText.enhance(this.$("#feature-cards-editor"));
  },

  renderAttacks() {
    this.$("#attack-cards-editor").innerHTML =
      this.editingAttackCards
        .map((item, index) =>
          item._editing
            ? `<article class="feature-card-editor weapon-card-editor" data-attack-card="${index}"><div class="weapon-fields"><input data-attack-field="name" value="${this.escapeHtml(item.name || "")}" placeholder="Название оружия"><input data-attack-field="damageDie" value="${this.escapeHtml(item.damageDie || "")}" placeholder="Кость: 1d8"><label><input data-attack-field="proficient" type="checkbox" ${item.proficient ? "checked" : ""}> Владение</label></div><textarea data-attack-field="description" placeholder="Описание оружия">${this.escapeHtml(item.description || "")}</textarea><div class="card-edit-actions"><button type="button" class="delete" data-delete-attack="${index}">Удалить</button><button type="button" class="feature-save-button" data-save-attack="${index}">Сохранить оружие</button></div></article>`
            : `<article class="feature-card-view weapon-card-view"><button type="button" class="feature-edit-button" data-edit-attack="${index}">✎</button><h4>${this.escapeHtml(item.name || "Без названия")}</h4><div class="weapon-badges"><b>${this.escapeHtml(item.damageDie || "Без кости")}</b>${item.proficient ? "<b>Владение</b>" : ""}</div><div>${window.RichText.render(item.description || "", this.escapeHtml)}</div></article>`,
        )
        .join("") || `<div class="empty-feature-cards">Добавьте первое оружие</div>`;
    window.RichText.enhance(this.$("#attack-cards-editor"));
  },

  renderTraits() {
    ["personality", "ideals", "bonds", "flaws"].forEach((key) => {
      const container = this.$(`[data-trait-cards="${key}"]`);
      container.innerHTML =
        (this.editingTraitCards[key] || [])
          .map((item, index) =>
            item._editing
              ? `<article class="feature-card-editor" data-trait-card="${key}:${index}"><div class="feature-card-title"><input data-trait-field="name" value="${this.escapeHtml(item.name || "")}" placeholder="Название"><button type="button" class="delete" data-delete-trait="${key}:${index}">Удалить</button></div><textarea data-trait-field="description" placeholder="Описание">${this.escapeHtml(item.description || "")}</textarea><button type="button" class="feature-save-button" data-save-trait="${key}:${index}">Сохранить</button></article>`
              : `<article class="feature-card-view"><button type="button" class="feature-edit-button" data-edit-trait="${key}:${index}">✎</button><h4>${this.escapeHtml(item.name || "Без названия")}</h4><div>${window.RichText.render(item.description || "", this.escapeHtml)}</div></article>`,
          )
          .join("") || `<div class="empty-feature-cards">Карточек пока нет</div>`;
      window.RichText.enhance(container);
    });
  },
});
