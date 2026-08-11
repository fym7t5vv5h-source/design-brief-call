/**
 * Tiny hash router: #/, #/login, #/client/:id, #/project/:id, #/brief/:id, #/s/:token
 */

/** @typedef {{ name: string, params: Record<string, string> }} Route */

/** @type {(route: Route) => void | Promise<void>} */
let listener = () => {};

export function onRoute(fn) {
  listener = fn;
}

export function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "home", params: {} };
  if (parts[0] === "login") return { name: "login", params: {} };
  if (parts[0] === "setup") return { name: "setup", params: {} };
  if (parts[0] === "s" && parts[1]) return { name: "share", params: { token: parts[1] } };
  if (parts[0] === "client" && parts[1]) return { name: "client", params: { id: parts[1] } };
  if (parts[0] === "project" && parts[1]) return { name: "project", params: { id: parts[1] } };
  if (parts[0] === "brief" && parts[1]) return { name: "brief", params: { id: parts[1] } };
  return { name: "home", params: {} };
}

export function navigate(to) {
  const hash = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
  if (location.hash === hash) {
    listener(parseHash());
    return;
  }
  location.hash = hash;
}

export function startRouter() {
  const run = () => listener(parseHash());
  window.addEventListener("hashchange", run);
  run();
}
