(async () => {
  localStorage.removeItem("dnd-archive");
  const A = DndApp;
  let lastUpdatedAt = "";
  const loginMaster = async () => {
    const password = prompt("Введите пароль мастера:");
    if (password === null) return false;
    const response = await fetch("/api/master/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { alert("Неверный пароль мастера"); return false; }
    return true;
  };
  try {
    let response = await fetch("/api/state");
    if (response.status === 401 && await loginMaster()) response = await fetch("/api/state");
    if (response.ok) {
      const result = await response.json();
      A.data = result.data;
      lastUpdatedAt = result.updated_at;
    }
    else if (response.status === 404) await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(A.data) });
    else if (response.status === 401) throw new Error("unauthorized");
    else throw new Error("database");
    A.storageMode = "postgresql";
    A.setStorageStatus("PostgreSQL · подключено");
  } catch (error) {
    A.storageMode = "local";
    A.setStorageStatus(error.message === "unauthorized" ? "Мастерская заблокирована · обновите страницу для входа" : "База недоступна · изменения не сохраняются", true);
  }
  A.normalizeData();
  A.renderAll();

  let refreshing = false;
  const refreshState = async () => {
    if (refreshing || A.storageMode !== "postgresql" || document.hidden || document.querySelector("dialog[open]")) return;
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
    } catch {} finally {
      refreshing = false;
    }
  };
  if (A.storageMode === "postgresql") {
    const events = new EventSource("/api/master/events");
    events.addEventListener("state", refreshState);
  }
  setInterval(async () => {
    await refreshState();
  }, 2500);
})();
