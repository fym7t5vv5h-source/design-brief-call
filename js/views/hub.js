import { navigate } from "../router.js";
import { formatDate } from "../utils.js";
import { OBJECT_TYPES, objectTypeLabel } from "../branching.js";

export function renderSetup(root) {
  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-hero">
        <p class="brand-mark">Brief Design</p>
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
        <p class="brand-mark">Brief Design</p>
        <p class="brand-sub">общий список</p>
        <h1>Вход</h1>
        <p class="hub-lead">
          Один email и пароль для команды. Клиенты хранятся в облаке — одинаково на телефоне и ноутбуке.
        </p>
      </header>
      <form class="login-form" id="loginForm">
        <label>Email<input type="email" name="email" required autocomplete="username" placeholder="ваш@email.com" /></label>
        <label>Пароль<input type="password" name="password" required minlength="6" autocomplete="current-password" placeholder="минимум 6 символов" /></label>
        ${error ? `<p class="form-error">${escape(error)}</p>` : ""}
        <button class="btn primary" type="submit" style="width:100%">Войти</button>
      </form>
    </div>
  `;
  root.querySelector("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await onSubmit(String(fd.get("email") || ""), String(fd.get("password") || ""));
  });
}

function buildGroupsHtml(briefs, query) {
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? briefs.filter(
        (b) =>
          (b.client_name || "").toLowerCase().includes(q) ||
          (b.project_title || "").toLowerCase().includes(q) ||
          (b.object_type || "").toLowerCase().includes(q) ||
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
      const typeBadge = objectTypeLabel(first.object_type);
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
              <p class="eyebrow">${escape(first.client_name)}${typeBadge ? ` · ${escape(typeBadge)}` : ""}</p>
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
export function renderHome(root, { briefs, query, onSearch, onCreate, onSignOut, cloudMode = false }) {
  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-top">
        <div>
          <p class="brand-mark small">Brief Design</p>
          <h1>Все брифы</h1>
          <p class="hub-hint">${
            cloudMode
              ? "Общее облако — клиенты одни на телефоне и компьютере. Обновление сайта их не удаляет."
              : "Клиенты на этом устройстве."
          }</p>
        </div>
        <div class="hub-top-actions">
          ${onSignOut ? `<button type="button" class="btn ghost" id="signOutBtn">Выйти</button>` : ""}
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

/**
 * First step: pick apartment or house, then client + object.
 * @param {{ fixedClientName?: string }} [opts]
 * @returns {Promise<{ clientName: string, objectTitle: string, objectType: string } | null>}
 */
export function openCreateBriefDialog(opts = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById("createBriefModal");
    existing?.remove();
    const fixedClient = (opts.fixedClientName || "").trim();

    const modal = document.createElement("div");
    modal.id = "createBriefModal";
    modal.className = "modal create-brief-modal";
    modal.innerHTML = `
      <div class="modal-card create-brief-card">
        <div class="modal-header">
          <h2>Новый бриф</h2>
          <button type="button" class="btn ghost" id="createBriefClose" aria-label="Закрыть">×</button>
        </div>
        <form id="createBriefForm" class="create-brief-form">
          <p class="create-step-label">1. Тип объекта</p>
          <div class="object-type-pick" role="radiogroup" aria-label="Тип объекта">
            <label class="object-type-option">
              <input type="radio" name="objectType" value="${OBJECT_TYPES.apt}" required />
              <span class="object-type-card">
                <strong>Квартира</strong>
                <span>Лоджия, застройщик, УК — без участка и хозблока</span>
              </span>
            </label>
            <label class="object-type-option">
              <input type="radio" name="objectType" value="${OBJECT_TYPES.house}" required />
              <span class="object-type-card">
                <strong>Загородный дом</strong>
                <span>Участок, котельная, хозблок, наружная электрика</span>
              </span>
            </label>
          </div>
          <p class="create-step-label">2. ${fixedClient ? "Объект" : "Клиент и объект"}</p>
          ${
            fixedClient
              ? `<p class="create-fixed-client">Клиент: <strong>${escape(fixedClient)}</strong></p>
                 <input type="hidden" name="clientName" value="${escape(fixedClient)}" />`
              : `<label class="field-block">
            Имя клиента
            <input type="text" name="clientName" required placeholder="Анна" autocomplete="name" />
          </label>`
          }
          <label class="field-block">
            Объект
            <input type="text" name="objectTitle" required id="createObjectTitle" placeholder="Адрес или название" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn ghost" id="createBriefCancel">Отмена</button>
            <button type="submit" class="btn primary">Создать</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const finish = (value) => {
      modal.remove();
      resolve(value);
    };

    modal.querySelector("#createBriefClose").onclick = () => finish(null);
    modal.querySelector("#createBriefCancel").onclick = () => finish(null);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) finish(null);
    });

    const titleInput = modal.querySelector("#createObjectTitle");
    const syncPlaceholder = () => {
      const checked = modal.querySelector('input[name="objectType"]:checked')?.value;
      if (checked === OBJECT_TYPES.apt) {
        titleInput.placeholder = "ЖК «Сады», корпус…";
      } else if (checked === OBJECT_TYPES.house) {
        titleInput.placeholder = "Адрес участка / название дома";
      } else {
        titleInput.placeholder = "Адрес или название объекта";
      }
    };
    modal.querySelectorAll('input[name="objectType"]').forEach((el) => {
      el.addEventListener("change", syncPlaceholder);
    });

    modal.querySelector("#createBriefForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const objectType = String(fd.get("objectType") || "");
      const clientName = String(fd.get("clientName") || "").trim();
      const objectTitle = String(fd.get("objectTitle") || "").trim();
      if (!objectType || !clientName || !objectTitle) return;
      finish({ objectType, clientName, objectTitle });
    });
  });
}
