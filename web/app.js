import { drawChart, normalizePoints } from "./chart.js";
import { presentHref, profileUrl, signupUrl } from "./links.js";

export const POLL_MS = 15000;
const STORAGE_KEY = "desk_data_path";
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let memoryPath = "";
let polling = false;
let lastPoints = [];

export function validDataPath(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export function dataPathFromHash(hash) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  // `t` is intentionally unused. Plan B polls static JSON and does not send APP_TOKEN.
  return params.get("d");
}

export function siteBaseHref(locationHref) {
  const url = new URL(locationHref);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/[^/]*$/, "");
  }
  return url.href;
}

export function dataFileUrl(baseHref, dataPath, file) {
  if (!validDataPath(dataPath)) throw new Error("invalid data path");
  if (!/^[A-Za-z0-9._-]{1,80}(\/[A-Za-z0-9._-]{1,80})?$/.test(file) || file.includes("..")) {
    throw new Error("invalid data file");
  }
  const base = new URL(baseHref);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const suffix = file.split("/").map((part) => encodeURIComponent(part)).join("/");
  return new URL(`d/${encodeURIComponent(dataPath)}/${suffix}`, base).href;
}

export function formatMoney(value) {
  const negative = value < 0;
  const [whole, frac] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${frac}`;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readStoredPath() {
  try {
    return localStorage.getItem(STORAGE_KEY) || memoryPath || "";
  } catch {
    return memoryPath || "";
  }
}

function storePath(path) {
  memoryPath = path;
  try {
    localStorage.setItem(STORAGE_KEY, path);
  } catch {
    /* private mode: keep the in-memory path for this tab */
  }
}

function currentPath() {
  const fromHash = dataPathFromHash(location.hash);
  if (validDataPath(fromHash)) {
    storePath(fromHash);
    return fromHash;
  }
  const stored = readStoredPath();
  return validDataPath(stored) ? stored : "";
}

async function getJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("bad status");
  return response.json();
}

function showError(message) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.textContent = message;
}

function clearError() {
  const status = document.getElementById("status");
  status.hidden = true;
  status.textContent = "";
}

function renderOdometer(text, animate) {
  const el = document.getElementById("balance");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prev = el.dataset.value || "";
  const sameShape =
    prev.length === text.length &&
    [...text].every((ch, index) => /\d/.test(ch) === /\d/.test(prev[index] || ""));

  if (!sameShape || !el.querySelector(".reel, .mark")) {
    el.classList.add("odometer");
    el.replaceChildren();
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const reel = document.createElement("span");
        reel.className = "reel";
        reel.setAttribute("aria-hidden", "true");
        const strip = document.createElement("span");
        strip.className = "reel-strip";
        for (const digit of "0123456789") {
          const cell = document.createElement("span");
          cell.textContent = digit;
          strip.appendChild(cell);
        }
        reel.appendChild(strip);
        el.appendChild(reel);
      } else {
        const mark = document.createElement("span");
        mark.className = ch === "$" ? "mark currency" : "mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = ch;
        el.appendChild(mark);
      }
    }
  }

  const strips = [...el.querySelectorAll(".reel-strip")];
  const digits = [...text].filter((ch) => /\d/.test(ch));
  strips.forEach((strip, index) => {
    const offset = `translateY(${-Number(digits[index])}em)`;
    if (!animate || reduce || !sameShape) {
      strip.style.transition = "none";
      strip.style.transform = offset;
      strip.getBoundingClientRect();
      strip.style.transition = "";
    } else {
      strip.style.transform = offset;
    }
  });
  let live = el.querySelector(".sr-only");
  if (!live) {
    live = document.createElement("span");
    live.className = "sr-only";
    el.prepend(live);
  }
  live.textContent = `Paper balance ${text}`;
  el.dataset.value = text;
}

function setBalance(value, animate) {
  renderOdometer(formatMoney(value), animate);
}

function setToday(value) {
  const el = document.getElementById("today");
  const text = value < 0 ? `${value.toFixed(2)}% today` : `+${value.toFixed(2)}% today`;
  el.textContent = text;
  el.classList.toggle("down", value < 0);
}

function setMultiplier(value) {
  document.getElementById("mult").textContent = `${value.toFixed(2)}×`;
}

function setMode(mode) {
  const label = mode && mode.trim() ? mode.trim().toUpperCase() : "PAPER";
  for (const id of ["mode-pill", "account-pill"]) {
    const el = document.getElementById(id);
    el.textContent = label;
    el.classList.toggle("neutral", label !== "PAPER");
  }
  document.getElementById("mode-note").textContent =
    `${label} is read-only on this phone. Settings are changed in Telegram.`;
}

function fillList(el, rows, emptyText) {
  if (!rows.length) {
    el.classList.add("is-empty");
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = emptyText;
    el.replaceChildren(p);
    return;
  }
  el.classList.remove("is-empty");
  const ul = document.createElement("ul");
  ul.className = "list";
  for (const row of rows) ul.appendChild(row.cloneNode(true));
  el.replaceChildren(ul);
}

function textRow(title, detail) {
  const li = document.createElement("li");
  const what = document.createElement("span");
  what.className = "what";
  what.textContent = title;
  li.appendChild(what);
  if (detail) {
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = detail;
    li.appendChild(when);
  }
  return li;
}

function formatWhen(ts) {
  if (ts == null || ts === "") return "";
  const numeric = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(numeric)) return "";
  const ms = numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function agentsFrom(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.agents)) return [];
  return state.agents.slice(0, 40);
}

function renderAgents(state) {
  const rows = agentsFrom(state).map((agent) => {
    if (typeof agent === "string") return textRow(agent, "");
    const name = agent.name || agent.id || "Agent";
    const status = agent.status || agent.state || "";
    return textRow(String(name), status ? String(status) : "");
  });
  fillList(document.getElementById("home-agents"), rows.slice(0, 3), "No agents yet");
  fillList(document.getElementById("agents-list"), rows, "No agents yet");
}

function itemsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.activity)) return payload.activity;
  return [];
}

function renderActivity(payload) {
  const rows = itemsFrom(payload).slice(0, 50).map((item) => {
    const title = item.text || item.title || item.message || "Update";
    const when = formatWhen(item.ts ?? item.time ?? item.at);
    const mint = typeof item.mint === "string" ? item.mint : "";
    const detail = [when, mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : ""].filter(Boolean).join(" · ");
    const li = textRow(String(title), detail);
    const href = presentHref(item.url || item.href || "");
    if (!href) return li;
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(...li.childNodes);
    li.appendChild(link);
    return li;
  });
  fillList(document.getElementById("home-activity"), rows.slice(0, 3), "No activity yet");
  fillList(document.getElementById("activity-list"), rows, "No activity yet");
}

function applyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    renderAgents(null);
    return;
  }
  const balance = asNumber(state.balance ?? state.equity ?? state.paper_balance ?? state.nav);
  if (balance != null) setBalance(balance, true);
  const pct = asNumber(state.pnl_today_pct ?? state.today_pct ?? state.change_pct ?? state.pnl_pct);
  if (pct != null) setToday(pct);
  const mult = asNumber(state.multiplier ?? state.leverage);
  if (mult != null) setMultiplier(mult);
  if (typeof state.mode === "string") setMode(state.mode);
  renderAgents(state);
}

function applyChart(payload) {
  lastPoints = normalizePoints(payload).slice(-500);
  const empty = document.getElementById("chart-empty");
  const canvas = document.getElementById("chart-canvas");
  const show = lastPoints.length > 0;
  empty.hidden = show;
  canvas.hidden = !show;
  if (show) drawChart(canvas, lastPoints);
}

export function collectMints(...payloads) {
  const found = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== "object" || depth > 6) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && MINT_RE.test(item)) found.add(item);
        else visit(item, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if ((key === "mint" || key === "coin") && typeof child === "string" && MINT_RE.test(child)) {
        found.add(child);
      } else if ((key === "mints" || key === "coins") && Array.isArray(child)) {
        for (const item of child) {
          if (typeof item === "string" && MINT_RE.test(item)) found.add(item);
          else if (item && typeof item.mint === "string" && MINT_RE.test(item.mint)) found.add(item.mint);
        }
      } else {
        visit(child, depth + 1);
      }
    }
  };
  for (const payload of payloads) visit(payload, 0);
  return [...found].slice(0, 12);
}

function renderMarkets(coins) {
  const label = document.getElementById("markets-label");
  const el = document.getElementById("markets");
  if (!coins.length) {
    label.hidden = true;
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  label.hidden = false;
  el.hidden = false;
  const rows = coins.map((coin) => {
    const name = coin.symbol || coin.name || `${coin.mint.slice(0, 4)}…${coin.mint.slice(-4)}`;
    const price = asNumber(coin.price ?? coin.usd);
    const detail = price == null ? coin.name || "" : price.toLocaleString(undefined, { style: "currency", currency: "USD" });
    return textRow(String(name), detail && detail !== name ? String(detail) : "");
  });
  fillList(el, rows, "");
}

async function loadCoins(base, path, payloads) {
  const mints = collectMints(...payloads);
  if (!mints.length) {
    renderMarkets([]);
    return false;
  }
  const results = await Promise.allSettled(
    mints.map(async (mint) => {
      const body = await getJson(dataFileUrl(base, path, `coin/${mint}.json`));
      return { mint, ...(body && typeof body === "object" ? body : {}) };
    })
  );
  renderMarkets(results.filter((result) => result.status === "fulfilled").map((result) => result.value));
  return results.some((result) => result.status === "rejected");
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const path = currentPath();
    if (!path) {
      showError("Add #d= to the URL to connect this desk.");
      return;
    }
    const base = siteBaseHref(location.href);
    const files = ["state.json", "chart.json", "activity.json"];
    const results = await Promise.allSettled(files.map((file) => getJson(dataFileUrl(base, path, file))));
    const [stateResult, chartResult, activityResult] = results;
    if (stateResult.status === "fulfilled") applyState(stateResult.value);
    if (chartResult.status === "fulfilled") applyChart(chartResult.value);
    if (activityResult.status === "fulfilled") renderActivity(activityResult.value);
    const payloads = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const coinsFailed = payloads.length ? await loadCoins(base, path, payloads) : false;
    if (results.some((result) => result.status === "rejected") || coinsFailed) {
      showError("Offline. Couldn't refresh the desk.");
    } else {
      clearError();
    }
  } catch {
    showError("Offline. Couldn't refresh the desk.");
  } finally {
    polling = false;
  }
}

function selectTab(name) {
  for (const button of document.querySelectorAll(".tabs button")) {
    const selected = button.dataset.tab === name;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    panel.hidden = !selected;
  }
  const main = document.querySelector("main");
  if (main) main.scrollTop = 0;
  if (name === "home" && lastPoints.length) {
    drawChart(document.getElementById("chart-canvas"), lastPoints);
  }
}

function bindTabs() {
  const buttons = [...document.querySelectorAll(".tabs button")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });
}

function shortLink(href) {
  const url = new URL(href);
  return `${url.host}${url.pathname}`;
}

function linkCard(title, href) {
  const a = document.createElement("a");
  a.className = "link-card";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  const text = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = shortLink(href);
  text.append(strong, small);
  const chevron = document.createElement("i");
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  a.append(text, chevron);
  return a;
}

function renderAccountLinks() {
  const root = document.getElementById("account-links");
  root.replaceChildren(linkCard("FOMO profile", profileUrl()), linkCard("Invite", signupUrl()));
}

function boot() {
  bindTabs();
  selectTab("home");
  renderAccountLinks();
  setBalance(200, false);
  setToday(0);
  setMultiplier(1);
  setMode("PAPER");
  applyChart({ points: [] });
  renderAgents(null);
  renderActivity({ items: [] });

  const redraw = () => {
    if (lastPoints.length && !document.getElementById("panel-home").hidden) {
      drawChart(document.getElementById("chart-canvas"), lastPoints);
    }
  };
  if ("ResizeObserver" in window) {
    new ResizeObserver(redraw).observe(document.getElementById("chart-card"));
  } else {
    window.addEventListener("resize", redraw);
  }

  window.addEventListener("hashchange", () => {
    poll();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  }

  poll();
  window.setInterval(poll, POLL_MS);
}

if (typeof document !== "undefined") {
  boot();
}
