// Every fomo.family link is built here so the referral is always r=savipww.

export const REF = "savipww";

export const SIGNUP_URL = `https://fomo.family/r/${REF}`;

export function signupUrl() {
  return SIGNUP_URL;
}

export function fomoUrl(pathname, query = {}) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(path, "https://fomo.family");
  if (url.origin !== "https://fomo.family") {
    throw new Error("FOMO links stay on fomo.family");
  }
  for (const [key, value] of Object.entries(query)) {
    if (key === "r" || value == null) continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("r", REF);
  return url.toString();
}

export function profileUrl() {
  return fomoUrl("/profile/RPRoom", { source: "share_link" });
}

export function presentHref(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.origin === "https://fomo.family") {
    const query = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return fomoUrl(url.pathname, query);
  }
  return url.toString();
}
