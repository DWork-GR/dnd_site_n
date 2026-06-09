window.DndApp = (() => {
  // Общие данные и помощники мастерской части сайта.
  // Остальные JS-файлы расширяют этот объект через Object.assign(DndApp, {...}).
  const seed = {
    characters: [],
    tasks: [],
    lore: [
      {
        id: crypto.randomUUID(),
        type: "Место",
        title: "Элдервейл",
        ideology: "",
        text: "Город на семи мостах, под которым лежат руины первой столицы.",
      },
      {
        id: crypto.randomUUID(),
        type: "Фракция",
        title: "Орден Багряной Луны",
        ideology: "Охранять границы между мирами любой ценой.",
        text: "Древний союз магов, охраняющий печати между мирами.",
      },
    ],
    inventory: [],
    initiative: [],
    combat: { active: false, round: 1, turnIndex: 0, participants: [] },
    sessions: [],
    bestiary: [],
    shops: [],
    masterNotes: [],
    packs: [{ id: crypto.randomUUID(), name: "Первая группа", type: "Группа игроков" }],
    noteSections: [{ id: crypto.randomUUID(), name: "Общие записи" }],
    campaignSettings: {},
  };

  const app = {
    data: structuredClone(seed),
    storageMode: "local",
    saveTimer: null,
    selectedNoteId: null,
    selectedPackId: "all",
    selectedNoteSectionId: "all",
    selectedPlayerGroup: "all",
    editingCharacterIndex: null,
    editingLoreIndex: null,
    editingSessionId: null,
    editingMonsterId: null,
    editingShopId: null,
    editingNpcIndex: null,
    editingMonsterActions: [],
    editingShopItems: [],
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    editingSpells: [],
    editingFeatures: [],
    editingAttackCards: [],
    editingTraitCards: {},
    editingPortraitUrl: "",
    editingLoreImages: [],
    mediaAssets: [],
    $: (selector) => document.querySelector(selector),
    $$: (selector) => [...document.querySelectorAll(selector)],
  };

  app.abilities = [
    ["str", "Сила"],
    ["dex", "Ловкость"],
    ["con", "Телосложение"],
    ["int", "Интеллект"],
    ["wis", "Мудрость"],
    ["cha", "Харизма"],
  ];
  app.skills = [
    ["acrobatics", "Акробатика", "dex"],
    ["animalHandling", "Уход за животными", "wis"],
    ["arcana", "Магия", "int"],
    ["athletics", "Атлетика", "str"],
    ["deception", "Обман", "cha"],
    ["history", "История", "int"],
    ["insight", "Проницательность", "wis"],
    ["intimidation", "Запугивание", "cha"],
    ["investigation", "Анализ", "int"],
    ["medicine", "Медицина", "wis"],
    ["nature", "Природа", "int"],
    ["perception", "Внимательность", "wis"],
    ["performance", "Выступление", "cha"],
    ["persuasion", "Убеждение", "cha"],
    ["religion", "Религия", "int"],
    ["sleightOfHand", "Ловкость рук", "dex"],
    ["stealth", "Скрытность", "dex"],
    ["survival", "Выживание", "wis"],
  ];

  app.escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  app.initials = (name) =>
    String(name || "?")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
  app.modifier = (score) => Math.floor((Number(score || 10) - 10) / 2);
  app.signed = (value) => `${value >= 0 ? "+" : ""}${value}`;
  app.proficiency = (level) => Math.ceil(Number(level || 1) / 4) + 1;
  app.toast = (text) => {
    app.$("#toast").textContent = text;
    app.$("#toast").classList.add("show");
    setTimeout(() => app.$("#toast").classList.remove("show"), 1800);
  };
  app.setStorageStatus = (text, offline = false) => {
    app.$("#storage-status").textContent = text;
    app.$("#storage-status").classList.toggle("offline", offline);
  };

  app.normalizeData = () => {
    // Дополняет старые сохранения новыми полями, чтобы обновления сайта не ломали кампанию.
    const d = app.data;
    d.characters ||= [];
    d.tasks ||= [];
    d.lore ||= [];
    d.inventory ||= [];
    d.initiative ||= [];
    d.sessions ||= [];
    d.bestiary ||= [];
    d.shops ||= [];
    d.combat ||= { active: false, round: 1, turnIndex: 0, participants: [] };
    d.combat.active ??= false;
    d.combat.round ||= 1;
    d.combat.turnIndex ||= 0;
    d.combat.participants ||= [];
    d.masterNotes ||= [];
    d.packs ||= [];
    d.noteSections ||= [];
    d.campaignSettings ||= {};
    if (!d.packs.length) d.packs.push({ id: crypto.randomUUID(), name: "Без группы", type: "Группа" });
    if (!d.noteSections.length) d.noteSections.push({ id: crypto.randomUUID(), name: "Общие записи" });
    const packByName = (name) => {
      let pack = d.packs.find((item) => item.name === name);
      if (!pack) {
        pack = { id: crypto.randomUUID(), name: name || "Без группы", type: "Группа" };
        d.packs.push(pack);
      }
      return pack.id;
    };
    d.characters.forEach((c) => {
      c.id ||= crypto.randomUUID();
      c.kind ||= "player";
      c.packId ||= packByName(c.group);
      c.race ||= "";
      c.level ||= 1;
      c.xp ||= 0;
      c.hp ||= 0;
      c.maxHp ||= 0;
      c.tempHp ||= 0;
      c.ac ||= 10;
      c.speed ||= 30;
      c.gold ||= 0;
      c.abilities ||= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      c.saveProficiencies ||= [];
      c.skillProficiencies ||= [];
      c.skillExpertise ||= [];
      [
        "background",
        "alignment",
        "proficiencies",
        "hitDice",
        "usedHitDice",
        "attacks",
        "personality",
        "ideals",
        "bonds",
        "flaws",
        "features",
        "equipment",
        "dmNotes",
        "spellcastingClass",
        "spellNotes",
        "portraitUrl",
      ].forEach((key) => (c[key] ||= ""));
      c.inspiration ??= false;
      c.deathSuccesses ||= 0;
      c.deathFailures ||= 0;
      c.cp ||= 0;
      c.sp ||= 0;
      c.ep ||= 0;
      c.pp ||= 0;
      c.playerAccessEnabled ??= false;
      c.hitDieType ||= Number(String(c.hitDice || "").match(/\d+/)?.[0]) || 8;
      c.hitDiceTotal ??= Math.max(1, Number(c.level || 1));
      c.usedHitDice = Math.max(0, Number(c.usedHitDice || 0));
      Object.keys(c.abilities).forEach(
        (key) => (c.abilities[key] = Math.max(1, Math.min(30, Number(c.abilities[key]) || 10))),
      );
      c.maxHp = Math.max(0, Number(c.maxHp || 0));
      c.hp = Math.max(0, Math.min(c.maxHp, Number(c.hp || 0)));
      c.spellAbility ||= "int";
      c.spellSlots ||= Array.from({ length: 9 }, (_, i) => ({ level: i + 1, max: 0, used: 0 }));
      c.spells ||= [];
      c.personalInventory ||= [];
      c.featureCards ||= c.features ? [{ name: "Общие умения и особенности", description: c.features }] : [];
      c.attackCards ||= c.attacks
        ? [{ name: "Общие атаки", damageDie: "", proficient: false, description: c.attacks }]
        : [];
      c.traitCards ||= Object.fromEntries(
        ["personality", "ideals", "bonds", "flaws"].map((key) => [
          key,
          c[key] ? [{ name: "Общее", description: c[key] }] : [],
        ]),
      );
      if (c.kind === "npc") {
        c.npc ||= {};
        c.npc.visibleToPlayers ??= false;
        c.npc.visibleToCharacterIds ||= [];
        c.npc.publicFields ||= [];
      }
    });
    d.lore.forEach((entry) => {
      entry.id ||= crypto.randomUUID();
      entry.ideology ||= "";
      entry.visibleToPlayers ??= false;
      entry.visibleToCharacterIds ||= [];
      entry.images ||= [];
    });
    d.sessions.forEach((session) => {
      session.id ||= crypto.randomUUID();
      session.title ||= "Игровая сессия";
      session.date ||= "";
      session.time ||= "";
      session.status ||= "planned";
      session.plan ||= "";
      session.summary ||= "";
    });
    d.bestiary.forEach((monster) => {
      monster.id ||= crypto.randomUUID();
      monster.name ||= "Безымянное существо";
      monster.type ||= "Гуманоид";
      monster.size ||= "Средний";
      monster.alignment ||= "";
      monster.ac ||= 10;
      monster.hp ||= 1;
      monster.hitDice ||= "";
      monster.speed ||= "";
      monster.abilities ||= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      monster.advantageSaves ||= [];
      monster.skills ||= "";
      monster.damageImmunities ||= "";
      monster.damageResistances ||= "";
      monster.damageVulnerabilities ||= "";
      monster.conditionImmunities ||= "";
      monster.senses ||= "";
      monster.passivePerception ||= 10;
      monster.languages ||= "";
      monster.cr ||= "0";
      monster.xp ||= 0;
      monster.traits ||= "";
      monster.actions ||= [];
      monster.reactions ||= "";
      monster.legendaryActions ||= "";
      monster.lair ||= "";
      monster.dmNotes ||= "";
      monster.campaignTag ||= "";
    });
    d.shops.forEach((shop) => {
      shop.id ||= crypto.randomUUID();
      shop.name ||= "Новый торговец";
      shop.locationId ||= "";
      shop.description ||= "";
      shop.status ||= "open";
      shop.items ||= [];
      shop.visibleToPlayers ??= false;
      shop.visibleToCharacterIds ||= [];
    });
    d.masterNotes.forEach((note) => {
      note.id ||= crypto.randomUUID();
      note.sectionId ||= d.noteSections[0].id;
      note.tags ||= [];
    });
  };

  app.save = () => {
    // Небольшая задержка объединяет несколько быстрых изменений в один запрос к серверу.
    clearTimeout(app.saveTimer);
    if (app.storageMode !== "postgresql") return;
    app.saveTimer = setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(app.data),
        });
        if (!response.ok) throw new Error();
        app.setStorageStatus("PostgreSQL · сохранено");
      } catch {
        app.storageMode = "local";
        app.setStorageStatus("База недоступна · изменения не сохраняются", true);
      }
    }, 250);
  };

  app.uploadImage = async (file, category = "other", title = "") => {
    if (!file) throw new Error("Файл не выбран");
    const response = await fetch("/api/master/images", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
        "X-Image-Title": encodeURIComponent(title || file.name),
        "X-Image-Category": category,
      },
      body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось загрузить изображение");
    return result;
  };

  return app;
})();
