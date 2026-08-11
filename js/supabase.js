import { config } from "./config.js";
import { localApi } from "./local-db.js";

let client = null;

export function isConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/** Local mode is the default free path — no signup required. */
export function isLocalMode() {
  return !isConfigured();
}

export async function getSupabase() {
  if (!isConfigured()) return null;
  if (client) return client;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

async function useLocal() {
  return isLocalMode();
}

export async function getSession() {
  if (await useLocal()) return localApi.getSession();
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  if (await useLocal()) return localApi.signIn(email, password);
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (await useLocal()) return localApi.signOut();
  const sb = await getSupabase();
  await sb.auth.signOut();
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
    .select("id, type, updated_at, project_id, projects(id, title, client_id, clients(id, name))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((b) => ({
    id: b.id,
    type: b.type,
    updated_at: b.updated_at,
    project_id: b.project_id || b.projects?.id,
    project_title: b.projects?.title || "",
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

export async function createProject(clientId, title) {
  if (await useLocal()) return localApi.createProject(clientId, title);
  const sb = await getSupabase();
  const { data: project, error } = await sb
    .from("projects")
    .insert({ client_id: clientId, title })
    .select()
    .single();
  if (error) throw error;
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
  if (await useLocal()) return localApi.updateProject(id, patch);
  const sb = await getSupabase();
  const { data, error } = await sb.from("projects").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getBrief(id) {
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

export async function touchBrief(id) {
  if (await useLocal()) return localApi.touchBrief(id);
  const sb = await getSupabase();
  await sb.from("briefs").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function loadAnswers(briefId) {
  if (await useLocal()) return localApi.loadAnswers(briefId);
  const sb = await getSupabase();
  const { data, error } = await sb.from("answers").select("*").eq("brief_id", briefId);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.question_id] = row.payload || {};
  return map;
}

export async function upsertAnswer(briefId, questionId, payload) {
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
  if (await useLocal()) return localApi.loadSectionNotes(briefId);
  const sb = await getSupabase();
  const { data, error } = await sb.from("section_notes").select("*").eq("brief_id", briefId);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.section_id] = row.note || "";
  return map;
}

export async function upsertSectionNote(briefId, sectionId, note) {
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
  if (await useLocal()) return localApi.loadRefs(briefId, sectionId);
  const sb = await getSupabase();
  let q = sb.from("refs").select("*").eq("brief_id", briefId).order("created_at");
  if (sectionId === "*") {
    // all refs for brief
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
  if (await useLocal()) return localApi.addRef(row);
  const sb = await getSupabase();
  const { data, error } = await sb.from("refs").insert(row).select().single();
  if (error) throw error;
  await touchBrief(row.brief_id);
  return data;
}

export async function deleteRef(id) {
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
  // Always use client-side resolver (edge function often unavailable / blocked by Pinterest)
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
