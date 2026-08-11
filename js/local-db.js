const KEY = "brief-hub-local-v1";

function uid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function emptyDb() {
  return {
    clients: [],
    projects: [],
    briefs: [],
    answers: [],
    section_notes: [],
    refs: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    return emptyDb();
  }
}

function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function touch(row) {
  row.updated_at = now();
  return row;
}

export const localApi = {
  async getSession() {
    return { user: { id: "local", email: "local@brief" } };
  },

  async signIn() {
    return { session: await this.getSession() };
  },

  async signOut() {},

  async listClients() {
    const db = load();
    return db.clients
      .slice()
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
      .map((c) => ({
        ...c,
        projects: db.projects
          .filter((p) => p.client_id === c.id)
          .map((p) => ({
            id: p.id,
            title: p.title,
            briefs: db.briefs
              .filter((b) => b.project_id === p.id)
              .map((b) => ({ id: b.id, type: b.type, updated_at: b.updated_at })),
          })),
      }));
  },

  async listBriefs() {
    const db = load();
    const rows = [];
    for (const brief of db.briefs) {
      const project = db.projects.find((p) => p.id === brief.project_id);
      if (!project) continue;
      const client = db.clients.find((c) => c.id === project.client_id);
      rows.push({
        ...brief,
        project_id: project.id,
        project_title: project.title,
        client_id: client?.id,
        client_name: client?.name || "Без имени",
      });
    }
    return rows.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  },

  async getClient(id) {
    const db = load();
    const client = db.clients.find((c) => c.id === id);
    if (!client) throw new Error("Клиент не найден");
    return {
      ...client,
      projects: db.projects
        .filter((p) => p.client_id === id)
        .map((p) => ({
          ...p,
          briefs: db.briefs.filter((b) => b.project_id === p.id),
        })),
    };
  },

  async createClient(name, notes = "") {
    const db = load();
    const row = {
      id: uid(),
      name,
      notes,
      created_at: now(),
      updated_at: now(),
    };
    db.clients.push(row);
    save(db);
    return row;
  },

  async updateClient(id, patch) {
    const db = load();
    const row = db.clients.find((c) => c.id === id);
    if (!row) throw new Error("Клиент не найден");
    Object.assign(row, patch);
    touch(row);
    save(db);
    return row;
  },

  async deleteClient(id) {
    const db = load();
    const projectIds = db.projects.filter((p) => p.client_id === id).map((p) => p.id);
    const briefIds = db.briefs.filter((b) => projectIds.includes(b.project_id)).map((b) => b.id);
    db.clients = db.clients.filter((c) => c.id !== id);
    db.projects = db.projects.filter((p) => p.client_id !== id);
    db.briefs = db.briefs.filter((b) => !projectIds.includes(b.project_id));
    db.answers = db.answers.filter((a) => !briefIds.includes(a.brief_id));
    db.section_notes = db.section_notes.filter((n) => !briefIds.includes(n.brief_id));
    db.refs = db.refs.filter((r) => !briefIds.includes(r.brief_id));
    save(db);
  },

  async createProject(clientId, title) {
    const db = load();
    const project = {
      id: uid(),
      client_id: clientId,
      title,
      pinterest_board_url: "",
      created_at: now(),
      updated_at: now(),
    };
    db.projects.push(project);
    db.briefs.push(
      { id: uid(), project_id: project.id, type: "planning", created_at: now(), updated_at: now() },
      { id: uid(), project_id: project.id, type: "design", created_at: now(), updated_at: now() }
    );
    const client = db.clients.find((c) => c.id === clientId);
    if (client) touch(client);
    save(db);
    return this.getProject(project.id);
  },

  async getProject(id) {
    const db = load();
    const project = db.projects.find((p) => p.id === id);
    if (!project) throw new Error("Объект не найден");
    const client = db.clients.find((c) => c.id === project.client_id);
    return {
      ...project,
      clients: client ? { id: client.id, name: client.name } : null,
      briefs: db.briefs.filter((b) => b.project_id === id),
    };
  },

  async updateProject(id, patch) {
    const db = load();
    const row = db.projects.find((p) => p.id === id);
    if (!row) throw new Error("Объект не найден");
    Object.assign(row, patch);
    touch(row);
    save(db);
    return row;
  },

  async getBrief(id) {
    const db = load();
    const brief = db.briefs.find((b) => b.id === id);
    if (!brief) throw new Error("Бриф не найден");
    const project = db.projects.find((p) => p.id === brief.project_id);
    const client = project ? db.clients.find((c) => c.id === project.client_id) : null;
    return {
      ...brief,
      projects: project
        ? {
            ...project,
            clients: client ? { id: client.id, name: client.name } : null,
          }
        : null,
    };
  },

  async touchBrief(id) {
    const db = load();
    const brief = db.briefs.find((b) => b.id === id);
    if (brief) {
      touch(brief);
      save(db);
    }
  },

  async loadAnswers(briefId) {
    const db = load();
    /** @type {Record<string, any>} */
    const map = {};
    for (const row of db.answers.filter((a) => a.brief_id === briefId)) {
      map[row.question_id] = row.payload || {};
    }
    return map;
  },

  async upsertAnswer(briefId, questionId, payload) {
    const db = load();
    const existing = db.answers.find(
      (a) => a.brief_id === briefId && a.question_id === questionId
    );
    if (existing) {
      existing.payload = payload;
      existing.updated_at = now();
    } else {
      db.answers.push({
        id: uid(),
        brief_id: briefId,
        question_id: questionId,
        payload,
        updated_at: now(),
      });
    }
    const brief = db.briefs.find((b) => b.id === briefId);
    if (brief) touch(brief);
    save(db);
  },

  async loadSectionNotes(briefId) {
    const db = load();
    /** @type {Record<string, string>} */
    const map = {};
    for (const row of db.section_notes.filter((n) => n.brief_id === briefId)) {
      map[row.section_id] = row.note || "";
    }
    return map;
  },

  async upsertSectionNote(briefId, sectionId, note) {
    const db = load();
    const existing = db.section_notes.find(
      (n) => n.brief_id === briefId && n.section_id === sectionId
    );
    if (existing) {
      existing.note = note;
      existing.updated_at = now();
    } else {
      db.section_notes.push({
        id: uid(),
        brief_id: briefId,
        section_id: sectionId,
        note,
        updated_at: now(),
      });
    }
    save(db);
  },

  async loadRefs(briefId, sectionId = null) {
    const db = load();
    return db.refs
      .filter((r) => r.brief_id === briefId)
      .filter((r) => {
        if (sectionId === "*") return true;
        if (sectionId === null) return r.section_id == null;
        if (sectionId) return r.section_id === sectionId;
        return true;
      })
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  },

  async addRef(row) {
    const db = load();
    const full = {
      id: uid(),
      created_at: now(),
      thumb_url: "",
      title: "",
      section_id: null,
      ...row,
    };
    db.refs.push(full);
    const brief = db.briefs.find((b) => b.id === row.brief_id);
    if (brief) touch(brief);
    save(db);
    return full;
  },

  async deleteRef(id) {
    const db = load();
    db.refs = db.refs.filter((r) => r.id !== id);
    save(db);
  },

  async uploadImage(_briefId, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async clearBriefAnswers(briefId) {
    const db = load();
    db.answers = db.answers.filter((a) => a.brief_id !== briefId);
    db.section_notes = db.section_notes.filter((n) => n.brief_id !== briefId);
    const brief = db.briefs.find((b) => b.id === briefId);
    if (brief) touch(brief);
    save(db);
  },

  async fetchPinterestPreview(pinUrl) {
    const { resolvePinterestPreview } = await import("./pinterest.js");
    return resolvePinterestPreview(pinUrl);
  },

  async updateRef(id, patch) {
    const db = load();
    const row = db.refs.find((r) => r.id === id);
    if (!row) throw new Error("Референс не найден");
    Object.assign(row, patch);
    save(db);
    return row;
  },

  exportBackup() {
    return JSON.stringify(load(), null, 2);
  },

  importBackup(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    save({ ...emptyDb(), ...data });
  },
};
