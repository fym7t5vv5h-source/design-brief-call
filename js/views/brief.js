import { navigate } from "../router.js";
import { planningSections } from "../data-planning.js";
import { designSections } from "../data-design.js";
import {
  upsertAnswer,
  upsertSectionNote,
  loadAnswers,
  loadSectionNotes,
  loadRefs,
  addRef,
  deleteRef,
  uploadImage,
  updateProject,
  clearBriefAnswers,
} from "../store.js";
import { debounce, escapeHtml, openLightbox, wireLightboxOnce, compressImageFile, filesFromClipboard } from "../utils.js";
import { refImageSrc, isDisplayableImageUrl } from "../pinterest.js";
import {
  filterVisibleSections,
  resolveObjectType,
  objectTypeLabel,
  visibleQuestions,
  isQuestionVisible,
} from "../branching.js";

const SHARED_FLAGS = [
  { qid: "dw11", field: "flag_loggia" },
];

function seedSharedAnswers(answers, brief) {
  for (const { qid, field } of SHARED_FLAGS) {
    const fromProject = brief.projects?.[field];
    if (fromProject && !answers[qid]?.choice) {
      answers[qid] = { choice: fromProject, text: "", choices: [] };
    }
  }
  return answers;
}

function sectionsFor(type) {
  return type === "planning" ? planningSections : designSections;
}

function questionRefKey(qid) {
  return `q:${qid}`;
}

function isAnswered(payload = {}, photoCount = 0) {
  if (payload.text?.trim()) return true;
  if (payload.choice) return true;
  if (payload.choices?.length) return true;
  if (photoCount > 0) return true;
  return false;
}

function buildMarkdown(brief, allSections, answers, notes, refs = []) {
  const client = brief.projects?.clients?.name || "—";
  const project = brief.projects?.title || "—";
  const typeLabel = brief.type === "planning" ? "Планировка / ТЗ" : "Дизайн";
  const objectType = resolveObjectType(answers, brief);
  const lines = [
    `# Бриф: ${typeLabel}`,
    "",
    `- **Клиент:** ${client}`,
    `- **Объект:** ${project}`,
    ...(objectType ? [`- **Тип объекта:** ${objectType}`] : []),
    `- **Дата:** ${new Date().toLocaleDateString("ru-RU")}`,
    "",
  ];
  const sections = filterVisibleSections(allSections, answers, brief);
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    if (notes[section.id]?.trim()) {
      lines.push(`> ${notes[section.id].trim()}`, "");
    }
    section.questions.forEach((q, i) => {
      if (!isQuestionVisible(q, answers, brief)) return;
      const a = answers[q.id];
      const photoCount = refs.filter((r) => r.section_id === questionRefKey(q.id)).length;
      if ((!a || !isAnswered(a)) && !photoCount) return;
      const bits = [];
      if (a?.choice) bits.push(a.choice);
      if (a?.choices?.length) bits.push(a.choices.join(", "));
      if (a?.text?.trim()) bits.push(a.text.trim());
      if (photoCount) bits.push(`фото: ${photoCount}`);
      lines.push(`${i + 1}. **${q.text}**`);
      lines.push(`   ${bits.join(" — ") || "—"}`, "");
    });
  }
  return lines.join("\n");
}

