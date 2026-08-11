import { config } from "./config.js";
import { localApi } from "./local-db.js";

let client = null;
/** When set, reads/writes go through share RPCs (client fill link, no login). */
let shareToken = null;
/** @type {null | { brief: any, answers: Record<string, any>, notes: Record<string, string>, refs: any[] }} */
let sharedPack = null;

export function setShareToken(token) {
  shareToken = token ? String(token).trim() : null;
  sharedPack = null;
}

export function getShareToken() {
  return shareToken;
}

export function clearShareToken() {
  shareToken = null;
  sharedPack = null;
}

export function isShareMode() {
  return Boolean(shareToken);
}

export function isConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/** With cloud keys → always cloud. Local only if keys are missing. */
export function isLocalMode() {
  return !isConfigured();
}

export function enableLocalMode() {
  client = null;
}

export function enableCloudMode() {
  client = null;
}

function withTimeout(promise, ms, label = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

export async function getSupabase() {
  if (!isConfigured()) return null;
  if (client) return client;
  const { createClient } = await withTimeout(
    import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"),
    8000,
    "Сеть: не удалось загрузить вход"
  );
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

async function useLocal() {
  return isLocalMode();
}

/** Real Supabase session only (never the fake local user). */
export async function getCloudSession() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await withTimeout(sb.auth.getSession(), 8000, "Сеть: вход не ответил");
  const session = data.session;
  if (!session?.user?.id || session.user.id === "local") return null;
  return session;
}

export async function getSession() {
  if (await useLocal()) return localApi.getSession();
  return getCloudSession();
}

/** One action: sign in, or create the account if it does not exist yet. */
export async function signInOrRegister(email, password) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Облако не настроено");
  if (!email?.trim() || !password || password.length < 6) {
    throw new Error("Укажите email и пароль (минимум 6 символов).");
  }

  const login = await withTimeout(
    sb.auth.signInWithPassword({ email: email.trim(), password }),
    15000,
    "Сеть: вход не ответил"
  );

  if (!login.error) {
    enableCloudMode();
    return login.data;
  }

  const loginMsg = String(login.error.message || "");
  if (!/invalid login credentials/i.test(loginMsg)) {
    throw new Error(loginMsg);
  }

  // First time with this email → create account automatically
  const created = await withTimeout(
    sb.auth.signUp({ email: email.trim(), password }),
    15000,
    "Сеть: регистрация не ответила"
  );

  if (created.error) {
    const msg = String(created.error.message || "");
    if (/already registered|already been registered|User already registered/i.test(msg)) {
      throw new Error("Неверный пароль для этого email.");
    }
    throw new Error(msg);
  }

  if (!created.data.session) {
    // Email confirmation may be required — try login once more
    const again = await withTimeout(
      sb.auth.signInWithPassword({ email: email.trim(), password }),
      15000,
      "Сеть: вход не ответил"
    );
    if (again.error || !again.data.session) {
      throw new Error(
        "Почти готово. Откройте supabase.com → ваш проект → Authentication → Users → Add user. Введите тот же email и пароль, включите Auto Confirm User → Create user. Затем снова нажмите «Войти» здесь."
      );
    }
    enableCloudMode();
    return again.data;
  }

  enableCloudMode();
  return created.data;
}

export async function signIn(email, password) {
  return signInOrRegister(email, password);
}

export async function signUp(email, password) {
  return signInOrRegister(email, password);
}

export async function signOut() {
  try {
    if (!isLocalMode()) {
      const sb = await getSupabase();
      await sb.auth.signOut();
    }
  } finally {
    enableLocalMode();
  }
}

