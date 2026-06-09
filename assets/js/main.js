(async () => {
  // Точка входа мастерской части: авторизация, загрузка кампании и синхронизация с сервером.
  localStorage.removeItem("dnd-archive");
  const A = DndApp;
  let lastUpdatedAt = "";

  const loginMaster = async () => {
    const dialog = document.querySelector("#master-login-dialog");
    const form = document.querySelector("#master-login-form");
    dialog.showModal();
    return new Promise((resolve) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const response = await fetch("/api/master/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          return (document.querySelector("#master-login-error").textContent =
            result.error || "Не удалось войти");
        dialog.close();
        resolve(true);
      };
    });
  };

  const masterInvite = new URLSearchParams(location.search).get("masterInvite");
  if (masterInvite) {
    const dialog = document.querySelector("#master-register-dialog");
    const form = document.querySelector("#master-register-form");
    dialog.showModal();
    await new Promise((resolve) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const response = await fetch("/api/master/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), token: masterInvite }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          return (document.querySelector("#master-register-error").textContent =
            result.error || "Не удалось создать кабинет");
        history.replaceState({}, "", location.pathname);
        dialog.close();
        resolve();
      };
    });
  }

  try {
    let response = await fetch("/api/state");
    if (response.status === 401 && (await loginMaster())) response = await fetch("/api/state");
    if (response.ok) {
      const result = await response.json();
      A.data = result.data;
      lastUpdatedAt = result.updated_at;
    } else if (response.status === 404) {
      await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(A.data),
      });
    } else if (response.status === 401) throw new Error("unauthorized");
    else throw new Error("database");
    A.storageMode = "postgresql";
    A.setStorageStatus("PostgreSQL · подключено");
  } catch (error) {
    A.storageMode = "local";
    A.setStorageStatus(
      error.message === "unauthorized"
        ? "Мастерская заблокирована · обновите страницу для входа"
        : "База недоступна · изменения не сохраняются",
      true,
    );
  }
  A.normalizeData();
  A.renderAll();

  const loadMasterProfile = async () => {
    const response = await fetch("/api/master/me");
    if (!response.ok) return null;
    const profile = await response.json();
    A.data.campaignSettings ||= {};
    A.data.campaignSettings.campaignName =
      profile.campaign?.name || A.data.campaignSettings.campaignName || "Моя кампания";
    A.data.campaignSettings.masterName ||= profile.account.displayName;
    const button = document.querySelector("#master-profile");
    button.querySelector("strong").textContent = A.data.campaignSettings.masterName;
    button.querySelector("small").textContent = profile.campaign?.name || "Кампания";
    A.renderCampaignChrome();
    return profile;
  };
  await loadMasterProfile();

  const updateMasterPreview = () => {
    const form = document.querySelector("#master-account-form");
    const preview = document.querySelector("#master-settings-preview");
    const values = Object.fromEntries(new FormData(form));
    const fallbacks = {
      displayName: "Хранитель",
      campaignName: "Моя кампания",
      campaignChapter: "Глава кампании",
      brandTitle: "Архив мастера",
      brandEyebrow: "Личная летопись",
      worldTitle: "Атлас мира",
      heroKicker: "Следующая игра",
      heroTitle: "Название приключения",
      heroDescription: values.campaignDescription || "Описание кампании и ближайшей сессии появится здесь.",
    };
    preview.querySelectorAll("[data-preview]").forEach((element) => {
      const key = element.dataset.preview;
      element.textContent = values[key] || fallbacks[key] || "";
    });
    preview.style.setProperty(
      "--preview-accent",
      /^#[0-9a-f]{6}$/i.test(values.accentColor || "") ? values.accentColor : "#d7aa5e",
    );
    preview.style.setProperty(
      "--preview-image",
      values.heroImageUrl
        ? `url("${String(values.heroImageUrl).replaceAll('"', "%22")}")`
        : "radial-gradient(circle at 70% 25%,#8a65332b,transparent 35%)",
    );
  };

  document.querySelector("#master-profile").onclick = async () => {
    const profile = await loadMasterProfile();
    if (!profile) return;
    const form = document.querySelector("#master-account-form");
    const settings = A.data.campaignSettings || {};
    form.elements.displayName.value = settings.masterName || profile.account.displayName;
    form.elements.displayName.disabled = false;
    form.elements.campaignName.value = profile.campaign?.name || "";
    [
      "brandTitle",
      "brandEyebrow",
      "worldTitle",
      "campaignChapter",
      "greeting",
      "campaignDescription",
      "heroTitle",
      "heroKicker",
      "heroDescription",
      "heroImageUrl",
    ].forEach((key) => (form.elements[key].value = settings[key] || ""));
    form.elements.accentColor.value = /^#[0-9a-f]{6}$/i.test(settings.accentColor || "")
      ? settings.accentColor
      : "#d7aa5e";
    document.querySelector("#master-invite-link").textContent = "";
    document.querySelector("#master-account-dialog").showModal();
    updateMasterPreview();
  };
  document.querySelector("#master-account-form").addEventListener("input", updateMasterPreview);
  document.querySelector("#master-account-form").onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await fetch("/api/master/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: values.displayName, campaignName: values.campaignName }),
    });
    A.data.campaignSettings = { ...A.data.campaignSettings, ...values, masterName: values.displayName };
    A.save();
    A.renderAll();
    await loadMasterProfile();
    A.toast("Настройки кабинета сохранены");
  };
  document.querySelector("#create-master-invite").onclick = async () => {
    const response = await fetch("/api/master/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: document.querySelector("#master-invite-name").value }),
    });
    const result = await response.json();
    if (!response.ok) return A.toast(result.error || "Не удалось создать приглашение");
    const url = `${location.origin}${location.pathname}?masterInvite=${encodeURIComponent(result.token)}`;
    document.querySelector("#master-invite-link").textContent = url;
    await navigator.clipboard.writeText(url).catch(() => {});
    A.toast("Ссылка мастера создана и скопирована");
  };
  document.querySelector("#master-logout").onclick = async () => {
    await fetch("/api/master/logout", { method: "POST" });
    location.reload();
  };

  let refreshing = false;
  const refreshState = async () => {
    if (
      refreshing ||
      A.storageMode !== "postgresql" ||
      document.hidden ||
      document.querySelector("dialog[open]")
    )
      return;
    refreshing = true;
    try {
      const response = await fetch("/api/state");
      if (!response.ok) return;
      const result = await response.json();
      if (result.updated_at === lastUpdatedAt) return;
      lastUpdatedAt = result.updated_at;
      A.data = result.data;
      A.normalizeData();
      A.renderAll();
      A.setStorageStatus("PostgreSQL · изменения получены");
    } catch {
    } finally {
      refreshing = false;
    }
  };
  if (A.storageMode === "postgresql") {
    const events = new EventSource("/api/master/events");
    events.addEventListener("state", refreshState);
  }
  setInterval(refreshState, 2500);
})();
