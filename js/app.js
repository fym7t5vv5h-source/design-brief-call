import {
  isConfigured,
  getCloudSession,
  signInOrRegister,
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
  migrateLocalToCloud,
  localClientCount,
  loadSharedBrief,
  clearShareToken,
  enableBriefShare,
  disableBriefShare,
  shareFillUrl,
} from "./store.js";
import { onRoute, startRouter, navigate } from "./router.js";
import { renderLogin, renderHome, openCreateBriefDialog } from "./views/hub.js";
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
  root.innerHTML = `<div class="hub-shell"><p class="form-error">${err.message || err}</p>
    <button class="btn ghost" id="retry">На главную</button></div>`;
  root.querySelector("#retry")?.addEventListener("click", () => navigate("/"));
}

async function afterAuthSuccess() {
  const localN = localClientCount();
  if (localN > 0) {
    loading("Сохраняем клиентов в облако…");
    try {
      await migrateLocalToCloud();
    } catch (err) {
      console.warn(err);
    }
  }
  navigate("/");
  await handleRoute({ name: "home", params: {} });
}

function paintLogin(error = "") {
  renderLogin(root, {
    error,
    onSubmit: async (email, password) => {
      try {
        loading("Входим…");
        await signInOrRegister(email, password);
        await afterAuthSuccess();
      } catch (err) {
        paintLogin(err.message || "Не удалось войти");
      }
    },
  });
}

/** Only a real Supabase session counts — never the local fake user. */
async function requireCloudSession(route) {
  if (!isConfigured()) {
    root.innerHTML = `<div class="hub-shell"><p class="form-error">Облако не настроено (нет ключей в config.js).</p></div>`;
    return null;
  }

  let session = null;
  try {
    session = await getCloudSession();
  } catch (err) {
    if (route.name !== "login") navigate("/login");
    paintLogin(err.message || "Нет связи с облаком");
    return null;
  }

  if (session?.user?.id && session.user.id !== "local") {
    return session;
  }

  if (route.name !== "login") navigate("/login");
  paintLogin();
  return null;
}

async function createNewBriefFlow() {
  const draft = await openCreateBriefDialog();
  if (!draft) return;
  const clientRow = await createClient(draft.clientName);
  const project = await createProject(clientRow.id, draft.objectTitle, draft.objectType);
  navigate(`/project/${project.id}`);
}

async function copyShareLink(briefId) {
  try {
    const token = await enableBriefShare(briefId);
    const url = shareFillUrl(token);
    await navigator.clipboard.writeText(url);
    alert(`Ссылка скопирована.\n\nОтправьте клиенту — заполняет без пароля, ответы приходят к вам:\n${url}`);
  } catch (err) {
    const msg = String(err.message || err);
    if (/function|schema cache|does not exist|404/i.test(msg)) {
      alert(
        "Сначала один раз в Supabase → SQL Editor выполните файл sql/share-links.sql (Run), затем снова нажмите «Ссылка клиенту»."
      );
      return;
    }
    alert(msg || "Не удалось создать ссылку");
  }
}

async function handleShareRoute(token) {
  if (!isConfigured()) {
    root.innerHTML = `<div class="hub-shell"><p class="form-error">Облако не настроено.</p></div>`;
    return;
  }
  loading("Открываем анкету…");
  try {
    const pack = await loadSharedBrief(token);
    await renderBrief(root, { brief: pack.brief, guest: true });
  } catch (err) {
    clearShareToken();
    root.innerHTML = `<div class="hub-shell narrow">
      <header class="hub-hero">
        <p class="brand-mark">Brief Design</p>
        <h1>Ссылка недоступна</h1>
        <p class="hub-lead">${err.message || "Попросите дизайнера прислать новую ссылку."}</p>
      </header>
    </div>`;
  }
}

async function handleRoute(route) {
  wireLightboxOnce();

  if (route.name === "share") {
    await handleShareRoute(route.params.token);
    return;
  }

  clearShareToken();

  if (route.name === "setup") {
    navigate("/login");
    route = { name: "login", params: {} };
  }

  const session = await requireCloudSession(route);
  if (!session) return;

  try {
    if (route.name === "login") {
      navigate("/");
      route = { name: "home", params: {} };
    }

    if (route.name === "home") {
      loading();
      briefsCache = await listBriefs();
      renderHome(root, {
        briefs: briefsCache,
        query: searchQuery,
        cloudMode: true,
        onSearch: (q) => {
          searchQuery = q;
        },
        onCreate: createNewBriefFlow,
        onSignOut: async () => {
          await signOut();
          navigate("/login");
          paintLogin();
        },
      });
      const email = session.user?.email || "";
      const hint = root.querySelector(".hub-hint");
      if (hint && email) {
        hint.textContent = `Вы вошли как ${email}. Клиенты в облаке — одинаково на телефоне и ноутбуке.`;
      }
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
          const draft = await openCreateBriefDialog({ fixedClientName: clientRow.name });
          if (!draft) return;
          const project = await createProject(clientRow.id, draft.objectTitle, draft.objectType);
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
      const paintProject = async () => {
        const refreshed = await getProject(route.params.id);
        renderProjectPage(root, {
          project: refreshed,
          onSaveBoard: async (url) => {
            await updateProject(refreshed.id, { pinterest_board_url: url });
            await paintProject();
          },
          onOpenBrief: (id) => navigate(`/brief/${id}`),
          onShareBrief: (id) => copyShareLink(id),
          onDisableShare: async (id) => {
            if (!confirm("Отключить ссылку для клиента? Старая ссылка перестанет работать.")) return;
            try {
              await disableBriefShare(id);
              await paintProject();
            } catch (err) {
              alert(err.message || err);
            }
          },
        });
      };
      await paintProject();
      return;
    }

    if (route.name === "brief") {
      loading("Открываем бриф…");
      const brief = await getBrief(route.params.id);
      await renderBrief(root, { brief, guest: false });
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
