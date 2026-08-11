/** @param {string} url */
export function isDisplayableImageUrl(url = "") {
  if (!url) return false;
  if (url.startsWith("data:image")) return true;
  if (/pinimg\.com/i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i.test(url)) return true;
  // never treat pinterest pin pages as images
  if (/pinterest\.com\/pin\//i.test(url)) return false;
  if (/pinterest\.com/i.test(url) && !/pinimg/i.test(url)) return false;
  return false;
}

/** Prefer real thumbnail; never fall back to HTML pin page URL. */
export function refImageSrc(ref) {
  const thumb = ref?.thumb_url || "";
  const url = ref?.url || "";
  if (isDisplayableImageUrl(thumb)) return thumb;
  if (isDisplayableImageUrl(url)) return url;
  return "";
}

export async function resolvePinterestPreview(pinUrl) {
  const url = String(pinUrl || "").trim();
  if (!url) throw new Error("Нет ссылки");

  // Direct image link pasted by user
  if (isDisplayableImageUrl(url)) {
    return { thumbnail_url: url, title: "Изображение", provider: "image" };
  }

  const oembed = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(oembed)}`,
    `https://corsproxy.io/?${encodeURIComponent(oembed)}`,
  ];

  for (const proxied of proxies) {
    try {
      const res = await fetch(proxied);
      if (!res.ok) continue;
      const data = await res.json();
      const thumb = data.thumbnail_url || "";
      if (isDisplayableImageUrl(thumb)) {
        return {
          thumbnail_url: thumb,
          title: data.title || "Pinterest",
          provider: "Pinterest",
        };
      }
    } catch {
      // try next
    }
  }

  // No reliable thumbnail — caller should show placeholder card
  return {
    thumbnail_url: "",
    title: "Pinterest",
    provider: "Pinterest",
  };
}
