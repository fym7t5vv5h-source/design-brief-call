/**
 * Hash router for app + clean /s/:token paths for client links.
 */

/** @typedef {{ name: string, params: Record<string, string> }} Route */

/** @type {(route: Route) => void | Promise<void>} */
let listener = () => {};

export function onRoute(fn) {
  listener = fn;
}

function parseHash() {
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

/** Prefer /s/token from the path (pretty Vercel links); fall back to hash. */
export function parseRoute() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] === "s" && parts[1]) {
    return { name: "share", params: { token: decodeURIComponent(parts[1]) } };
  }
  // GitHub Pages: /design-brief-call/s/token
  if (parts[0] === "design-brief-call" && parts[1] === "s" && parts[2]) {
    return { name: "share", params: { token: decodeURIComponent(parts[2]) } };
  }
  return parseHash();
}

export function parseHashRoute() {
  return parseHash();
}

export function navigate(to) {
  // Leave clean /s/… pages via full navigation to hash home/app routes
  if (location.pathname.split("/").filter(Boolean)[0] === "s" || location.pathname.includes("/s/")) {
    const hash = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
    location.href = `${location.origin}/` + hash;
    return;
  }

  const hash = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
  if (location.hash === hash) {
    listener(parseRoute());
    return;
  }
  location.hash = hash;
}

export function startRouter() {
  const run = () => listener(parseRoute());
  window.addEventListener("hashchange", run);
  window.addEventListener("popstate", run);
  run();
}
