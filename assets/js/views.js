Object.assign(DndApp, {
  // Этот файл рисует страницы и карточки из DndApp.data.
  // Обработчики кликов находятся в events.js, а редакторы — в sheets.js.
  navigate(id) {
    this.$$(".page").forEach((page) => page.classList.toggle("active", page.id === id));
    this.$$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.page === id));
    const titles = {
      overview: `${this.data.campaignSettings?.greeting || "Добрый вечер"}, ${this.data.campaignSettings?.masterName || "Хранитель"}`,
      heroes: "Герои вашей истории",
      world: "Мир и его тайны",
      calendar: "Календарь кампании",
      media: "Медиатека кампании",
      bestiary: "Бестиарий кампании",
      shops: "Магазины и торговцы",
      tools: "Инструменты мастера",
      workshop: "Личная мастерская",
    };
    this.$("#page-title").textContent = titles[id];
    this.$(".sidebar").classList.remove("open");
  },

  characterCard(c) {
    const index = this.data.characters.indexOf(c);
    const pack = this.data.packs.find((item) => item.id === c.packId);
    const portrait = c.portraitUrl
      ? `<img class="portrait portrait-image" src="${this.escapeHtml(c.portraitUrl)}" alt="">`
      : `<span class="portrait">${this.initials(c.name)}</span>`;
    if (c.kind === "npc") {
      const status =
        { alive: "Жив", dead: "Мёртв", missing: "Пропал", unknown: "Неизвестно" }[c.npc?.status] ||
        "Статус не указан";
      const location =
        this.data.lore.find((item) => item.id === c.npc?.locationId)?.title || "Место не указано";
      const faction = this.data.lore.find((item) => item.id === c.npc?.factionId)?.title || "Без фракции";
      const publicCount = c.npc?.publicFields?.length || 0;
      const hasAudience = c.npc?.visibleToPlayers || c.npc?.visibleToCharacterIds?.length;
      return `<article class="character-card npc-card openable" data-view-npc="${index}"><button type="button" class="npc-card-edit" data-edit-npc="${index}" aria-label="Редактировать NPC" title="Редактировать">✎</button><div class="character-head">${portrait}<div><h3>${this.escapeHtml(c.name)}</h3><p>${this.escapeHtml(c.npc?.nickname || c.race || "NPC")} · ${this.escapeHtml(status)}</p></div></div><div class="npc-card-details"><span>${this.escapeHtml(location)}</span><span>${this.escapeHtml(faction)}</span></div><div class="npc-card-preview">${window.RichText.render(c.npc?.character || "Характер пока не описан", this.escapeHtml)}</div><div class="character-foot"><span>${publicCount && hasAudience ? `Игрокам открыто блоков: ${publicCount}` : "Скрыт от игроков"}</span><button type="button" class="text-button" data-view-npc="${index}">Открыть досье →</button></div></article>`;
    }
    return `<article class="character-card openable" data-open-sheet="${index}"><div class="character-head">${portrait}<div><h3>${this.escapeHtml(c.name)}</h3><p>${this.escapeHtml(c.className || "Без класса")} · ${this.escapeHtml(pack?.name || "Без пачки")}</p></div><div class="level">${c.kind === "npc" ? "Опасность" : "Уровень"}<strong>${c.level}</strong></div></div><div class="char-stats"><div><span>Здоровье</span><strong>${c.hp}/${c.maxHp}</strong></div><div><span>Класс брони</span><strong>${c.ac}</strong></div><div><span>Инициатива</span><strong>${this.signed(this.modifier(c.abilities?.dex))}</strong></div></div><div class="character-foot"><span>${c.kind === "npc" ? "NPC · " + (c.player || "роль не указана") : "Игрок: " + (c.player || "")}</span><button class="text-button" data-open-sheet="${index}">Открыть лист →</button></div></article>`;
  },

  renderOverview() {
    const players = this.data.characters.filter((c) => c.kind === "player");
    this.$("#heroes-count").textContent = players.length;
    const hp = players.length
      ? (players.reduce((sum, c) => sum + (c.maxHp ? c.hp / c.maxHp : 0), 0) / players.length) * 100
      : 0;
    this.$("#health-average").textContent = `${Math.round(hp)}%`;
    this.$("#gold-total").textContent = players
      .reduce((sum, c) => sum + Number(c.gold || 0), 0)
      .toLocaleString("ru");
    this.$("#overview-party").innerHTML = players
      .slice(0, 4)
      .map(
        (c) =>
          `<div class="party-row"><span class="portrait">${this.initials(c.name)}</span><div><strong>${this.escapeHtml(c.name)}</strong><small>${this.escapeHtml(c.className || "")} · ${c.level} уровень</small></div><div><div class="hpbar"><i style="width:${c.maxHp ? (c.hp / c.maxHp) * 100 : 0}%"></i></div><div class="hptext">${c.hp} / ${c.maxHp} здоровья</div></div><small>${this.escapeHtml(this.data.packs.find((p) => p.id === c.packId)?.name || "")}</small></div>`,
      )
      .join("");
    this.$("#task-counter").textContent =
      `${this.data.tasks.filter((t) => t.done).length} / ${this.data.tasks.length}`;
    this.$("#task-list").innerHTML = this.data.tasks
      .map(
        (task, i) =>
          `<label class="task ${task.done ? "done" : ""}"><input type="checkbox" data-task="${i}" ${task.done ? "checked" : ""}>${this.escapeHtml(task.text)}</label>`,
      )
      .join("");
  },

  renderCharacters(group = this.selectedPlayerGroup) {
    this.selectedPlayerGroup = group;
    const packs = this.data.packs.filter((pack) =>
      this.data.characters.some((c) => c.kind === "player" && c.packId === pack.id),
    );
    this.$("#character-filters").innerHTML =
      `<button class="filter ${group === "all" ? "active" : ""}" data-group="all">Все герои</button>` +
      packs
        .map(
          (pack) =>
            `<button class="filter ${group === pack.name ? "active" : ""}" data-group="${this.escapeHtml(pack.name)}">${this.escapeHtml(pack.name)}</button>`,
        )
        .join("");
    const list = this.data.characters.filter(
      (c) =>
        c.kind === "player" &&
        (group === "all" || this.data.packs.find((p) => p.id === c.packId)?.name === group),
    );
    this.$("#character-grid").innerHTML =
      list.map((c) => this.characterCard(c)).join("") || "<p>В этой группе пока нет героев.</p>";
    this.renderPlayerRoster();
  },

  renderCampaignChrome() {
    const settings = this.data.campaignSettings || {};
    const campaignName = settings.campaignName || "Моя кампания";
    const now = new Date();
    const upcoming = [...this.data.sessions]
      .filter(
        (session) =>
          session.status === "planned" && session.date && new Date(`${session.date}T23:59:59`) >= now,
      )
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    const completed = this.data.sessions.filter((session) => session.status === "completed").length;
    const days = upcoming ? Math.ceil((new Date(`${upcoming.date}T12:00:00`) - now) / 86400000) : null;
    document.title = `${settings.brandTitle || "Архив мастера"} · ${campaignName}`;
    document.documentElement.style.setProperty(
      "--gold",
      /^#[0-9a-f]{6}$/i.test(settings.accentColor || "") ? settings.accentColor : "#d7aa5e",
    );
    const banner = this.$(".hero-banner");
    banner.style.backgroundImage = settings.heroImageUrl
      ? `linear-gradient(100deg, #201a15ee 20%, #1c1713aa 57%, #141311dd), url("${String(settings.heroImageUrl).replaceAll('"', "%22")}")`
      : "";
    banner.style.backgroundSize = settings.heroImageUrl ? "cover" : "";
    banner.style.backgroundPosition = settings.heroImageUrl ? "center" : "";
    this.$("#brand-title").textContent = settings.brandTitle || "Архив мастера";
    this.$("#brand-eyebrow").textContent = settings.brandEyebrow || "Личная летопись";
    const profile = this.$("#master-profile");
    const masterName = settings.masterName || "Хранитель";
    profile.querySelector("strong").textContent = masterName;
    profile.querySelector("small").textContent = settings.masterTitle || "Dungeon Master";
    profile.querySelector(".avatar").textContent =
      masterName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "DM";
    this.$("#sidebar-campaign-name").textContent = campaignName;
    this.$("#sidebar-campaign-meta").textContent =
      `${completed} сыграно${settings.campaignChapter ? ` · ${settings.campaignChapter}` : ""}`;
    this.$("#topbar-caption").textContent = settings.campaignChapter || campaignName;
    this.$("#world-heading").textContent = settings.worldTitle || `Атлас · ${campaignName}`;
    if (this.$("#overview").classList.contains("active"))
      this.$("#page-title").textContent =
        `${settings.greeting || "Добрый вечер"}, ${settings.masterName || "Хранитель"}`;
    this.$("#hero-kicker").textContent =
      settings.heroKicker ||
      (upcoming
        ? `Следующая игра${days === 0 ? " · сегодня" : days === 1 ? " · завтра" : ` · через ${days} дн.`}`
        : "Следующая игра ещё не назначена");
    this.$("#hero-title").textContent = settings.heroTitle || upcoming?.title || campaignName;
    this.$("#hero-description").textContent =
      settings.heroDescription ||
      upcoming?.plan ||
      settings.campaignDescription ||
      "Здесь появится описание кампании или план ближайшей сессии.";
    this.$("#hero-session-number").textContent = completed + 1;
    this.$("#hero-session-name").textContent = upcoming?.title ? `«${upcoming.title}»` : "Не назначена";
  },

  async renderPlayerRoster() {
    try {
      const [accountsResponse, invitationsResponse, sharedInvitationResponse] = await Promise.all([
        fetch("/api/master/player-accounts"),
        fetch("/api/master/player-invitations"),
        fetch("/api/master/shared-player-invitation"),
      ]);
      const accounts = await accountsResponse.json();
      const invitations = await invitationsResponse.json();
      const sharedInvitation = sharedInvitationResponse.ok ? await sharedInvitationResponse.json() : null;
      const sharedBox = this.$("#shared-player-invite-result");
      const createSharedButton = this.$("#create-shared-player-invite");
      const revokeSharedButton = this.$("#revoke-shared-player-invite");
      if (sharedInvitation?.token) {
        const sharedUrl = `${location.origin}/player.html?invite=${encodeURIComponent(sharedInvitation.token)}`;
        sharedBox.innerHTML = `<code>${this.escapeHtml(sharedUrl)}</code><button type="button" data-copy-shared-invite="${this.escapeHtml(sharedUrl)}">Копировать</button>`;
        sharedBox.classList.remove("hidden");
        createSharedButton.textContent = "Создать новую ссылку";
        revokeSharedButton.classList.remove("hidden");
      } else {
        sharedBox.innerHTML = "";
        sharedBox.classList.add("hidden");
        createSharedButton.textContent = "Создать общую ссылку";
        revokeSharedButton.classList.add("hidden");
      }
      this.$("#player-account-roster").innerHTML =
        `<strong>Зарегистрированные игроки · ${accounts.length}</strong>` +
        accounts
          .map((account) => {
            const character = this.data.characters.find((item) => item.id === account.character_id);
            return `<div class="player-account-row"><span><b>${this.escapeHtml(account.display_name || account.username)}</b><small>@${this.escapeHtml(account.username)}</small></span><span>${this.escapeHtml(character?.name || "Лист не найден")}</span><button data-toggle-player="${account.id}" data-enabled="${account.enabled}">${account.enabled ? "Отключить вход" : "Включить вход"}</button></div>`;
          })
          .join("");
      this.$("#player-invitation-list").innerHTML =
        `<strong>Ожидают регистрации · ${invitations.length}</strong>` +
        invitations
          .map(
            (invite) =>
              `<div class="player-account-row"><span><b>${this.escapeHtml(invite.display_name || "Без имени")}</b><small>ссылка действует до ${new Date(invite.expires_at).toLocaleDateString("ru")}</small></span><span>Ещё не зарегистрирован</span><button data-delete-invite="${invite.id}">Отозвать</button></div>`,
          )
          .join("");
    } catch {}
  },

  renderLore(type = "all") {
    const list = type === "all" ? this.data.lore : this.data.lore.filter((entry) => entry.type === type);
    this.$("#lore-list").innerHTML =
      list
        .map((entry) => {
          const index = this.data.lore.indexOf(entry);
          const audience = entry.visibleToPlayers
            ? "Всем игрокам"
            : entry.visibleToCharacterIds?.length
              ? `${entry.visibleToCharacterIds.length} игрокам`
              : "Только мастеру";
          const cover = entry.images?.[0]?.url
            ? `<img class="lore-card-image" src="${this.escapeHtml(entry.images[0].url)}" alt="">`
            : "";
          return `<article class="lore-card openable" data-view-lore="${index}"><button type="button" class="lore-card-edit" data-edit-lore="${index}" aria-label="Редактировать запись" title="Редактировать">✎</button>${cover}<header><span class="tag">${this.escapeHtml(entry.type)}</span><span class="lore-open">Открыть карточку →</span></header><h3>${this.escapeHtml(entry.title)}</h3>${entry.type === "Фракция" && entry.ideology ? `<strong class="lore-ideology-preview">${window.RichText.render(entry.ideology, this.escapeHtml)}</strong>` : ""}<div class="lore-card-excerpt">${window.RichText.render(entry.text, this.escapeHtml)}</div><small class="lore-audience">${audience}</small></article>`;
        })
        .join("") ||
      `<div class="empty-state"><strong>Записей пока нет</strong><span>Создайте первое место, фракцию или легенду.</span></div>`;
  },

  renderCalendar() {
    const cursor = this.calendarCursor;
    const year = cursor.getFullYear(),
      month = cursor.getMonth();
    this.$("#calendar-month").textContent = cursor.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - startOffset);
    const today = new Date().toISOString().slice(0, 10);
    this.$("#calendar-grid").innerHTML = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const sessions = this.data.sessions.filter((item) => item.date === iso);
      return `<button class="calendar-day ${date.getMonth() !== month ? "outside" : ""} ${iso === today ? "today" : ""}" data-session-date="${iso}"><b>${date.getDate()}</b>${sessions.map((session) => `<span class="${session.status}" data-open-session="${session.id}">${this.escapeHtml(session.time || "Сессия")} · ${this.escapeHtml(session.title)}</span>`).join("")}</button>`;
    }).join("");
    const sorted = [...this.data.sessions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    this.$("#session-list").innerHTML =
      sorted
        .map(
          (session) =>
            `<button class="session-entry ${session.status}" data-open-session="${session.id}"><time>${session.date ? new Date(`${session.date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "Без даты"}${session.time ? ` · ${session.time}` : ""}</time><strong>${this.escapeHtml(session.title)}</strong><small>${session.status === "completed" ? "Сыграна" : session.status === "cancelled" ? "Отменена" : "Запланирована"}${session.summary ? " · есть краткое содержание" : ""}</small></button>`,
        )
        .join("") ||
      `<div class="empty-state"><strong>Сессий пока нет</strong><span>Запланируйте первую игру.</span></div>`;
  },

  async renderMedia() {
    try {
      const response = await fetch("/api/master/images");
      if (!response.ok) return;
      this.mediaAssets = await response.json();
      const labels = {
        portrait: "Портрет",
        artifact: "Артефакт",
        note: "Записка",
        map: "Карта",
        other: "Прочее",
      };
      this.$("#media-gallery").innerHTML =
        this.mediaAssets
          .map(
            (asset) =>
              `<article class="media-card"><button class="media-open" data-open-image="${this.escapeHtml(asset.url)}"><img src="${this.escapeHtml(asset.url)}" alt="${this.escapeHtml(asset.title)}"></button><div><span>${labels[asset.category] || asset.category}</span><strong>${this.escapeHtml(asset.title || asset.original_name)}</strong><small>${Math.round(asset.size_bytes / 1024)} КБ</small><button class="delete" data-delete-image="${asset.id}">Удалить</button></div></article>`,
          )
          .join("") ||
        `<div class="empty-state"><strong>Медиатека пуста</strong><span>Загрузите первый портрет, артефакт или записку.</span></div>`;
    } catch {}
  },

  renderBestiary() {
    const type = this.$("#monster-filter-type")?.value || "all",
      cr = this.$("#monster-filter-cr")?.value || "all",
      tag = this.$("#monster-filter-tag")?.value || "all";
    const types = [...new Set(this.data.bestiary.map((x) => x.type).filter(Boolean))].sort(),
      crs = [...new Set(this.data.bestiary.map((x) => String(x.cr)).filter(Boolean))].sort(
        (a, b) => Number(a) - Number(b),
      ),
      tags = [...new Set(this.data.bestiary.map((x) => x.campaignTag).filter(Boolean))].sort();
    this.$("#monster-filter-type").innerHTML =
      `<option value="all">Все типы</option>` +
      types.map((x) => `<option ${x === type ? "selected" : ""}>${this.escapeHtml(x)}</option>`).join("");
    this.$("#monster-filter-cr").innerHTML =
      `<option value="all">Любая CR</option>` +
      crs.map((x) => `<option ${x === cr ? "selected" : ""}>${this.escapeHtml(x)}</option>`).join("");
    this.$("#monster-filter-tag").innerHTML =
      `<option value="all">Все арки</option>` +
      tags.map((x) => `<option ${x === tag ? "selected" : ""}>${this.escapeHtml(x)}</option>`).join("");
    const list = this.data.bestiary.filter(
      (x) =>
        (type === "all" || x.type === type) &&
        (cr === "all" || String(x.cr) === cr) &&
        (tag === "all" || x.campaignTag === tag),
    );
    this.$("#bestiary-grid").innerHTML =
      list
        .map(
          (m) =>
            `<details class="monster-card"><summary><div><span>${this.escapeHtml(m.type)} · ${this.escapeHtml(m.size)}${m.campaignTag ? ` · ${this.escapeHtml(m.campaignTag)}` : ""}</span><h3>${this.escapeHtml(m.name)}</h3><small>${this.escapeHtml(m.alignment || "Без мировоззрения")} · CR ${this.escapeHtml(m.cr)} · ${Number(m.xp || 0).toLocaleString("ru")} XP</small></div><div><b>КД ${m.ac}</b><b>${m.hp} HP</b></div></summary><div class="monster-statblock"><button class="text-button monster-edit" data-open-monster="${m.id}">Редактировать</button><p><strong>Скорость</strong> ${this.escapeHtml(m.speed || "—")} · <strong>Кость хитов</strong> ${this.escapeHtml(m.hitDice || "—")}</p><div class="monster-ability-row">${this.abilities.map(([k, l]) => `<span><b>${l.slice(0, 3).toUpperCase()}</b>${m.abilities[k]} (${this.signed(this.modifier(m.abilities[k]))})</span>`).join("")}</div>${m.advantageSaves?.length ? `<p><strong>Спасброски с преимуществом</strong> ${m.advantageSaves.map((k) => this.abilities.find(([key]) => key === k)?.[1] || k).join(", ")}</p>` : ""}${[
              ["Навыки", m.skills],
              ["Иммунитеты", m.damageImmunities],
              ["Сопротивления", m.damageResistances],
              ["Уязвимости", m.damageVulnerabilities],
              ["Иммунитеты к состояниям", m.conditionImmunities],
              ["Чувства", m.senses],
              ["Пассивное восприятие", m.passivePerception],
              ["Языки", m.languages],
            ]
              .filter(([, v]) => v)
              .map(([l, v]) => `<p><strong>${l}</strong> ${this.escapeHtml(v)}</p>`)
              .join(
                "",
              )}${m.traits ? `<section><h4>Особые способности</h4><p>${this.escapeHtml(m.traits)}</p></section>` : ""}${m.actions?.length ? `<section><h4>Действия</h4>${m.actions.map((a) => `<p><strong>${this.escapeHtml(a.name)}.</strong> ${this.escapeHtml(a.description)}</p>`).join("")}</section>` : ""}${[
              ["Реакции", m.reactions],
              ["Легендарные действия", m.legendaryActions],
              ["Логово", m.lair],
              ["Заметки мастера", m.dmNotes],
            ]
              .filter(([, v]) => v)
              .map(([l, v]) => `<section><h4>${l}</h4><p>${this.escapeHtml(v)}</p></section>`)
              .join("")}</div></details>`,
        )
        .join("") ||
      `<div class="empty-state"><strong>Бестиарий пуст</strong><span>Добавьте первое существо.</span></div>`;
  },
  renderShops() {
    this.$("#shop-list").innerHTML =
      this.data.shops
        .map((s) => {
          const location = this.data.lore.find((x) => x.id === s.locationId);
          return `<details class="shop-card ${s.status}"><summary><div><span>${s.status === "open" ? "Открыт" : s.status === "closed" ? "Закрыт" : "Недоступен"}</span><h3>${this.escapeHtml(s.name)}</h3><small>${this.escapeHtml(location?.title || "Без локации")} · ${s.items.filter((x) => !x.sold).length} товаров в продаже</small></div><button class="text-button" data-open-shop="${s.id}">Редактировать</button></summary><p>${this.escapeHtml(s.description)}</p><div class="shop-table"><div class="shop-row head"><b>Товар</b><b>Цена</b><b>Наличие</b><b>Свойства</b></div>${s.items.map((i) => `<div class="shop-row ${i.sold ? "sold" : ""}"><strong>${this.escapeHtml(i.name)}</strong><span>${this.escapeHtml(i.price)}</span><span>${this.escapeHtml(i.quantity)}</span><span>${this.escapeHtml(i.description)}</span></div>`).join("") || "<small>Ассортимент пуст.</small>"}</div></details>`;
        })
        .join("") ||
      `<div class="empty-state"><strong>Торговцев пока нет</strong><span>Добавьте первый магазин.</span></div>`;
  },

  renderInitiative() {
    const combat = this.data.combat;
    this.$("#combat-master-status").innerHTML = combat.active
      ? `<strong>Раунд ${combat.round}</strong><span>Сейчас ходит: ${this.escapeHtml(combat.participants[combat.turnIndex]?.name || "—")}</span>`
      : `<span>Подготовьте инициативу и нажмите «Начать бой».</span>`;
    this.$("#initiative-list").innerHTML = combat.active
      ? combat.participants
          .map(
            (item, i) => `<div class="combat-master-row ${i === combat.turnIndex ? "active" : ""}">
          <b>${i + 1}</b>
          <span>${this.escapeHtml(item.name)}${item.characterId && item.hp === 0 ? `<small> Спасы: ${item.deathSuccesses || 0}✓ ${item.deathFailures || 0}✕</small>` : ""}<span class="combat-condition-list">${(item.conditions || []).map((condition) => `<button type="button" class="combat-condition-chip" style="--condition-color:${this.escapeHtml(condition.color)}" data-remove-condition="${i}:${condition.id}" title="Удалить состояние"><i>${this.escapeHtml(condition.icon)}</i>${this.escapeHtml(condition.name)}<small>${condition.remaining} ${condition.unit === "turn" ? "ход." : "раунд."}</small></button>`).join("")}</span></span>
          <label>Иниц.<input type="number" value="${item.initiative}" data-combat-init="${i}"></label>
          <label>HP<input type="number" value="${item.hp}" data-combat-hp="${i}"></label>
          <label>Макс.<input type="number" value="${item.maxHp}" data-combat-max-hp="${i}"></label>
          <button type="button" class="condition-add-button" data-add-condition="${i}" title="Добавить состояние">＋◉</button>
          <button class="delete" data-delete-combat="${i}">×</button>
        </div>`,
          )
          .join("")
      : this.data.initiative
          .map(
            (item, i) =>
              `<div class="initiative-row"><b>${i + 1}</b><span>${this.escapeHtml(item.name)}</span><input type="number" value="${item.value}" data-init="${i}"><button class="delete" data-delete-init="${i}">×</button></div>`,
          )
          .join("");
    this.$("#start-combat").classList.toggle("hidden", combat.active);
    this.$("#next-combat-turn").classList.toggle("hidden", !combat.active);
    this.$("#end-combat").classList.toggle("hidden", !combat.active);
    this.$("#sort-initiative").classList.toggle("hidden", combat.active);
  },

  renderWorkshop() {
    const d = this.data;
    this.$("#pack-list").innerHTML =
      `<button class="collection-link ${this.selectedPackId === "all" ? "active" : ""}" data-pack-id="all"><span>Все персонажи</span><b>${d.characters.length}</b></button>` +
      d.packs
        .map(
          (pack) =>
            `<button class="collection-link ${this.selectedPackId === pack.id ? "active" : ""}" data-pack-id="${pack.id}"><span>${this.escapeHtml(pack.name)}<small>${this.escapeHtml(pack.type)}</small></span><b>${d.characters.filter((c) => c.packId === pack.id).length}</b></button>`,
        )
        .join("");
    const activePack = d.packs.find((pack) => pack.id === this.selectedPackId);
    this.$("#active-pack-name").textContent = activePack?.name || "Все персонажи";
    this.$("#active-pack-type").textContent = activePack?.type || "Вся кампания";
    this.$("#rename-pack").style.visibility = activePack ? "visible" : "hidden";
    this.$("#delete-pack").style.visibility = activePack ? "visible" : "hidden";
    const roster =
      this.selectedPackId === "all"
        ? d.characters
        : d.characters.filter((c) => c.packId === this.selectedPackId);
    this.$("#master-roster-grid").innerHTML =
      roster.map((c) => this.characterCard(c)).join("") ||
      `<div class="empty-state"><strong>Пачка пока пуста</strong><span>Добавьте первого персонажа или NPC.</span></div>`;
    this.$("#note-section-list").innerHTML =
      `<button class="collection-link ${this.selectedNoteSectionId === "all" ? "active" : ""}" data-note-section="all"><span>Все записи</span><b>${d.masterNotes.length}</b></button>` +
      d.noteSections
        .map(
          (section) =>
            `<button class="collection-link ${this.selectedNoteSectionId === section.id ? "active" : ""}" data-note-section="${section.id}"><span>${this.escapeHtml(section.name)}</span><b>${d.masterNotes.filter((n) => n.sectionId === section.id).length}</b></button>`,
        )
        .join("");
    this.$("#active-note-section").textContent =
      d.noteSections.find((s) => s.id === this.selectedNoteSectionId)?.name || "Все записи";
    this.$("#rename-note-section").style.visibility =
      this.selectedNoteSectionId === "all" ? "hidden" : "visible";
    const notes =
      this.selectedNoteSectionId === "all"
        ? d.masterNotes
        : d.masterNotes.filter((n) => n.sectionId === this.selectedNoteSectionId);
    if (!notes.some((n) => n.id === this.selectedNoteId)) this.selectedNoteId = notes[0]?.id || null;
    this.$("#master-notes").innerHTML =
      notes
        .map(
          (note) =>
            `<button class="note-link ${note.id === this.selectedNoteId ? "active" : ""}" data-note-id="${note.id}"><strong>${this.escapeHtml(note.title || "Без названия")}</strong><small>${this.escapeHtml(note.tags.join(" · ") || "без тегов")}</small></button>`,
        )
        .join("") || "<small>В этом разделе пока нет записей.</small>";
    const note = d.masterNotes.find((item) => item.id === this.selectedNoteId);
    this.$("#note-title").value = note?.title || "";
    this.$("#note-tags").value = note?.tags?.join(", ") || "";
    this.$("#note-body").value = note?.body || "";
    this.$("#delete-note").style.visibility = note ? "visible" : "hidden";
  },

  renderAll() {
    this.renderCampaignChrome();
    this.renderOverview();
    this.renderCharacters();
    this.renderLore();
    this.renderCalendar();
    this.renderMedia();
    this.renderBestiary();
    this.renderShops();
    this.renderInitiative();
    this.renderWorkshop();
  },
});
