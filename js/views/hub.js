import { navigate } from "../router.js";
import { formatDate } from "../utils.js";

export function renderSetup(root) {
  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-hero">
        <p class="brand-mark">Brief</p>
        <p class="brand-sub">брифы</p>
        <h1>Подключите бесплатный Supabase</h1>
        <p class="hub-lead">
          Нужно только если хотите открывать те же брифы с телефона и ноутбука.
          Локальный режим уже работает без этого.
        </p>
      </header>
      <ol class="setup-steps">
        <li>Создайте бесплатный проект на <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a></li>
        <li>SQL Editor → вставьте <code>sql/schema.sql</code> → Run</li>
        <li>Authentication → Users → Add user (email + пароль)</li>
        <li>Settings → API → скопируйте URL и anon key в <code>js/config.js</code></li>
      </ol>
    </div>
  `;
}

export function renderLogin(root, { onSubmit, error = "" }) {
  root.innerHTML = `
    <div class="hub-shell narrow">
      <header class="hub-hero">
        <p class="brand-mark">Brief</p>
        <p class="brand-sub">вход</p>
        <h1>Войти</h1>
      </header>
      <form class="login-form" id="loginForm">
        <label>Email<input type="email" name="email" required autocomplete="username" /></label>
        <label>Пароль<input type="password" name="password" required autocomplete="current-password" /></label>
        ${error ? `<p class="form-error">${error}</p>` : ""}
        <button class="btn primary" type="submit">Войти</button>
      </form>
    </div>
  `;
  root.querySelector("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await onSubmit(String(fd.get("email")), String(fd.get("password")));
  });
}

function buildGroupsHtml(briefs, query) {
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? briefs.filter(
        (b) =>
          (b.client_name || "").toLowerCase().includes(q) ||
          (b.project_title || "").toLowerCase().includes(q) ||
          (b.type === "planning" ? "планировка" : "дизайн").includes(q)
      )
    : briefs;

  /** @type {Map<string, typeof filtered>} */
  const groups = new Map();
  for (const b of filtered) {
    const key = `${b.client_id}::${b.project_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  if (!groups.size) {
    return `<p class="empty-state">${q ? "Ничего не найдено" : "Пока пусто — нажмите «+ Новый бриф»"}</p>`;
  }

  return [...groups.entries()]
    .map(([, items]) => {
      const first = items[0];
      const cards = items
        .map((b) => {
          const label = b.type === "planning" ? "Планировка / ТЗ" : "Дизайн";
          return `
            <button type="button" class="brief-row" data-brief="${b.id}">
              <div>
                <h3>${label}</h3>
                <p class="meta">обновлено ${formatDate(b.updated_at)}</p>
              </div>
              <span class="chevron">→</span>
            </button>`;
        })
        .join("");
      return `
        <section class="brief-group">
          <button type="button" class="brief-group-head" data-project="${first.project_id}">
            <div>
              <p class="eyebrow">${escape(first.client_name)}</p>
              <h2>${escape(first.project_title)}</h2>
            </div>
            <span class="meta-link">объект →</span>
          </button>
          <div class="brief-rows">${cards}</div>
        </section>`;
    })
    .join("");
}

function wireGroupClicks(container) {
  container.querySelectorAll(".brief-row").forEach((btn) => {
    btn.addEventListener("click", () => navigate(`/brief/${btn.dataset.brief}`));
  });
  container.querySelectorAll(".brief-group-head").forEach((btn) => {
    btn.addEventListener("click", () => navigate(`/project/${btn.dataset.project}`));
  });
}

/**
 * One place: all briefs, grouped by client / object.
 * Search updates only the list — input keeps focus.
 */
export function renderHome(root, {
  briefs,
  query,
  onSearch,
  onCreate,
  onSignOut,
  localMode = false,
  onExportBackup,
  onImportBackup,
}) {
  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-top">
        <div>
          <p class="brand-mark small">Brief</p>
          <h1>Все брифы</h1>
          <p class="hub-hint">Одно место: клиент, объект и оба созвона — планировка и дизайн.</p>
        </div>
        <div class="hub-top-actions">
          ${localMode && onExportBackup ? `<button type="button" class="btn ghost" id="exportBackupBtn">Бэкап</button>` : ""}
          ${localMode && onImportBackup ? `<button type="button" class="btn ghost" id="importBackupBtn">Импорт</button>` : ""}
          ${localMode ? "" : `<button type="button" class="btn ghost" id="signOutBtn">Выйти</button>`}
          <button type="button" class="btn primary" id="addBriefBtn">+ Новый бриф</button>
        </div>
      </header>
      <div class="hub-toolbar">
        <input type="text" id="briefSearch" placeholder="Поиск по клиенту или объекту…" value="${escape(query || "")}" autocomplete="off" />
      </div>
      <div class="brief-groups" id="briefGroups"></div>
    </div>
  `;

  const groupsEl = root.querySelector("#briefGroups");
  const searchInput = root.querySelector("#briefSearch");

  const refreshList = (q) => {
    groupsEl.innerHTML = buildGroupsHtml(briefs, q);
    wireGroupClicks(groupsEl);
  };

  refreshList(query);

  root.querySelector("#signOutBtn")?.addEventListener("click", onSignOut);
  root.querySelector("#exportBackupBtn")?.addEventListener("click", onExportBackup);
  root.querySelector("#importBackupBtn")?.addEventListener("click", onImportBackup);
  root.querySelector("#addBriefBtn").addEventListener("click", onCreate);
  searchInput.addEventListener("input", (e) => {
    const value = e.target.value;
    onSearch(value);
    refreshList(value);
  });
}

function escape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
