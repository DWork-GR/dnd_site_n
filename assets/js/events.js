(() => {
  const A = DndApp,
    $ = A.$,
    $$ = A.$$;
  const tickConditions = (participants, unit, participantIndex = -1) => {
    participants.forEach((participant, index) => {
      if (unit === "turn" && index !== participantIndex) return;
      participant.conditions = (participant.conditions || [])
        .map((condition) =>
          condition.unit === unit ? { ...condition, remaining: Number(condition.remaining || 1) - 1 } : condition,
        )
        .filter((condition) => Number(condition.remaining || 0) > 0);
    });
  };

  // Делегирование кликов позволяет обрабатывать динамически созданные элементы по data-* атрибутам.
  document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLDialogElement) {
      const bounds = e.target.getBoundingClientRect();
      const outside =
        e.clientX < bounds.left ||
        e.clientX > bounds.right ||
        e.clientY < bounds.top ||
        e.clientY > bounds.bottom;
      if (outside) e.target.close();
    }
    const nav = e.target.closest("[data-page]");
    if (nav) A.navigate(nav.dataset.page);
    const go = e.target.closest("[data-goto]");
    if (go) A.navigate(go.dataset.goto);
    const modal = e.target.closest("[data-modal]");
    if (modal) A.openModal(modal.dataset.modal);
    const sheet = e.target.closest("[data-open-sheet]");
    if (sheet) A.openCharacterSheet(+sheet.dataset.openSheet);
    const editNpc = e.target.closest("[data-edit-npc]");
    if (editNpc) {
      e.preventDefault();
      e.stopPropagation();
      $("#npc-view-dialog").close();
      A.openNpcDossier(+editNpc.dataset.editNpc);
    }
    const viewNpc = e.target.closest("[data-view-npc]");
    if (viewNpc && !editNpc) A.openNpcView(+viewNpc.dataset.viewNpc);
    const editLore = e.target.closest("[data-edit-lore]");
    if (editLore) {
      e.preventDefault();
      e.stopPropagation();
      $("#lore-view-dialog").close();
      A.openLoreSheet(+editLore.dataset.editLore);
    }
    const viewLore = e.target.closest("[data-view-lore]");
    if (viewLore && !editLore) A.openLoreView(+viewLore.dataset.viewLore);
    const openSession = e.target.closest("[data-open-session]");
    if (openSession) {
      e.stopPropagation();
      A.openSessionEditor(openSession.dataset.openSession);
    }
    const sessionDate = e.target.closest("[data-session-date]");
    if (sessionDate && !openSession) A.openSessionEditor(null, sessionDate.dataset.sessionDate);
    const note = e.target.closest("[data-note-id]");
    if (note) {
      A.selectedNoteId = note.dataset.noteId;
      A.renderWorkshop();
    }
    const pack = e.target.closest("[data-pack-id]");
    if (pack) {
      A.selectedPackId = pack.dataset.packId;
      A.renderWorkshop();
    }
    const section = e.target.closest("[data-note-section]");
    if (section) {
      A.selectedNoteSectionId = section.dataset.noteSection;
      A.renderWorkshop();
    }
    const init = e.target.closest("[data-delete-init]");
    if (init) {
      A.data.initiative.splice(+init.dataset.deleteInit, 1);
      A.save();
      A.renderInitiative();
    }
    const combat = e.target.closest("[data-delete-combat]");
    if (combat) {
      const index = +combat.dataset.deleteCombat;
      A.data.combat.participants.splice(index, 1);
      if (A.data.combat.turnIndex >= A.data.combat.participants.length) A.data.combat.turnIndex = 0;
      A.save();
      A.renderInitiative();
    }
    const addCondition = e.target.closest("[data-add-condition]");
    if (addCondition) {
      A.conditionParticipantIndex = Number(addCondition.dataset.addCondition);
      const participant = A.data.combat.participants[A.conditionParticipantIndex];
      $("#condition-dialog-title").textContent = `Состояние · ${participant?.name || "участник"}`;
      $("#condition-form").reset();
      $("#condition-form").elements.color.value = "#b84c43";
      $("#condition-form").elements.duration.value = 1;
      $("#condition-dialog").showModal();
      $("#condition-form").dispatchEvent(new Event("input"));
    }
    const removeCondition = e.target.closest("[data-remove-condition]");
    if (removeCondition) {
      const [participantIndex, conditionId] = removeCondition.dataset.removeCondition.split(":");
      const participant = A.data.combat.participants[Number(participantIndex)];
      participant.conditions = (participant.conditions || []).filter((condition) => condition.id !== conditionId);
      A.save();
      A.renderInitiative();
    }
    const spell = e.target.closest("[data-delete-spell]");
    if (spell) {
      A.editingSpells.splice(+spell.dataset.deleteSpell, 1);
      A.renderSpells();
    }
    const editSpell = e.target.closest("[data-edit-spell]");
    if (editSpell) {
      A.editingSpells[+editSpell.dataset.editSpell]._editing = true;
      A.renderSpells();
    }
    const saveSpell = e.target.closest("[data-save-spell]");
    if (saveSpell) {
      const item = A.editingSpells[+saveSpell.dataset.saveSpell];
      item.name = item.name.trim() || "Без названия";
      item._editing = false;
      A.renderSpells();
    }
    const feature = e.target.closest("[data-delete-feature]");
    if (feature) {
      A.editingFeatures.splice(+feature.dataset.deleteFeature, 1);
      A.renderFeatures();
    }
    const editFeature = e.target.closest("[data-edit-feature]");
    if (editFeature) {
      A.editingFeatures[+editFeature.dataset.editFeature]._editing = true;
      A.renderFeatures();
    }
    const saveFeature = e.target.closest("[data-save-feature]");
    if (saveFeature) {
      const item = A.editingFeatures[+saveFeature.dataset.saveFeature];
      item.name = item.name.trim() || "Без названия";
      item._editing = false;
      A.renderFeatures();
    }
    const editAttack = e.target.closest("[data-edit-attack]");
    if (editAttack) {
      A.editingAttackCards[+editAttack.dataset.editAttack]._editing = true;
      A.renderAttacks();
    }
    const saveAttack = e.target.closest("[data-save-attack]");
    if (saveAttack) {
      A.editingAttackCards[+saveAttack.dataset.saveAttack]._editing = false;
      A.renderAttacks();
    }
    const deleteAttack = e.target.closest("[data-delete-attack]");
    if (deleteAttack) {
      A.editingAttackCards.splice(+deleteAttack.dataset.deleteAttack, 1);
      A.renderAttacks();
    }
    const traitAction = (name) => e.target.closest(`[data-${name}-trait]`);
    const editTrait = traitAction("edit"),
      saveTrait = traitAction("save"),
      deleteTrait = traitAction("delete");
    if (editTrait || saveTrait || deleteTrait) {
      const target = editTrait || saveTrait || deleteTrait,
        [key, index] =
          target.dataset[editTrait ? "editTrait" : saveTrait ? "saveTrait" : "deleteTrait"].split(":");
      if (deleteTrait) A.editingTraitCards[key].splice(+index, 1);
      else A.editingTraitCards[key][+index]._editing = Boolean(editTrait);
      A.renderTraits();
    }
    const die = e.target.closest("[data-die]");
    if (die) {
      const sides = +die.dataset.die,
        roll = Math.floor(Math.random() * sides) + 1;
      $("#dice-result strong").textContent = roll;
      $("#dice-result em").textContent = `Бросок d${sides}`;
    }
    const close = e.target.closest("[data-close-dialog]");
    if (close) document.getElementById(close.dataset.closeDialog)?.close();
    const message = e.target.closest("[data-message]");
    if (message) A.toast(message.dataset.message);
    const openImage = e.target.closest("[data-open-image]");
    if (openImage) window.open(openImage.dataset.openImage, "_blank", "noopener");
    const removeLoreImage = e.target.closest("[data-remove-lore-image]");
    if (removeLoreImage) {
      A.editingLoreImages.splice(+removeLoreImage.dataset.removeLoreImage, 1);
      A.renderLoreImages();
    }
    const deleteImage = e.target.closest("[data-delete-image]");
    if (deleteImage && confirm("Удалить изображение из медиатеки?")) {
      fetch(`/api/master/images/${deleteImage.dataset.deleteImage}`, { method: "DELETE" }).then(() =>
        A.renderMedia(),
      );
    }
    const monster = e.target.closest("[data-open-monster]");
    if (monster) {
      e.preventDefault();
      A.openMonsterEditor(monster.dataset.openMonster);
    }
    const shop = e.target.closest("[data-open-shop]");
    if (shop) {
      e.preventDefault();
      A.openShopEditor(shop.dataset.openShop);
    }
    const deleteMonsterAction = e.target.closest("[data-delete-monster-action]");
    if (deleteMonsterAction) {
      A.editingMonsterActions.splice(+deleteMonsterAction.dataset.deleteMonsterAction, 1);
      A.renderMonsterActions();
    }
    const deleteShopItem = e.target.closest("[data-delete-shop-item]");
    if (deleteShopItem) {
      A.editingShopItems.splice(+deleteShopItem.dataset.deleteShopItem, 1);
      A.renderShopItems();
    }
  });
  $("#mobile-menu").onclick = () => $(".sidebar").classList.toggle("open");
  $("#quick-add").onclick = () => A.openModal("character");
  $("#session-button").onclick = () => A.toast("Сессия началась. Удачной игры!");
  $("#task-form").onsubmit = (e) => {
    e.preventDefault();
    A.data.tasks.push({ text: $("#task-input").value, done: false });
    $("#task-input").value = "";
    A.save();
    A.renderOverview();
  };
  $("#task-list").onchange = (e) => {
    if (e.target.dataset.task !== undefined) {
      A.data.tasks[+e.target.dataset.task].done = e.target.checked;
      A.save();
      A.renderOverview();
    }
  };
  $("#character-filters").onclick = (e) => {
    const b = e.target.closest("[data-group]");
    if (b) A.renderCharacters(b.dataset.group);
  };
  $$("[data-lore-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-lore-filter]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        A.renderLore(b.dataset.loreFilter);
      }),
  );
  $("#new-lore").onclick = () => A.openLoreSheet();
  $("#lore-type").onchange = () => A.updateLoreFields();
  $("#lore-form").oninput = (e) => {
    if (e.target.name === "title") $("#lore-sheet-heading").textContent = e.target.value || "Новая запись";
  };
  $("#lore-form").onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") return $("#lore-dialog").close();
    const f = e.currentTarget,
      entry = A.editingLoreIndex === null ? { id: crypto.randomUUID() } : A.data.lore[A.editingLoreIndex];
    entry.type = f.elements.type.value;
    entry.title = f.elements.title.value.trim();
    entry.ideology = entry.type === "Фракция" ? f.elements.ideology.value : "";
    entry.text = f.elements.text.value;
    entry.visibleToPlayers = f.elements.visibleToPlayers.checked;
    entry.visibleToCharacterIds = $$("#lore-player-access input:checked").map((input) => input.value);
    entry.images = structuredClone(A.editingLoreImages);
    if (A.editingLoreIndex === null) A.data.lore.unshift(entry);
    A.save();
    A.renderLore();
    $("#lore-dialog").close();
    A.toast("Запись сеттинга сохранена");
  };
  $("#delete-lore-sheet").onclick = () => {
    if (A.editingLoreIndex !== null && confirm("Удалить эту запись сеттинга?")) {
      A.data.lore.splice(A.editingLoreIndex, 1);
      A.save();
      A.renderLore();
      $("#lore-dialog").close();
    }
  };
  $("#modal-form").onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") return $("#modal").close();
    const type = e.currentTarget.dataset.type,
      form = Object.fromEntries(new FormData(e.currentTarget));
    Object.keys(form).forEach((k) => {
      if (form[k] !== "" && !isNaN(form[k])) form[k] = +form[k];
    });
    if (type === "character") A.data.characters.push(form);
    A.normalizeData();
    A.save();
    A.renderAll();
    $("#modal").close();
  };
  $("#add-initiative").onclick = () => {
    const name = prompt("Имя участника боя:");
    if (!name) return;
    if (A.data.combat.active) {
      const hp = Number(prompt("Максимум HP:", "10") || 10),
        initiative = Number(prompt("Инициатива:", "10") || 10);
      A.data.combat.participants.push({
        id: crypto.randomUUID(),
        characterId: "",
        name,
        kind: "enemy",
        initiative,
        hp,
        maxHp: hp,
        deathSuccesses: 0,
        deathFailures: 0,
        conditions: [],
      });
      A.data.combat.participants.sort((a, b) => b.initiative - a.initiative);
      A.data.combat.turnIndex = 0;
    } else A.data.initiative.push({ name, value: 10 });
    A.save();
    A.renderInitiative();
  };
  $("#sort-initiative").onclick = () => {
    A.data.initiative.sort((a, b) => b.value - a.value);
    A.save();
    A.renderInitiative();
  };
  $("#condition-form").oninput = (event) => {
    const form = event.currentTarget;
    const name = form.elements.name.value.trim() || "Новое состояние";
    const duration = Math.max(1, Number(form.elements.duration.value || 1));
    const unit = form.elements.unit.value;
    $("#condition-preview-icon").textContent = form.elements.icon.value;
    $("#condition-preview-name").textContent = name;
    $("#condition-preview-duration").textContent = `${duration} ${unit === "turn" ? "ход." : "раунд."}`;
    $(".condition-preview").style.setProperty("--condition-color", form.elements.color.value);
  };
  $("#condition-form").onsubmit = (event) => {
    event.preventDefault();
    const participant = A.data.combat.participants[A.conditionParticipantIndex];
    if (!participant) return $("#condition-dialog").close();
    const form = event.currentTarget;
    participant.conditions ||= [];
    participant.conditions.push({
      id: crypto.randomUUID(),
      name: form.elements.name.value.trim(),
      icon: form.elements.icon.value,
      color: form.elements.color.value,
      remaining: Math.max(1, Math.min(99, Number(form.elements.duration.value || 1))),
      unit: form.elements.unit.value === "turn" ? "turn" : "round",
    });
    A.save();
    A.renderInitiative();
    $("#condition-dialog").close();
    A.toast("Состояние добавлено");
  };
  $("#initiative-list").onchange = (e) => {
    if (e.target.dataset.init !== undefined) {
      A.data.initiative[+e.target.dataset.init].value = +e.target.value;
      A.save();
    }
    if (e.target.dataset.combatInit !== undefined) {
      const p = A.data.combat.participants[+e.target.dataset.combatInit];
      p.initiative = +e.target.value;
      A.data.combat.participants.sort((a, b) => b.initiative - a.initiative);
      A.data.combat.turnIndex = 0;
      A.save();
      A.renderInitiative();
    }
    if (e.target.dataset.combatHp !== undefined) {
      const p = A.data.combat.participants[+e.target.dataset.combatHp];
      p.hp = Math.max(0, Math.min(p.maxHp, +e.target.value || 0));
      const c = A.data.characters.find((item) => item.id === p.characterId);
      if (p.hp > 0) {
        p.deathSuccesses = 0;
        p.deathFailures = 0;
        p.lastDeathSaveRound = 0;
      }
      if (c) {
        c.hp = p.hp;
        if (p.hp > 0) {
          c.deathSuccesses = 0;
          c.deathFailures = 0;
        }
      }
      A.save();
      A.renderInitiative();
    }
    if (e.target.dataset.combatMaxHp !== undefined) {
      const p = A.data.combat.participants[+e.target.dataset.combatMaxHp];
      p.maxHp = Math.max(1, +e.target.value || 1);
      p.hp = Math.min(p.hp, p.maxHp);
      const c = A.data.characters.find((item) => item.id === p.characterId);
      if (c) {
        c.maxHp = p.maxHp;
        c.hp = Math.min(c.hp, c.maxHp);
      }
      A.save();
      A.renderInitiative();
    }
  };
  $("#start-combat").onclick = () => {
    const source = [...A.data.initiative];
    A.data.characters
      .filter((c) => c.kind === "player" && !source.some((item) => item.name === c.name))
      .forEach((c) => source.push({ name: c.name, value: 10 + A.modifier(c.abilities?.dex) }));
    if (!source.length) return A.toast("Сначала добавьте участников боя");
    A.data.combat = {
      active: true,
      round: 1,
      turnIndex: 0,
      participants: source
        .map((item) => {
          const c = A.data.characters.find((character) => character.name === item.name);
          return {
            id: crypto.randomUUID(),
            characterId: c?.id || "",
            name: item.name,
            kind: c?.kind || "enemy",
            initiative: Number(item.value || 0),
            hp: Number(c?.hp ?? 1),
            maxHp: Number(c?.maxHp ?? c?.hp ?? 1),
            deathSuccesses: Number(c?.deathSuccesses || 0),
            deathFailures: Number(c?.deathFailures || 0),
            conditions: [],
          };
        })
        .sort((a, b) => b.initiative - a.initiative),
    };
    A.save();
    A.renderInitiative();
    A.toast("Бой начался");
  };
  $("#next-combat-turn").onclick = () => {
    const c = A.data.combat;
    if (!c.active || !c.participants.length) return;
    tickConditions(c.participants, "turn", c.turnIndex);
    c.turnIndex++;
    if (c.turnIndex >= c.participants.length) {
      c.turnIndex = 0;
      c.round++;
      tickConditions(c.participants, "round");
    }
    A.save();
    A.renderInitiative();
  };
  $("#end-combat").onclick = () => {
    if (!confirm("Завершить текущий бой?")) return;
    A.data.combat.active = false;
    A.save();
    A.renderInitiative();
    A.toast("Бой завершён");
  };
  $("#global-search").oninput = (e) => {
    $$(".character-card,.lore-card").forEach(
      (card) =>
        (card.style.display = card.textContent.toLowerCase().includes(e.target.value.toLowerCase())
          ? ""
          : "none"),
    );
  };
  $$("[data-master-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-master-tab]").forEach((x) => x.classList.toggle("active", x === b));
        $$(".master-view").forEach((v) =>
          v.classList.toggle("active", v.id === `master-${b.dataset.masterTab}`),
        );
      }),
  );
  $("#new-pack").onclick = () => {
    const name = prompt("Название новой пачки:");
    if (!name?.trim()) return;
    const pack = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type: prompt("Тип пачки:", "NPC") || "Группа",
    };
    A.data.packs.push(pack);
    A.selectedPackId = pack.id;
    A.save();
    A.renderWorkshop();
  };
  $("#rename-pack").onclick = () => {
    const p = A.data.packs.find((x) => x.id === A.selectedPackId),
      name = p && prompt("Новое название пачки:", p.name);
    if (name?.trim()) {
      p.name = name.trim();
      A.save();
      A.renderAll();
    }
  };
  $("#delete-pack").onclick = () => {
    const p = A.data.packs.find((x) => x.id === A.selectedPackId);
    if (!p) return;
    if (A.data.characters.some((c) => c.packId === p.id))
      return A.toast("Сначала перенесите персонажей из этой пачки");
    if (confirm(`Удалить пачку «${p.name}»?`)) {
      A.data.packs.splice(A.data.packs.indexOf(p), 1);
      A.selectedPackId = "all";
      A.save();
      A.renderAll();
    }
  };
  $("#new-entity").onclick = () => A.openCharacterSheet();
  $("#new-npc").onclick = () => A.openNpcDossier();
  $("#new-note-section").onclick = () => {
    const name = prompt("Название раздела блокнота:");
    if (name?.trim()) {
      const s = { id: crypto.randomUUID(), name: name.trim() };
      A.data.noteSections.push(s);
      A.selectedNoteSectionId = s.id;
      A.save();
      A.renderWorkshop();
    }
  };
  $("#rename-note-section").onclick = () => {
    const s = A.data.noteSections.find((x) => x.id === A.selectedNoteSectionId),
      name = s && prompt("Новое название раздела:", s.name);
    if (name?.trim()) {
      s.name = name.trim();
      A.save();
      A.renderWorkshop();
    }
  };
  $("#new-note").onclick = () => {
    const n = {
      id: crypto.randomUUID(),
      sectionId: A.selectedNoteSectionId === "all" ? A.data.noteSections[0]?.id : A.selectedNoteSectionId,
      title: "Новая запись",
      tags: [],
      body: "",
    };
    A.data.masterNotes.unshift(n);
    A.selectedNoteId = n.id;
    A.save();
    A.renderWorkshop();
  };
  $("#note-editor").onsubmit = (e) => {
    e.preventDefault();
    const n = A.data.masterNotes.find((x) => x.id === A.selectedNoteId);
    if (!n) return;
    n.title = $("#note-title").value.trim();
    n.tags = $("#note-tags")
      .value.split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    n.body = $("#note-body").value;
    A.save();
    A.renderWorkshop();
    A.toast("Запись сохранена");
  };
  $("#delete-note").onclick = () => {
    const i = A.data.masterNotes.findIndex((x) => x.id === A.selectedNoteId);
    if (i >= 0 && confirm("Удалить запись?")) {
      A.data.masterNotes.splice(i, 1);
      A.selectedNoteId = null;
      A.save();
      A.renderWorkshop();
    }
  };
  $("#new-session").onclick = () => A.openSessionEditor();
  $("#calendar-prev").onclick = () => {
    A.calendarCursor = new Date(A.calendarCursor.getFullYear(), A.calendarCursor.getMonth() - 1, 1);
    A.renderCalendar();
  };
  $("#calendar-next").onclick = () => {
    A.calendarCursor = new Date(A.calendarCursor.getFullYear(), A.calendarCursor.getMonth() + 1, 1);
    A.renderCalendar();
  };
  $("#calendar-today").onclick = () => {
    const now = new Date();
    A.calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    A.renderCalendar();
  };
  $("#session-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      session = A.data.sessions.find((item) => item.id === A.editingSessionId) || { id: crypto.randomUUID() };
    ["title", "date", "time", "status", "plan", "summary"].forEach(
      (key) => (session[key] = f.elements[key].value),
    );
    if (!A.data.sessions.some((item) => item.id === session.id)) A.data.sessions.push(session);
    A.calendarCursor = new Date(`${session.date}T12:00:00`);
    A.calendarCursor = new Date(A.calendarCursor.getFullYear(), A.calendarCursor.getMonth(), 1);
    A.save();
    A.renderAll();
    $("#session-dialog").close();
    A.toast("Сессия сохранена");
  };
  $("#delete-session").onclick = () => {
    const index = A.data.sessions.findIndex((item) => item.id === A.editingSessionId);
    if (index >= 0 && confirm("Удалить эту сессию и её журнал?")) {
      A.data.sessions.splice(index, 1);
      A.save();
      A.renderAll();
      $("#session-dialog").close();
    }
  };
  $("#upload-media-button").onclick = () => $("#upload-media-input").click();
  $("#upload-media-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await A.uploadImage(file, $("#media-category").value, $("#media-title").value);
      $("#media-title").value = "";
      e.target.value = "";
      A.renderMedia();
      A.toast("Изображение загружено");
    } catch (error) {
      A.toast(error.message);
    }
  };
  $("#upload-character-portrait").onclick = () => $("#character-portrait-input").click();
  $("#character-portrait-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const image = await A.uploadImage(file, "portrait", $("#sheet-form").elements.name.value || file.name);
      A.editingPortraitUrl = image.url;
      e.target.value = "";
      A.updatePortraitPreview();
      A.toast("Портрет загружен");
    } catch (error) {
      A.toast(error.message);
    }
  };
  $("#remove-character-portrait").onclick = () => {
    A.editingPortraitUrl = "";
    A.updatePortraitPreview();
  };
  $("#npc-portrait-select").onchange = () => A.updateNpcPortrait();
  $("#npc-form").oninput = (e) => {
    if (e.target.name === "name") $("#npc-dialog-title").textContent = e.target.value || "Новый NPC";
  };
  $("#npc-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      c =
        A.editingNpcIndex === null
          ? {
              id: crypto.randomUUID(),
              kind: "npc",
              packId: A.selectedPackId === "all" ? A.data.packs[0]?.id : A.selectedPackId,
              abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            }
          : A.data.characters[A.editingNpcIndex];
    c.kind = "npc";
    c.name = f.elements.name.value.trim();
    c.race = f.elements.race.value;
    c.portraitUrl = f.elements.portraitUrl.value;
    c.ac = Number(f.elements.ac.value || 0);
    c.hp = c.maxHp = Math.max(0, Number(f.elements.hp.value || 0));
    c.npc = {};
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
    ].forEach((key) => (c.npc[key] = f.elements[key].value));
    c.npc.visibleToPlayers = f.elements.visibleToPlayers.checked;
    c.npc.visibleToCharacterIds = $$("#npc-player-access input:checked").map((input) => input.value);
    c.npc.publicFields = $$("#npc-public-fields input:checked").map((input) => input.value);
    if (!c.npc.publicFields.length) {
      c.npc.visibleToPlayers = false;
      c.npc.visibleToCharacterIds = [];
    }
    if (A.editingNpcIndex === null) A.data.characters.push(c);
    A.normalizeData();
    A.save();
    A.renderAll();
    $("#npc-dialog").close();
    A.toast("Досье NPC сохранено");
  };
  $("#delete-npc").onclick = () => {
    if (A.editingNpcIndex !== null && confirm("Удалить этого NPC?")) {
      A.data.characters.splice(A.editingNpcIndex, 1);
      A.save();
      A.renderAll();
      $("#npc-dialog").close();
    }
  };
  $("#upload-lore-image").onclick = () => $("#lore-image-input").click();
  $("#lore-image-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const image = await A.uploadImage(file, "other", $("#lore-form").elements.title.value || file.name);
      A.editingLoreImages.push({ id: image.id, url: image.url, title: image.title });
      e.target.value = "";
      A.renderLoreImages();
      A.toast("Изображение добавлено");
    } catch (error) {
      A.toast(error.message);
    }
  };
  $("#new-monster").onclick = () => A.openMonsterEditor();
  $("#new-shop").onclick = () => A.openShopEditor();
  ["#monster-filter-type", "#monster-filter-cr", "#monster-filter-tag"].forEach(
    (id) => ($(id).onchange = () => A.renderBestiary()),
  );
  $("#add-monster-action").onclick = () => {
    A.editingMonsterActions.push({ name: "", description: "" });
    A.renderMonsterActions();
  };
  $("#add-shop-item").onclick = () => {
    A.editingShopItems.push({ name: "", price: "", quantity: "∞", description: "", sold: false });
    A.renderShopItems();
  };
  ["input", "change"].forEach((event) =>
    $("#monster-actions-editor").addEventListener(event, (e) => {
      const row = e.target.closest("[data-monster-action]"),
        field = e.target.dataset.actionField;
      if (row && field) A.editingMonsterActions[+row.dataset.monsterAction][field] = e.target.value;
    }),
  );
  ["input", "change"].forEach((event) =>
    $("#shop-items-editor").addEventListener(event, (e) => {
      const row = e.target.closest("[data-shop-item]"),
        field = e.target.dataset.itemField;
      if (row && field) {
        A.editingShopItems[+row.dataset.shopItem][field] =
          e.target.type === "checkbox" ? e.target.checked : e.target.value;
        row.classList.toggle("sold", A.editingShopItems[+row.dataset.shopItem].sold);
      }
    }),
  );
  $("#monster-form").oninput = (e) => {
    if (e.target.name?.startsWith("monster-") && !e.target.name.startsWith("monster-save-")) {
      const k = e.target.name.slice(8);
      $(`[data-monster-mod="${k}"]`).textContent = A.signed(A.modifier(e.target.value));
    }
  };
  $("#monster-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      m = A.data.bestiary.find((x) => x.id === A.editingMonsterId) || { id: crypto.randomUUID() };
    [
      "name",
      "type",
      "size",
      "alignment",
      "hitDice",
      "speed",
      "skills",
      "damageImmunities",
      "damageResistances",
      "damageVulnerabilities",
      "conditionImmunities",
      "senses",
      "languages",
      "cr",
      "campaignTag",
      "traits",
      "reactions",
      "legendaryActions",
      "lair",
      "dmNotes",
    ].forEach((k) => (m[k] = f.elements[k].value));
    ["ac", "hp", "passivePerception", "xp"].forEach((k) => (m[k] = Number(f.elements[k].value || 0)));
    m.abilities = Object.fromEntries(
      A.abilities.map(([k]) => [k, Number(f.elements[`monster-${k}`].value || 10)]),
    );
    m.advantageSaves = A.abilities.filter(([k]) => f.elements[`monster-save-${k}`].checked).map(([k]) => k);
    m.actions = structuredClone(A.editingMonsterActions);
    if (!A.data.bestiary.some((x) => x.id === m.id)) A.data.bestiary.push(m);
    A.save();
    A.renderBestiary();
    $("#monster-dialog").close();
    A.toast("Существо сохранено");
  };
  $("#delete-monster").onclick = () => {
    const i = A.data.bestiary.findIndex((x) => x.id === A.editingMonsterId);
    if (i >= 0 && confirm("Удалить существо?")) {
      A.data.bestiary.splice(i, 1);
      A.save();
      A.renderBestiary();
      $("#monster-dialog").close();
    }
  };
  $("#shop-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      s = A.data.shops.find((x) => x.id === A.editingShopId) || { id: crypto.randomUUID() };
    ["name", "locationId", "status", "description"].forEach((k) => (s[k] = f.elements[k].value));
    s.visibleToPlayers = f.elements.visibleToPlayers.checked;
    s.visibleToCharacterIds = $$("#shop-player-access input:checked").map((x) => x.value);
    s.items = structuredClone(A.editingShopItems);
    if (!A.data.shops.some((x) => x.id === s.id)) A.data.shops.push(s);
    A.save();
    A.renderShops();
    $("#shop-dialog").close();
    A.toast("Магазин сохранён");
  };
  $("#delete-shop").onclick = () => {
    const i = A.data.shops.findIndex((x) => x.id === A.editingShopId);
    if (i >= 0 && confirm("Удалить магазин?")) {
      A.data.shops.splice(i, 1);
      A.save();
      A.renderShops();
      $("#shop-dialog").close();
    }
  };
  $("#sheet-form").addEventListener("input", () => A.updateSheetCalculations());
  $("#sheet-form").addEventListener("change", () => A.updateSheetCalculations());
  $("#save-player-access").onclick = () => A.savePlayerAccess();
  $("#delete-player-access").onclick = () => A.deletePlayerAccess();
  $("#create-shared-player-invite").onclick = async () => {
    if (
      !$("#revoke-shared-player-invite").classList.contains("hidden") &&
      !confirm("Создать новую общую ссылку? Старая ссылка перестанет работать.")
    )
      return;
    const response = await fetch("/api/master/shared-player-invitation", { method: "POST" });
    const result = await response.json();
    if (!response.ok) return A.toast(result.error || "Не удалось создать общую ссылку");
    await A.renderPlayerRoster();
    A.toast("Общая ссылка готова");
  };
  $("#revoke-shared-player-invite").onclick = async () => {
    if (!confirm("Отозвать общую ссылку? Новые игроки больше не смогут зарегистрироваться по ней.")) return;
    const response = await fetch("/api/master/shared-player-invitation", { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return A.toast(result.error || "Не удалось отозвать общую ссылку");
    await A.renderPlayerRoster();
    A.toast("Общая ссылка отозвана");
  };
  $("#shared-player-invite-result").onclick = async (e) => {
    const url = e.target.dataset.copySharedInvite;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    A.toast("Ссылка скопирована");
  };
  $("#player-invite-form").onsubmit = async (e) => {
    e.preventDefault();
    const response = await fetch("/api/master/player-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: $("#player-invite-name").value }),
      }),
      result = await response.json();
    if (!response.ok) return A.toast(result.error || "Не удалось создать приглашение");
    const url = `${location.origin}/player.html?invite=${encodeURIComponent(result.token)}`,
      box = $("#player-invite-result");
    box.innerHTML = `<code>${A.escapeHtml(url)}</code><button type="button" id="copy-player-invite">Копировать</button>`;
    box.classList.remove("hidden");
    $("#copy-player-invite").onclick = async () => {
      await navigator.clipboard.writeText(url);
      A.toast("Ссылка скопирована");
    };
    $("#player-invite-name").value = "";
    A.renderPlayerRoster();
  };
  $("#player-account-roster").onclick = async (e) => {
    const id = e.target.dataset.togglePlayer;
    if (!id) return;
    await fetch(`/api/master/player-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: e.target.dataset.enabled !== "true" }),
    });
    A.renderPlayerRoster();
  };
  $("#player-invitation-list").onclick = async (e) => {
    const id = e.target.dataset.deleteInvite;
    if (!id) return;
    await fetch(`/api/master/player-invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    A.renderPlayerRoster();
  };
  $$("[data-sheet-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-sheet-tab]").forEach((x) => x.classList.toggle("active", x === b));
        $$(".sheet-tab-page").forEach((p) =>
          p.classList.toggle("active", p.id === `sheet-tab-${b.dataset.sheetTab}`),
        );
      }),
  );
  $("#add-spell").onclick = () => {
    A.editingSpells.push({
      name: "Новое заклинание",
      level: 0,
      prepared: false,
      ritual: false,
      concentration: false,
      _editing: true,
    });
    A.renderSpells();
  };
  $("#add-feature-card").onclick = () => {
    A.editingFeatures.push({ name: "", description: "", _editing: true });
    A.renderFeatures();
  };
  $("#add-attack-card").onclick = () => {
    A.editingAttackCards.push({
      name: "",
      damageDie: "",
      proficient: false,
      description: "",
      _editing: true,
    });
    A.renderAttacks();
  };
  $$("[data-add-trait]").forEach(
    (button) =>
      (button.onclick = () => {
        A.editingTraitCards[button.dataset.addTrait].push({ name: "", description: "", _editing: true });
        A.renderTraits();
      }),
  );
  ["input", "change"].forEach((event) =>
    $("#spell-list").addEventListener(event, (e) => {
      const card = e.target.closest("[data-spell-card]"),
        field = e.target.dataset.spellField;
      if (card && field)
        A.editingSpells[+card.dataset.spellCard][field] =
          e.target.type === "checkbox" ? e.target.checked : e.target.value;
    }),
  );
  ["input", "change"].forEach((event) =>
    $("#feature-cards-editor").addEventListener(event, (e) => {
      const card = e.target.closest("[data-feature-card]"),
        field = e.target.dataset.featureField;
      if (card && field) A.editingFeatures[+card.dataset.featureCard][field] = e.target.value;
    }),
  );
  ["input", "change"].forEach((event) =>
    $("#attack-cards-editor").addEventListener(event, (e) => {
      const card = e.target.closest("[data-attack-card]"),
        field = e.target.dataset.attackField;
      if (card && field)
        A.editingAttackCards[+card.dataset.attackCard][field] =
          e.target.type === "checkbox" ? e.target.checked : e.target.value;
    }),
  );
  ["input", "change"].forEach((event) =>
    $$("[data-trait-cards]").forEach((container) =>
      container.addEventListener(event, (e) => {
        const card = e.target.closest("[data-trait-card]"),
          field = e.target.dataset.traitField;
        if (card && field) {
          const [key, index] = card.dataset.traitCard.split(":");
          A.editingTraitCards[key][+index][field] = e.target.value;
        }
      }),
    ),
  );
  $("#sheet-form").onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") return $("#sheet-dialog").close();
    const f = e.currentTarget,
      c =
        A.editingCharacterIndex === null
          ? { id: crypto.randomUUID() }
          : A.data.characters[A.editingCharacterIndex];
    [
      "name",
      "kind",
      "player",
      "packId",
      "className",
      "race",
      "background",
      "alignment",
      "proficiencies",
      "spellcastingClass",
      "spellAbility",
      "spellNotes",
      "equipment",
      "dmNotes",
    ].forEach((k) => (c[k] = f.elements[k].value));
    [
      "level",
      "xp",
      "maxHp",
      "tempHp",
      "ac",
      "speed",
      "gold",
      "deathSuccesses",
      "deathFailures",
      "cp",
      "sp",
      "ep",
      "pp",
      "hitDieType",
      "hitDiceTotal",
      "usedHitDice",
    ].forEach((k) => (c[k] = Number(f.elements[k].value || 0)));
    c.hp = Math.max(0, Math.min(c.maxHp, Number(f.elements.hp.value || 0)));
    c.usedHitDice = Math.min(c.hitDiceTotal, c.usedHitDice);
    c.portraitUrl = A.editingPortraitUrl;
    c.playerAccessEnabled = $("#player-access-enabled").checked;
    c.inspiration = f.elements.inspiration.checked;
    c.abilities = Object.fromEntries(
      A.abilities.map(([k]) => [
        k,
        Math.max(1, Math.min(30, Number(f.elements[`ability-${k}`].value || 10))),
      ]),
    );
    c.saveProficiencies = A.abilities.filter(([k]) => f.elements[`save-${k}`].checked).map(([k]) => k);
    c.skillProficiencies = A.skills.filter(([k]) => f.elements[`skill-${k}`].checked).map(([k]) => k);
    c.skillExpertise = A.skills.filter(([k]) => f.elements[`expertise-${k}`].checked).map(([k]) => k);
    c.spellSlots = Array.from({ length: 9 }, (_, i) => ({
      level: i + 1,
      max: Number(f.elements[`slot-max-${i + 1}`].value || 0),
      used: Number(f.elements[`slot-used-${i + 1}`].value || 0),
    }));
    c.spells = A.editingSpells.map(({ _editing, ...spell }) => spell);
    c.featureCards = A.editingFeatures.map(({ name, description }) => ({ name, description }));
    c.attackCards = A.editingAttackCards.map(({ name, damageDie, proficient, description }) => ({
      name,
      damageDie,
      proficient,
      description,
    }));
    c.traitCards = Object.fromEntries(
      Object.entries(A.editingTraitCards).map(([key, items]) => [
        key,
        items.map(({ name, description }) => ({ name, description })),
      ]),
    );
    c.features = c.attacks = c.personality = c.ideals = c.bonds = c.flaws = "";
    c.group = A.data.packs.find((p) => p.id === c.packId)?.name || "";
    if (A.editingCharacterIndex === null) A.data.characters.push(c);
    A.normalizeData();
    A.save();
    A.renderAll();
    $("#sheet-dialog").close();
    A.toast("Лист сохранён");
  };
  $("#delete-sheet").onclick = () => {
    if (A.editingCharacterIndex !== null && confirm("Удалить персонажа или NPC?")) {
      A.data.characters.splice(A.editingCharacterIndex, 1);
      A.save();
      A.renderAll();
      $("#sheet-dialog").close();
    }
  };
})();