export async function renderBrief(root, { brief }) {
  wireLightboxOnce();
  const allSections = sectionsFor(brief.type);
  let sectionIndex = 0;
  /** @type {Record<string, any>} */
  let answers = seedSharedAnswers(await loadAnswers(brief.id), brief);
  /** @type {Record<string, string>} */
  let notes = await loadSectionNotes(brief.id);
  /** @type {any[]} */
  let allRefs = await loadRefs(brief.id, "*");
  let menuOpen = false;

  function getSections() {
    return filterVisibleSections(allSections, answers, brief);
  }

  function clampSectionIndex() {
    const list = getSections();
    if (!list.length) {
      sectionIndex = 0;
      return;
    }
    if (sectionIndex >= list.length) sectionIndex = list.length - 1;
    if (sectionIndex < 0) sectionIndex = 0;
  }

  function refsForQuestion(qid) {
    return allRefs.filter((r) => r.section_id === questionRefKey(qid));
  }

  async function refreshAllRefs() {
    allRefs = await loadRefs(brief.id, "*");
  }

  function questionAnswered(qid) {
    return isAnswered(answers[qid], refsForQuestion(qid).length);
  }

  const saveAnswer = debounce(async (qid, payload) => {
    answers[qid] = payload;
    await upsertAnswer(brief.id, qid, payload);
    const shared = SHARED_FLAGS.find((s) => s.qid === qid);
    if (shared && payload.choice != null) {
      try {
        await updateProject(brief.project_id, { [shared.field]: payload.choice || "" });
        if (brief.projects) brief.projects[shared.field] = payload.choice || "";
      } catch {
        /* optional project columns */
      }
    }
    updateProgress();
    renderNav();
  }, 350);

  const saveNote = debounce(async (sectionId, note) => {
    notes[sectionId] = note;
    await upsertSectionNote(brief.id, sectionId, note);
  }, 400);

  const clientName = brief.projects?.clients?.name || "";
  const projectTitle = brief.projects?.title || "";
  const objectLabel = objectTypeLabel(resolveObjectType({}, brief));
  const typeLabel = brief.type === "planning" ? "Планировка / ТЗ" : "Дизайн";
  const briefSubtitle = objectLabel ? `${objectLabel} · ${typeLabel}` : typeLabel;

  root.innerHTML = `
    <div class="app brief-app">
      <div class="sidebar-backdrop" id="sidebarBackdrop" hidden></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-top">
          <div class="brand">
            <button type="button" class="brand-link" id="backProject">${escapeHtml(projectTitle || "Brief Design")}</button>
            <p class="brand-sub">${escapeHtml(briefSubtitle)}</p>
          </div>
          <button type="button" class="btn ghost sidebar-close" id="sidebarClose" aria-label="Закрыть">×</button>
        </div>
        <p class="sidebar-client">${escapeHtml(clientName)}</p>
        <div class="progress-block">
          <div class="progress-top"><span>Прогресс</span><span id="progressLabel">0%</span></div>
          <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
        </div>
        <nav class="section-nav" id="sectionNav"></nav>
        <div class="sidebar-actions">
          <button type="button" class="btn ghost" id="exportBtn">Экспорт</button>
          <div class="more-wrap">
            <button type="button" class="btn ghost" id="moreBtn" aria-expanded="false">⋯</button>
            <div class="more-menu" id="moreMenu" hidden>
              <button type="button" class="danger-item" id="resetBrief">Очистить ответы брифа…</button>
            </div>
          </div>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <button type="button" class="btn ghost menu-btn" id="menuBtn" aria-label="Меню">☰</button>
          <button type="button" class="btn ghost back-top" id="backProjectTop" title="К объекту">← Назад</button>
          <div class="topbar-copy">
            <p class="eyebrow" id="sectionEyebrow"></p>
            <h1 id="sectionTitle"></h1>
          </div>
          <div class="topbar-actions desktop-nav">
            <button type="button" class="btn ghost" id="prevBtn">← Раздел</button>
            <button type="button" class="btn primary" id="nextBtn">Далее →</button>
          </div>
        </header>
        <div class="workspace">
          <section class="questions-pane" id="questionsPane"></section>
          <aside class="refs-pane">
            <div class="refs-header">
              <div>
                <p class="eyebrow">Референсы раздела</p>
                <h2>Картинки</h2>
              </div>
            </div>
            <div class="paste-zone" id="pasteZone" tabindex="0">
              <label class="btn primary file-btn paste-zone-btn">
                + Фото
                <input type="file" id="refUpload" accept="image/*" multiple hidden />
              </label>
              <p class="paste-zone-text">
                Или скопируйте картинку на Pinterest<br />
                и вставьте сюда <kbd>⌘V</kbd> / <kbd>Ctrl+V</kbd>
              </p>
            </div>
            <div class="refs-grid" id="refsGrid"></div>
            <label class="field-block compact">
              Доска Pinterest (ссылка)
              <div class="inline-row">
                <input type="url" id="boardUrl" placeholder="https://www.pinterest.com/…/board/" value="${escapeHtml(brief.projects?.pinterest_board_url || "")}" />
                <button type="button" class="btn ghost" id="saveBoard">OK</button>
                <a class="btn ghost" id="openBoard" target="_blank" rel="noreferrer">Открыть</a>
              </div>
            </label>
            <div class="section-notes">
              <label>Заметки по разделу<textarea id="sectionNotes" rows="4" placeholder="Ключевые выводы…"></textarea></label>
            </div>
          </aside>
        </div>
      </main>

      <nav class="mobile-bar" aria-label="Навигация">
        <button type="button" class="btn ghost" id="prevBtnMobile">← Раздел</button>
        <button type="button" class="btn ghost menu-btn-bar" id="menuBtnBar">Разделы</button>
        <button type="button" class="btn primary" id="nextBtnMobile">Далее →</button>
      </nav>
    </div>
  `;

  const els = {
    sidebar: root.querySelector("#sidebar"),
    backdrop: root.querySelector("#sidebarBackdrop"),
    sectionNav: root.querySelector("#sectionNav"),
    questionsPane: root.querySelector("#questionsPane"),
    refsGrid: root.querySelector("#refsGrid"),
    sectionEyebrow: root.querySelector("#sectionEyebrow"),
    sectionTitle: root.querySelector("#sectionTitle"),
    sectionNotes: root.querySelector("#sectionNotes"),
    progressFill: root.querySelector("#progressFill"),
    progressLabel: root.querySelector("#progressLabel"),
    prevBtn: root.querySelector("#prevBtn"),
    nextBtn: root.querySelector("#nextBtn"),
    prevBtnMobile: root.querySelector("#prevBtnMobile"),
    nextBtnMobile: root.querySelector("#nextBtnMobile"),
    boardUrl: root.querySelector("#boardUrl"),
    openBoard: root.querySelector("#openBoard"),
    pasteZone: root.querySelector("#pasteZone"),
  };

  let pasteBusy = false;

  async function addImageFiles(files, sectionId) {
    const list = [...files].filter(Boolean);
    if (!list.length) return;
    if (pasteBusy) return;
    pasteBusy = true;
    try {
      for (const raw of list) {
        const file = await compressImageFile(raw);
        const publicUrl = await uploadImage(brief.id, file);
        const row = await addRef({
          brief_id: brief.id,
          section_id: sectionId,
          kind: "upload",
          url: publicUrl,
          thumb_url: publicUrl,
          title: file.name || "paste",
        });
        allRefs.push(row);
      }
      renderNav();
      updateProgress();
      // Light refresh: only questions pane + refs, not full paint scroll
      renderQuestions();
      await renderRefs();
    } finally {
      pasteBusy = false;
    }
  }

  async function addImageUrl(url, sectionId) {
    if (!isDisplayableImageUrl(url)) return false;
    if (pasteBusy) return false;
    pasteBusy = true;
    try {
      const row = await addRef({
        brief_id: brief.id,
        section_id: sectionId,
        kind: "upload",
        url,
        thumb_url: url,
        title: "image",
      });
      allRefs.push(row);
      renderNav();
      updateProgress();
      renderQuestions();
      await renderRefs();
      return true;
    } finally {
      pasteBusy = false;
    }
  }

  async function handlePasteEvent(e, sectionId) {
    if (pasteBusy) {
      e.preventDefault();
      return;
    }
    const files = filesFromClipboard(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      e.stopPropagation();
      els.pasteZone?.classList.add("paste-flash");
      setTimeout(() => els.pasteZone?.classList.remove("paste-flash"), 400);
      await addImageFiles(files, sectionId);
      return;
    }
    const text = (e.clipboardData?.getData("text") || "").trim();
    if (text && isDisplayableImageUrl(text)) {
      e.preventDefault();
      e.stopPropagation();
      await addImageUrl(text, sectionId);
    }
  }

  function setMenu(open) {
    menuOpen = open;
    els.sidebar.classList.toggle("open", open);
    els.backdrop.classList.toggle("visible", open);
    els.backdrop.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  }

  function current() {
    clampSectionIndex();
    const list = getSections();
    return list[sectionIndex] || list[0] || allSections[0];
  }

  function sectionProgress(section) {
    const qs = visibleQuestions(section, answers, brief).filter((q) => q.id !== "el0");
    const answered = qs.filter((q) => questionAnswered(q.id)).length;
    return { answered, total: qs.length };
  }

  function updateProgress() {
    let answered = 0;
    let total = 0;
    for (const s of getSections()) {
      const p = sectionProgress(s);
      answered += p.answered;
      total += p.total;
    }
    const pct = total ? Math.round((answered / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressLabel.textContent = `${pct}%`;
  }

  function renderNav() {
    els.sectionNav.innerHTML = "";
    let lastGroup = null;
    const list = getSections();
    list.forEach((section, index) => {
      if (section.group !== lastGroup) {
        lastGroup = section.group;
        const title = document.createElement("p");
        title.className = "nav-group";
        title.textContent = section.group;
        els.sectionNav.appendChild(title);
      }
      const { answered, total } = sectionProgress(section);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-item";
      if (index === sectionIndex) btn.classList.add("active");
      if (answered === total && total > 0) btn.classList.add("done");
      btn.innerHTML = `
        <span class="nav-index">${index + 1}</span>
        <span class="nav-title">${escapeHtml(section.short)}</span>
        <span class="nav-count">${answered}/${total}</span>`;
      btn.addEventListener("click", () => {
        sectionIndex = index;
        setMenu(false);
        paint();
      });
      els.sectionNav.appendChild(btn);
    });
  }

  function ensurePayload(qid) {
    if (!answers[qid]) answers[qid] = { text: "", choices: [] };
    if (!answers[qid].choices) answers[qid].choices = [];
    return answers[qid];
  }

  function renderQuestions() {
    const section = current();
    const list = getSections();
    els.sectionEyebrow.textContent = `${section.group} · раздел ${sectionIndex + 1} из ${list.length}`;
    els.sectionTitle.textContent = section.title;
    els.sectionNotes.value = notes[section.id] || "";

    const atStart = sectionIndex === 0;
    const atEnd = sectionIndex === list.length - 1;
    const nextLabel = atEnd ? "Экспорт" : "Далее →";
    [els.prevBtn, els.prevBtnMobile].forEach((b) => {
      b.disabled = atStart;
    });
    [els.nextBtn, els.nextBtnMobile].forEach((b) => {
      b.textContent = nextLabel;
    });

    els.questionsPane.innerHTML = "";
    const questions = visibleQuestions(section, answers, brief);
    questions.forEach((question, index) => {
      if (question.id === "el0") {
        const note = document.createElement("div");
        note.className = "question-card hint-card";
        note.innerHTML = `<p class="q-text">${escapeHtml(question.hint || question.text)}</p>`;
        els.questionsPane.appendChild(note);
        return;
      }

      const answer = ensurePayload(question.id);
      const photos = refsForQuestion(question.id);
      const card = document.createElement("article");
      card.className = `question-card${questionAnswered(question.id) ? " answered" : ""}${question.type === "palette" ? " palette-card-wrap" : ""}`;

      let optionsHtml = "";
      if (question.type === "palette" && question.palettes?.length) {
        optionsHtml = `<div class="palette-list">${question.palettes
          .map((p) => {
            const selected = answer.choices?.includes(p.label);
            const swatches = p.colors
              .map((c) => `<span class="palette-swatch" style="background:${c}"></span>`)
              .join("");
            return `<button type="button" class="palette-option${selected ? " selected" : ""}" data-value="${escapeHtml(p.label)}">
              <div class="palette-bar">${swatches}</div>
              <span class="palette-label">${escapeHtml(p.label)}</span>
            </button>`;
          })
          .join("")}</div>`;
      } else if (question.options?.length) {
        optionsHtml = `<div class="options">${question.options
          .map((opt) => {
            const selected =
              question.type === "multi"
                ? answer.choices?.includes(opt)
                : answer.choice === opt;
            return `<button type="button" class="chip${selected ? " selected" : ""}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
          })
          .join("")}</div>`;
      }

      const thumbsHtml = photos
        .map((ref) => {
          const src = refImageSrc(ref);
          if (!src) return "";
          return `
          <div class="thumb" data-ref="${ref.id}">
            <img src="${escapeHtml(src)}" alt="${escapeHtml(ref.title || "")}" />
            <button type="button" class="thumb-remove" aria-label="Удалить">×</button>
          </div>`;
        })
        .join("");

      const showPhotos = question.type !== "palette";

      card.innerHTML = `
        <div class="q-top">
          <span class="q-num">${index + 1}</span>
          <div>
            <p class="q-text">${escapeHtml(question.text)}</p>
            ${question.hint ? `<p class="q-hint">${escapeHtml(question.hint)}</p>` : ""}
          </div>
        </div>
        ${optionsHtml}
        ${
          question.type === "palette"
            ? ""
            : `<textarea class="answer-field" rows="2" placeholder="Ответ / уточнения…">${escapeHtml(answer.text || "")}</textarea>`
        }
        ${
          showPhotos
            ? `<div class="q-images compact">
          <div class="q-images-top">
            <label class="btn ghost file-btn q-photo-btn">
              + Фото
              <input type="file" accept="image/*" multiple hidden data-q-upload="${question.id}" />
            </label>
          </div>
          ${thumbsHtml ? `<div class="thumb-row compact">${thumbsHtml}</div>` : ""}
        </div>`
            : ""
        }
      `;

      card.querySelector(".answer-field")?.addEventListener("input", (e) => {
        const payload = ensurePayload(question.id);
        payload.text = e.target.value;
        card.classList.toggle("answered", questionAnswered(question.id));
        saveAnswer(question.id, { ...payload });
      });

      // One paste handler per card — images only (don't steal text paste in textarea)
      if (showPhotos) {
        card.addEventListener("paste", (e) => {
          const files = filesFromClipboard(e.clipboardData);
          const text = (e.clipboardData?.getData("text") || "").trim();
          const hasImageUrl = text && isDisplayableImageUrl(text);
          if (!files.length && !hasImageUrl) return;
          handlePasteEvent(e, questionRefKey(question.id));
        });
      }

      card.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const value = chip.dataset.value;
          const payload = ensurePayload(question.id);
          if (question.type === "multi") {
            const set = new Set(payload.choices || []);
            if (set.has(value)) set.delete(value);
            else set.add(value);
            payload.choices = [...set];
          } else {
            payload.choice = payload.choice === value ? "" : value;
          }
          saveAnswer(question.id, { ...payload });
          // Branching answers change visible sections / questions
          if (
            question.id === "dw11" ||
            question.id === "od1" ||
            question.id === "hs1" ||
            question.id === "hs5"
          ) {
            clampSectionIndex();
            paint();
            return;
          }
          renderQuestions();
          renderNav();
          updateProgress();
        });
      });

      card.querySelectorAll(".palette-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          const value = btn.dataset.value;
          const payload = ensurePayload(question.id);
          const max = question.max || 2;
          const set = new Set(payload.choices || []);
          if (set.has(value)) {
            set.delete(value);
          } else {
            if (set.size >= max) {
              // drop oldest selection
              const arr = [...set];
              arr.shift();
              set.clear();
              arr.forEach((v) => set.add(v));
            }
            set.add(value);
          }
          payload.choices = [...set];
          saveAnswer(question.id, { ...payload });
          renderQuestions();
          renderNav();
          updateProgress();
        });
      });

      card.querySelectorAll(".thumb").forEach((thumb) => {
        const refId = thumb.dataset.ref;
        const ref = photos.find((p) => p.id === refId);
        thumb.querySelector("img")?.addEventListener("click", () => {
          const src = refImageSrc(ref);
          if (src) openLightbox(src, ref?.title || "");
        });
        thumb.querySelector(".thumb-remove")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          await deleteRef(refId);
          await refreshAllRefs();
          renderQuestions();
          renderNav();
          updateProgress();
        });
      });

      const upload = card.querySelector(`[data-q-upload="${question.id}"]`);
      upload?.addEventListener("change", async () => {
        const files = [...(upload.files || [])];
        upload.value = "";
        if (!files.length) return;
        await addImageFiles(files, questionRefKey(question.id));
      });

      els.questionsPane.appendChild(card);
    });
  }

  async function renderRefs() {
    const section = current();
    const boardPins = allRefs.filter((r) => r.section_id == null);
    const sectionOnly = allRefs.filter((r) => r.section_id === section.id);
    const all = [...boardPins, ...sectionOnly];
    const images = all.filter((r) => refImageSrc(r));
    els.refsGrid.innerHTML = "";
    if (!images.length) {
      els.refsGrid.innerHTML = `<div class="refs-empty">Пока нет фото — нажмите «+ Фото»</div>`;
      return;
    }
    images.forEach((ref) => {
      const src = refImageSrc(ref);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ref-card";
      btn.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(ref.title || "")}" /><button type="button" class="thumb-remove" aria-label="Удалить">×</button>`;
      btn.addEventListener("click", async (e) => {
        if (e.target.closest(".thumb-remove")) {
          await deleteRef(ref.id);
          await refreshAllRefs();
          renderRefs();
          return;
        }
        openLightbox(src, ref.title || "");
      });
      els.refsGrid.appendChild(btn);
    });
  }

  function syncBoardLink() {
    const url = els.boardUrl.value.trim();
    els.openBoard.href = url || "#";
    els.openBoard.toggleAttribute("hidden", !url);
  }

  async function paint() {
    renderNav();
    updateProgress();
    renderQuestions();
    await renderRefs();
    syncBoardLink();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openExport() {
    const md = buildMarkdown(brief, allSections, answers, notes, allRefs);
    const modal = document.getElementById("exportModal");
    const preview = document.getElementById("exportPreview");
    preview.textContent = md;
    modal.hidden = false;
  }

  function goBackToProject() {
    const projectId = brief.project_id || brief.projects?.id;
    if (projectId) navigate(`/project/${projectId}`);
    else navigate("/");
  }

  root.querySelector("#backProject").addEventListener("click", goBackToProject);
  root.querySelector("#backProjectTop")?.addEventListener("click", goBackToProject);
  root.querySelector("#sidebarClose").addEventListener("click", () => setMenu(false));
  root.querySelector("#sidebarBackdrop").addEventListener("click", () => setMenu(false));
  root.querySelector("#menuBtn").addEventListener("click", () => setMenu(!menuOpen));
  root.querySelector("#menuBtnBar").addEventListener("click", () => setMenu(true));
  root.querySelector("#prevBtn").addEventListener("click", () => {
    if (sectionIndex > 0) {
      sectionIndex -= 1;
      paint();
    }
  });
  root.querySelector("#nextBtn").addEventListener("click", () => {
    if (sectionIndex < getSections().length - 1) {
      sectionIndex += 1;
      paint();
    } else openExport();
  });
  root.querySelector("#prevBtnMobile").addEventListener("click", () => {
    if (sectionIndex > 0) {
      sectionIndex -= 1;
      paint();
    }
  });
  root.querySelector("#nextBtnMobile").addEventListener("click", () => {
    if (sectionIndex < getSections().length - 1) {
      sectionIndex += 1;
      paint();
    } else openExport();
  });
  els.sectionNotes.addEventListener("input", () => saveNote(current().id, els.sectionNotes.value));

  root.querySelector("#exportBtn").addEventListener("click", openExport);
  root.querySelector("#moreBtn").addEventListener("click", () => {
    const menu = root.querySelector("#moreMenu");
    menu.hidden = !menu.hidden;
  });
  root.querySelector("#resetBrief").addEventListener("click", async () => {
    if (!confirm("Очистить все ответы этого брифа? Референсы останутся.")) return;
    await clearBriefAnswers(brief.id);
    answers = {};
    notes = {};
    root.querySelector("#moreMenu").hidden = true;
    paint();
  });

  root.querySelector("#saveBoard").addEventListener("click", async () => {
    const url = els.boardUrl.value.trim();
    await updateProject(brief.project_id, { pinterest_board_url: url });
    if (brief.projects) brief.projects.pinterest_board_url = url;
    syncBoardLink();
  });

  els.pasteZone?.addEventListener("click", () => els.pasteZone.focus());
  els.pasteZone?.addEventListener("paste", (e) => {
    e.stopPropagation();
    handlePasteEvent(e, current().id);
  });
  els.pasteZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.pasteZone.classList.add("drag-over");
  });
  els.pasteZone?.addEventListener("dragleave", () => els.pasteZone.classList.remove("drag-over"));
  els.pasteZone?.addEventListener("drop", async (e) => {
    e.preventDefault();
    els.pasteZone.classList.remove("drag-over");
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) await addImageFiles(files.slice(0, 1), current().id);
  });

  // Global paste only if not already handled by card / paste-zone
  root.addEventListener("paste", (e) => {
    if (e.defaultPrevented) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.target?.closest?.(".question-card")) return;
    if (e.target?.closest?.("#pasteZone")) return;
    handlePasteEvent(e, current().id);
  });

  root.querySelector("#refUpload").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    await addImageFiles(files, current().id);
  });

  const exportModal = document.getElementById("exportModal");
  document.getElementById("closeExport").onclick = () => {
    exportModal.hidden = true;
  };
  document.getElementById("copyExport").onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById("exportPreview").textContent || "");
  };
  document.getElementById("downloadExport").onclick = () => {
    const blob = new Blob([document.getElementById("exportPreview").textContent || ""], {
      type: "text/markdown",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${brief.type}-brief.md`;
    a.click();
  };
  document.getElementById("printExport").onclick = () => {
    const win = window.open("", "_blank");
    win.document.write(
      `<pre style="white-space:pre-wrap;font:14px/1.5 sans-serif;padding:24px">${escapeHtml(
        document.getElementById("exportPreview").textContent || ""
      )}</pre>`
    );
    win.document.close();
    win.print();
  };

  paint();
}
