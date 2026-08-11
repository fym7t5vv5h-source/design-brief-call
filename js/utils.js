export function openLightbox(dataUrl, caption = "") {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImage");
  const cap = document.getElementById("lightboxCaption");
  img.src = dataUrl;
  cap.textContent = caption;
  box.hidden = false;
}

export function closeLightbox() {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImage");
  box.hidden = true;
  img.src = "";
}

export function wireLightboxOnce() {
  const box = document.getElementById("lightbox");
  const close = document.getElementById("lightboxClose");
  if (box.dataset.wired) return;
  box.dataset.wired = "1";
  close.addEventListener("click", closeLightbox);
  box.addEventListener("click", (e) => {
    if (e.target === box) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      const modal = document.getElementById("exportModal");
      if (modal) modal.hidden = true;
    }
  });
}

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Compress/resize image for faster upload. Returns a File/Blob. */
export async function compressImageFile(file, { maxEdge = 1600, quality = 0.72 } = {}) {
  if (!file?.type?.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;
  // Skip tiny files
  if (file.size && file.size < 180_000) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;
  const name = (file.name || "photo").replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/** Clipboard often exposes the same image under several MIME types. */
export function filesFromClipboard(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const files = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const key = `${file.type}:${file.size}:${file.lastModified || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
    break; // one image per paste
  }
  return files;
}
