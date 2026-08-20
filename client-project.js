import { navigate } from "../router.js";
import { escapeHtml, formatDate } from "../utils.js";
import { objectTypeLabel } from "../branching.js";

export function renderClientPage(root, { client, onSaveNotes, onAddProject, onDelete }) {
  const projects = client.projects || [];

  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-top">
        <div>
          <button type="button" class="btn ghost back-link" id="backHome">← Все брифы</button>
          <h1>${escapeHtml(client.name)}</h1>
        </div>
        <div class="hub-top-actions">
          <button type="button" class="btn ghost danger subtle" id="deleteClient">Удалить</button>
          <button type="button" class="btn primary" id="addProject">+ Объект</button>
        </div>
      </header>

      <label class="field-block">
        Заметки по клиенту
        <textarea id="clientNotes" rows="3" placeholder="Контакты, договорённости…">${escapeHtml(client.notes || "")}</textarea>
      </label>

      <h2 class="hub-section-title">Объекты</h2>
      <div class="project-list">
        ${
          projects.length
            ? projects
                .map((p) => {
                  const briefs = p.briefs || [];
                  const planning = briefs.find((b) => b.type === "planning");
                  const design = briefs.find((b) => b.type === "design");
                  const typeBadge = objectTypeLabel(p.object_type);
                  return `
                  <button type="button" class="project-card" data-id="${p.id}">
                    <div>
                      <h3>${escapeHtml(p.title)}</h3>
                      <p class="meta">
                        ${typeBadge ? `${escapeHtml(typeBadge)} · ` : ""}
                        Планировка: ${planning ? formatDate(planning.updated_at) : "—"}
                        · Дизайн: ${design ? formatDate(design.updated_at) : "—"}
                      </p>
                    </div>
                    <span class="chevron">→</span>
                  </button>`;
                })
                .join("")
            : `<p class="empty-state">Добавьте объект — сначала выберите квартиру или дом</p>`
        }
      </div>
    </div>
  `;

  root.querySelector("#backHome").addEventListener("click", () => navigate("/"));
  root.querySelector("#addProject").addEventListener("click", onAddProject);
  root.querySelector("#deleteClient").addEventListener("click", onDelete);
  const notes = root.querySelector("#clientNotes");
  notes.addEventListener("change", () => onSaveNotes(notes.value));
  root.querySelectorAll(".project-card").forEach((card) => {
    card.addEventListener("click", () => navigate(`/project/${card.dataset.id}`));
  });
}

export function renderProjectPage(root, { project, onSaveBoard, onOpenBrief, onShareBrief, onDisableShare, onDeleteProject }) {
  const briefs = project.briefs || [];
  const planning = briefs.find((b) => b.type === "planning");
  const design = briefs.find((b) => b.type === "design");
  const clientName = project.clients?.name || "";
  const objectLabel = objectTypeLabel(project.object_type);
  const isHouse = project.object_type === "Загородный дом";
  const isApt = project.object_type === "Квартира";
  const planningHint = isHouse
    ? "ТЗ · ветка дома · техника · электрика"
    : isApt
      ? "ТЗ · лоджия · техника · электрика"
      : "Общее · планировка · хранение · ТЗ · электрика";
  const designHint = isHouse
    ? "Дизайн · помещения · котельная"
    : "Дизайн · двери · отделка · помещения";

  function shareBlock(brief) {
    if (!brief) return "";
    const active = brief.share_enabled && brief.share_token;
    return `
      <div class="share-row">
        <button type="button" class="btn ghost share-btn" data-share="${brief.id}">
          ${active ? "Скопировать ссылку клиенту" : "Ссылка клиенту"}
        </button>
        ${
          active
            ? `<button type="button" class="btn ghost danger subtle" data-unshare="${brief.id}">Отключить</button>`
            : ""
        }
      </div>
      ${active ? `<p class="share-hint">Клиент заполняет без пароля · ответы в вашем облаке</p>` : ""}`;
  }

  root.innerHTML = `
    <div class="hub-shell">
      <header class="hub-top">
        <div>
          <button type="button" class="btn ghost back-link" id="backClient">← Все брифы</button>
          <p class="eyebrow">${escapeHtml(clientName)}${objectLabel ? ` · ${escapeHtml(objectLabel)}` : ""}</p>
          <h1>${escapeHtml(project.title)}</h1>
        </div>
        <div class="hub-top-actions">
          <button type="button" class="btn ghost danger subtle" id="deleteProject">Удалить объект</button>
        </div>
      </header>

      <section class="pinterest-block">
        <label class="field-block">
          Pinterest-доска объекта
          <div class="inline-row">
            <input type="url" id="boardUrl" placeholder="https://www.pinterest.com/…/board/" value="${escapeHtml(project.pinterest_board_url || "")}" />
            <button type="button" class="btn ghost" id="saveBoard">Сохранить</button>
            <a class="btn primary" id="openBoard" href="${escapeHtml(project.pinterest_board_url || "#")}" target="_blank" rel="noreferrer" ${project.pinterest_board_url ? "" : "hidden"}>Открыть</a>
          </div>
        </label>
      </section>

      <div class="brief-cards">
        <div class="brief-card-wrap">
          <button type="button" class="brief-card" data-type="planning" ${planning ? `data-id="${planning.id}"` : "disabled"}>
            <p class="eyebrow">Созвон 1 · ${escapeHtml(objectLabel || "объект")}</p>
            <h2>Планировка / ТЗ</h2>
            <p>${escapeHtml(planningHint)}</p>
            <p class="meta">Обновлено: ${planning ? formatDate(planning.updated_at) : "—"}</p>
          </button>
          ${shareBlock(planning)}
        </div>
        <div class="brief-card-wrap">
          <button type="button" class="brief-card" data-type="design" ${design ? `data-id="${design.id}"` : "disabled"}>
            <p class="eyebrow">Созвон 2 · ${escapeHtml(objectLabel || "объект")}</p>
            <h2>Дизайн</h2>
            <p>${escapeHtml(designHint)}</p>
            <p class="meta">Обновлено: ${design ? formatDate(design.updated_at) : "—"}</p>
          </button>
          ${shareBlock(design)}
        </div>
      </div>
    </div>
  `;

  root.querySelector("#backClient").addEventListener("click", () => {
    navigate("/");
  });
  root.querySelector("#deleteProject")?.addEventListener("click", () => onDeleteProject?.());
  root.querySelector("#saveBoard").addEventListener("click", async () => {
    const url = root.querySelector("#boardUrl").value.trim();
    await onSaveBoard(url);
  });
  root.querySelectorAll(".brief-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.id) onOpenBrief(card.dataset.id);
    });
  });
  root.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onShareBrief?.(btn.dataset.share);
    });
  });
  root.querySelectorAll("[data-unshare]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDisableShare?.(btn.dataset.unshare);
    });
  });
}
