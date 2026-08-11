import {
  isConfigured,
  isLocalMode,
  getSession,
  signIn,
  signOut,
  listBriefs,
  createClient,
  createProject,
  getClient,
  updateClient,
  deleteClient,
  getProject,
  updateProject,
  getBrief,
  exportLocalBackup,
  importLocalBackup,
} from "./supabase.js";
import { onRoute, startRouter, navigate } from "./router.js";
import { renderSetup, renderLogin, renderHome } from "./views/hub.js";
import { renderClientPage, renderProjectPage } from "./views/client-project.js";
import { renderBrief } from "./views/brief.js";
import { wireLightboxOnce } from "./utils.js";

const root = document.getElementById("root");
let briefsCache = [];
let searchQuery = "";

function loading(msg = "Загрузка…") {
  root.innerHTML = `<div class="hub-shell"><p class="empty-state">${msg}</p></div>`;
}

function showError(err) {
  root.innerHTML = `<div class="hub-shell"><p class="form-error">${err.message || err}</p><button class="btn ghost" id="retry">Назад</button></div>`;
  root.querySelector("#retry")?.addEventListener("click", () => navigate("/"));
}

async function requireAuth(route) {
  if (isLocalMode()) return { user: { id: "local" } };
  if (!isConfigured()) {
    navigate("/setup");
    return null;
  }
  const session = await getSession();
  if (!session) {
    if (route.name !== "login") navigate("/login");
    return null;
  }
  return session;
}

function downloadBackup() {
  const blob = new Blob([exportLocalBackup()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `brief-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackupFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!confirm("Импорт заменит текущие локальные данные. Продолжить?")) return;
    importLocalBackup(text);
    navigate("/");
    handleRoute({ name: "home", params: {} });
  };
  input.click();
}

async function createNewBriefFlow() {
  const clientName = prompt("Имя клиента");
  if (!clientName?.trim()) return;
  const objectTitle = prompt("Объект (ЖК / адрес)");
  if (!objectTitle?.trim()) return;
  const client = await createClient(clientName.trim());
  const project = await createProject(client.id, objectTitle.trim());
  navigate(`/project/${project.id}`);
}

async function handleRoute(route) {
  wireLightboxOnce();

  if (isLocalMode()) {
    if (route.name === "setup" || route.name === "login") {
      navigate("/");
      return;
    }
  } else {
    if (!isConfigured()) {
      if (route.name !== "setup") {
        navigate("/setup");
        return;
      }
      renderSetup(root);
      return;
    }
    if (route.name === "setup") {
      navigate("/");
      return;
    }
    if (route.name === "login") {
      const session = await getSession();
      if (session) {
        navigate("/");
        return;
      }
      renderLogin(root, {
        onSubmit: async (email, password) => {
          try {
            await signIn(email, password);
            navigate("/");
          } catch (err) {
            renderLogin(root, {
              error: err.message || "Ошибка входа",
              onSubmit: async (e, p) => {
                await signIn(e, p);
                navigate("/");
              },
            });
          }
        },
      });
      return;
    }
  }

  const session = await requireAuth(route);
  if (!session) return;

  try {
    if (route.name === "home") {
      loading();
      briefsCache = await listBriefs();
      const paint = () =>
        renderHome(root, {
          briefs: briefsCache,
          query: searchQuery,
          localMode: isLocalMode(),
          onSearch: (q) => {
            searchQuery = q;
            // list refresh happens inside renderHome input handler — no full remount
          },
          onCreate: createNewBriefFlow,
          onSignOut: async () => {
            if (isLocalMode()) return;
            await signOut();
            navigate("/login");
          },
          onExportBackup: isLocalMode() ? downloadBackup : null,
          onImportBackup: isLocalMode() ? importBackupFile : null,
        });
      paint();
      return;
    }

    if (route.name === "client") {
      loading();
      const clientRow = await getClient(route.params.id);
      renderClientPage(root, {
        client: clientRow,
        onSaveNotes: async (notes) => {
          await updateClient(clientRow.id, { notes });
        },
        onAddProject: async () => {
          const title = prompt("Название объекта (ЖК / адрес)");
          if (!title?.trim()) return;
          const project = await createProject(clientRow.id, title.trim());
          navigate(`/project/${project.id}`);
        },
        onDelete: async () => {
          if (!confirm(`Удалить клиента «${clientRow.name}» и все брифы?`)) return;
          await deleteClient(clientRow.id);
          navigate("/");
        },
      });
      return;
    }

    if (route.name === "project") {
      loading();
      const project = await getProject(route.params.id);
      const paintProject = async () => {
        const refreshed = await getProject(route.params.id);
        renderProjectPage(root, {
          project: refreshed,
          onSaveBoard: async (url) => {
            await updateProject(project.id, { pinterest_board_url: url });
            await paintProject();
          },
          onOpenBrief: (id) => navigate(`/brief/${id}`),
        });
      };
      await paintProject();
      return;
    }

    if (route.name === "brief") {
      loading("Открываем бриф…");
      const brief = await getBrief(route.params.id);
      await renderBrief(root, { brief });
      return;
    }

    navigate("/");
  } catch (err) {
    console.error(err);
    showError(err);
  }
}

onRoute(handleRoute);
startRouter();
