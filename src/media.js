const safeUrl = value => {
  try {
    const url = new URL(String(value || "").trim(), globalThis.location?.origin || "https://example.com");
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch { return null; }
};

export function safeMediaUrl(value) {
  // Browser media URLs may be relative to our site or HTTPS; no active schemes.
  return safeUrl(value)?.href || "";
}

export function isApprovedVideoEmbed(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    return (url.hostname === "www.youtube-nocookie.com" && /^\/embed\/[A-Za-z0-9_-]{6,20}$/.test(url.pathname))
      || (url.hostname === "www.facebook.com" && url.pathname === "/plugins/video.php" && ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(safeUrl(url.searchParams.get("href"))?.hostname))
      || (url.hostname === "www.tiktok.com" && /^\/player\/v1\/\d+$/.test(url.pathname));
  } catch { return false; }
}

export function videoSource(value) {
  const url = safeUrl(value);
  if (!url) return { kind: "", url: "" };
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return { kind: "", url: "" }; }
  if (/\.(?:mp4|webm|ogg|mov)$/i.test(path)) return { kind: "direct", url: url.href };

  if (["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
    const id = host === "youtu.be" ? path.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") || path.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{6,})/)?.[1];
    if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) return { kind: "embed", provider: "youtube", url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  }

  if (["facebook.com", "fb.watch", "m.facebook.com"].includes(host)) {
    return { kind: "embed", provider: "facebook", url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.href)}&show_text=false&autoplay=true` };
  }

  if (["tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
    const id = path.match(/\/video\/(\d+)/)?.[1];
    if (id) return { kind: "embed", provider: "tiktok", url: `https://www.tiktok.com/player/v1/${id}?autoplay=1&music_info=0&description=0` };
    return { kind: "external", provider: "tiktok", url: url.href };
  }

  return { kind: "external", url: url.href };
}

export function isVideoContent(item) {
  return item?.mediaType === "video" || Boolean(item?.videoUrl);
}