/** Upload local browser data into the logged-in cloud account (keeps same ids). */
export async function migrateLocalToCloud() {
  const session = await getCloudSession();
  if (!session) throw new Error("Сначала войдите");
  const sb = await getSupabase();
  const db = JSON.parse(localApi.exportBackup());
  const clients = db.clients || [];
  if (!clients.length) return { clients: 0, projects: 0, briefs: 0 };

  if (clients.length) {
    const { error } = await sb.from("clients").upsert(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        notes: c.notes || "",
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  const projects = db.projects || [];
  if (projects.length) {
    const base = projects.map((p) => ({
      id: p.id,
      client_id: p.client_id,
      title: p.title,
      pinterest_board_url: p.pinterest_board_url || "",
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
    let { error } = await sb.from("projects").upsert(base, { onConflict: "id" });
    if (error) throw error;
    // Best-effort: newer columns (ignore if DB is older)
    await sb.from("projects").upsert(
      projects.map((p) => ({
        id: p.id,
        client_id: p.client_id,
        title: p.title,
        object_type: p.object_type || "",
        flag_children: p.flag_children || "",
        flag_guest: p.flag_guest || "",
        flag_wardrobe: p.flag_wardrobe || "",
        flag_loggia: p.flag_loggia || "",
      })),
      { onConflict: "id" }
    );
  }

  const briefs = db.briefs || [];
  if (briefs.length) {
    const { error } = await sb.from("briefs").upsert(
      briefs.map((b) => ({
        id: b.id,
        project_id: b.project_id,
        type: b.type,
        created_at: b.created_at,
        updated_at: b.updated_at,
      })),
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  const answers = db.answers || [];
  if (answers.length) {
    const { error } = await sb.from("answers").upsert(
      answers.map((a) => ({
        id: a.id,
        brief_id: a.brief_id,
        question_id: a.question_id,
        payload: a.payload || {},
        updated_at: a.updated_at,
      })),
      { onConflict: "brief_id,question_id" }
    );
    if (error) throw error;
  }

  const notes = db.section_notes || [];
  if (notes.length) {
    const { error } = await sb.from("section_notes").upsert(
      notes.map((n) => ({
        id: n.id,
        brief_id: n.brief_id,
        section_id: n.section_id,
        note: n.note || "",
        updated_at: n.updated_at,
      })),
      { onConflict: "brief_id,section_id" }
    );
    if (error) throw error;
  }

  const refs = (db.refs || []).filter((r) => r.kind === "pin" || (r.url && !String(r.url).startsWith("data:")));
  if (refs.length) {
    const { error } = await sb.from("refs").upsert(
      refs.map((r) => ({
        id: r.id,
        brief_id: r.brief_id,
        section_id: r.section_id ?? null,
        kind: r.kind === "upload" ? "upload" : "pin",
        url: r.url,
        thumb_url: r.thumb_url || "",
        title: r.title || "",
        created_at: r.created_at,
      })),
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  return {
    clients: clients.length,
    projects: projects.length,
    briefs: briefs.length,
  };
}

export async function listClients() {
  if (await useLocal()) return localApi.listClients();
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("clients")
    .select("*, projects(id, title, briefs(id, type, updated_at))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listBriefs() {
  if (await useLocal()) return localApi.listBriefs();
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("briefs")
    .select("id, type, updated_at, project_id, projects(*, clients(id, name))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((b) => ({
    id: b.id,
    type: b.type,
    updated_at: b.updated_at,
    project_id: b.project_id || b.projects?.id,
    project_title: b.projects?.title || "",
    object_type: b.projects?.object_type || "",
    client_id: b.projects?.clients?.id || b.projects?.client_id,
    client_name: b.projects?.clients?.name || "Без имени",
  }));
}

export async function getClient(id) {
  if (await useLocal()) return localApi.getClient(id);
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("clients")
    .select("*, projects(*, briefs(*))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createClient(name, notes = "") {
  if (await useLocal()) return localApi.createClient(name, notes);
  const sb = await getSupabase();
  const { data, error } = await sb.from("clients").insert({ name, notes }).select().single();
  if (error) throw error;
  return data;
}

export async function updateClient(id, patch) {
  if (await useLocal()) return localApi.updateClient(id, patch);
  const sb = await getSupabase();
  const { data, error } = await sb.from("clients").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteClient(id) {
  if (await useLocal()) return localApi.deleteClient(id);
  const sb = await getSupabase();
  const { error } = await sb.from("clients").delete().eq("id", id);
  if (error) throw error;
}

export async function createProject(clientId, title, objectType = "") {
  if (await useLocal()) return localApi.createProject(clientId, title, objectType);
  const sb = await getSupabase();
  const row = { client_id: clientId, title };
  let { data: project, error } = await sb.from("projects").insert(row).select().single();
  if (error) throw error;

  if (objectType) {
    const patched = await sb
      .from("projects")
      .update({ object_type: objectType })
      .eq("id", project.id)
      .select()
      .single();
    // Older DBs may not have object_type yet — project still works
    if (!patched.error && patched.data) project = patched.data;
  }

  const { error: briefErr } = await sb.from("briefs").insert([
    { project_id: project.id, type: "planning" },
    { project_id: project.id, type: "design" },
  ]);
  if (briefErr) throw briefErr;
  return getProject(project.id);
}

export async function getProject(id) {
  if (await useLocal()) return localApi.getProject(id);
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("projects")
    .select("*, clients(id, name), briefs(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, patch) {
  if (shareToken) {
    const sb = await getSupabase();
    const { error } = await sb.rpc("update_shared_project", {
      p_token: shareToken,
      p_patch: patch,
    });
    if (error) throw error;
    if (sharedPack?.brief?.projects) {
      sharedPack.brief.projects = { ...sharedPack.brief.projects, ...patch };
    }
    return sharedPack?.brief?.projects || patch;
  }
  if (await useLocal()) return localApi.updateProject(id, patch);
  const sb = await getSupabase();
  const { data, error } = await sb.from("projects").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getBrief(id) {
  if (shareToken && sharedPack?.brief?.id === id) return sharedPack.brief;
  if (await useLocal()) return localApi.getBrief(id);
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("briefs")
    .select("*, projects(*, clients(id, name))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

function normalizeSharedPack(raw) {
  const notesIn = raw?.notes || {};
  /** @type {Record<string, string>} */
  const notes = {};
  for (const [k, v] of Object.entries(notesIn)) {
    notes[k] = typeof v === "string" ? v : v == null ? "" : String(v);
  }
  return {
    brief: raw.brief,
    answers: raw.answers || {},
    notes,
    refs: Array.isArray(raw.refs) ? raw.refs : [],
  };
}

/** Load brief + answers for a client fill link (anon). */
export async function loadSharedBrief(token) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Облако не настроено");
  const { data, error } = await withTimeout(
    sb.rpc("get_shared_brief", { p_token: String(token).trim() }),
    15000,
    "Сеть: ссылка не ответила"
  );
  if (error) throw new Error(error.message || "Ссылка недействительна");
  sharedPack = normalizeSharedPack(data);
  shareToken = String(token).trim();
  return sharedPack;
}

/** Designer: create share link token for a brief. */
export async function enableBriefShare(briefId) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Облако не настроено");
  const { data, error } = await sb.rpc("enable_brief_share", { p_brief_id: briefId });
  if (error) throw new Error(error.message || "Не удалось создать ссылку");
  return String(data);
}

export async function disableBriefShare(briefId) {
  const sb = await getSupabase();
  if (!sb) throw new Error("Облако не настроено");
  const { error } = await sb.rpc("disable_brief_share", { p_brief_id: briefId });
  if (error) throw new Error(error.message || "Не удалось отключить ссылку");
}

export function shareFillUrl(token) {
  const origin = location.origin;
  const parts = location.pathname.split("/").filter(Boolean);
  // Pretty path links (index.html sets <base href="/"> so assets load)
  if (parts[0] === "design-brief-call") {
    return `${origin}/design-brief-call/s/${encodeURIComponent(token)}`;
  }
  return `${origin}/s/${encodeURIComponent(token)}`;
}

export async function touchBrief(id) {
  if (await useLocal()) return localApi.touchBrief(id);
  const sb = await getSupabase();
  await sb.from("briefs").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function loadAnswers(briefId) {
  if (shareToken && sharedPack?.brief?.id === briefId) return { ...(sharedPack.answers || {}) };
  if (await useLocal()) return localApi.loadAnswers(briefId);
  const sb = await getSupabase();
  const { data, error } = await sb.from("answers").select("*").eq("brief_id", briefId);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.question_id] = row.payload || {};
  return map;
}

export async function upsertAnswer(briefId, questionId, payload) {
  if (shareToken) {
    const sb = await getSupabase();
    const { error } = await sb.rpc("upsert_shared_answer", {
      p_token: shareToken,
      p_question_id: questionId,
      p_payload: payload,
    });
    if (error) throw error;
    if (sharedPack) {
      sharedPack.answers = { ...sharedPack.answers, [questionId]: payload };
    }
    return;
  }
  if (await useLocal()) return localApi.upsertAnswer(briefId, questionId, payload);
  const sb = await getSupabase();
  const { error } = await sb.from("answers").upsert(
    {
      brief_id: briefId,
      question_id: questionId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brief_id,question_id" }
  );
  if (error) throw error;
  await touchBrief(briefId);
}

export async function loadSectionNotes(briefId) {
  if (shareToken && sharedPack?.brief?.id === briefId) return { ...(sharedPack.notes || {}) };
  if (await useLocal()) return localApi.loadSectionNotes(briefId);
  const sb = await getSupabase();
  const { data, error } = await sb.from("section_notes").select("*").eq("brief_id", briefId);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.section_id] = row.note || "";
  return map;
}

export async function upsertSectionNote(briefId, sectionId, note) {
  if (shareToken) {
    const sb = await getSupabase();
    const { error } = await sb.rpc("upsert_shared_note", {
      p_token: shareToken,
      p_section_id: sectionId,
      p_note: note,
    });
    if (error) throw error;
    if (sharedPack) sharedPack.notes = { ...sharedPack.notes, [sectionId]: note };
    return;
  }
  if (await useLocal()) return localApi.upsertSectionNote(briefId, sectionId, note);
  const sb = await getSupabase();
  const { error } = await sb.from("section_notes").upsert(
    {
      brief_id: briefId,
      section_id: sectionId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brief_id,section_id" }
  );
  if (error) throw error;
}

export async function loadRefs(briefId, sectionId = null) {
  if (shareToken && sharedPack?.brief?.id === briefId) {
    const all = sharedPack.refs || [];
    if (sectionId === "*") return [...all];
    if (sectionId === null) return all.filter((r) => !r.section_id);
    if (sectionId) return all.filter((r) => r.section_id === sectionId);
    return [...all];
  }
  if (await useLocal()) return localApi.loadRefs(briefId, sectionId);
  const sb = await getSupabase();
  let q = sb.from("refs").select("*").eq("brief_id", briefId).order("created_at");
  if (sectionId === "*") {
    // all
  } else if (sectionId === null) {
    q = q.is("section_id", null);
  } else if (sectionId) {
    q = q.eq("section_id", sectionId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addRef(row) {
  if (shareToken) {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc("add_shared_ref", {
      p_token: shareToken,
      p_section_id: row.section_id || "",
      p_kind: row.kind,
      p_url: row.url,
      p_thumb_url: row.thumb_url || "",
      p_title: row.title || "",
    });
    if (error) throw error;
    if (sharedPack) sharedPack.refs = [...(sharedPack.refs || []), data];
    return data;
  }
  if (await useLocal()) return localApi.addRef(row);
  const sb = await getSupabase();
  const { data, error } = await sb.from("refs").insert(row).select().single();
  if (error) throw error;
  await touchBrief(row.brief_id);
  return data;
}

export async function deleteRef(id) {
  if (shareToken) {
    const sb = await getSupabase();
    const { error } = await sb.rpc("delete_shared_ref", {
      p_token: shareToken,
      p_ref_id: id,
    });
    if (error) throw error;
    if (sharedPack) sharedPack.refs = (sharedPack.refs || []).filter((r) => r.id !== id);
    return;
  }
  if (await useLocal()) return localApi.deleteRef(id);
  const sb = await getSupabase();
  const { error } = await sb.from("refs").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadImage(briefId, file) {
  if (await useLocal()) return localApi.uploadImage(briefId, file);
  const sb = await getSupabase();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${briefId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("brief-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from("brief-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function clearBriefAnswers(briefId) {
  if (await useLocal()) return localApi.clearBriefAnswers(briefId);
  const sb = await getSupabase();
  const { error: a } = await sb.from("answers").delete().eq("brief_id", briefId);
  if (a) throw a;
  const { error: n } = await sb.from("section_notes").delete().eq("brief_id", briefId);
  if (n) throw n;
  await touchBrief(briefId);
}

export async function fetchPinterestPreview(pinUrl) {
  const { resolvePinterestPreview } = await import("./pinterest.js");
  return resolvePinterestPreview(pinUrl);
}

export async function updateRef(id, patch) {
  if (await useLocal()) return localApi.updateRef(id, patch);
  const sb = await getSupabase();
  const { data, error } = await sb.from("refs").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export function exportLocalBackup() {
  return localApi.exportBackup();
}

export function importLocalBackup(json) {
  return localApi.importBackup(json);
}

export function localClientCount() {
  try {
    const db = JSON.parse(localApi.exportBackup());
    return (db.clients || []).length;
  } catch {
    return 0;
  }
}
