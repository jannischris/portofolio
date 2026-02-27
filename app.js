// app.js — SPA routing + Research LIST + Inline Article

const sections = ["home", "research", "about"];
let postsData = [];
let currentPost = null;

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function on(el, evt, fn, opts) {
  if (!el) return;
  el.addEventListener(evt, fn, opts);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inlineMd(text) {
  return String(text || "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(md) {
  const lines = String(md || "").split("\n");
  let html = "";
  let inList = false;

  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      html += `<h3>${inlineMd(escapeHtml(line.slice(3)))}</h3>`;
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMd(escapeHtml(line.slice(2)))}</li>`;
      continue;
    }

    flushList();
    html += `<p>${inlineMd(escapeHtml(line))}</p>`;
  }

  flushList();
  return html;
}

function formatDate(yyyy_mm_dd) {
  const s = String(yyyy_mm_dd || "").trim();
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

// ---------- Routing ----------
function readHash() {
  const raw = location.hash.replace("#", "");
  const params = new URLSearchParams(raw);
  return { s: params.get("s") || "home", post: params.get("post") };
}

function setHash(section, postId = null) {
  const params = new URLSearchParams();
  params.set("s", section);
  if (postId) params.set("post", postId);
  location.hash = params.toString();
}

function showSection(id) {
  const normalized = sections.includes(id) ? id : "home";

  sections.forEach((s) => {
    const el = document.getElementById(s);
    if (!el) return;
    el.classList.toggle("hidden", s !== normalized);
  });

  $$(".nav-btn").forEach((btn) => {
    const active = btn.dataset.section === normalized;
    btn.style.borderColor = active ? "rgba(106,169,255,.65)" : "rgba(36,42,61,.8)";
  });
}

function applyRoute() {
  const { s, post } = readHash();
  showSection(s);

  if (s === "research") {
    if (post && postsData.length) {
      const found = postsData.find((p) => p.id === post);
      if (found) openInline(found);
      else renderList();
    } else {
      renderList();
    }
  } else {
    if (articleEl) articleEl.classList.add("hidden");
    currentPost = null;
  }
}

on(window, "hashchange", applyRoute);

// ---------- Elements ----------
const statusEl = document.getElementById("status");
const listEl = document.getElementById("posts");
const articleEl = document.getElementById("article");

const searchInput = document.getElementById("searchInput");
const tagSelect = document.getElementById("tagSelect");

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Nav buttons
$$(".nav-btn").forEach((btn) => on(btn, "click", () => setHash(btn.dataset.section)));

// ---------- Data ----------
async function loadPosts() {
  if (statusEl) {
    statusEl.textContent = "Loading posts…";
    statusEl.classList.remove("hidden");
  }

  try {
    // ✅ allow caching (faster after first visit)
    const res = await fetch("./posts.json");
    if (!res.ok) throw new Error(`posts.json not found (HTTP ${res.status})`);
    const data = await res.json();

    postsData = (Array.isArray(data) ? data : []).map((p) => ({
      id: String(p.id),
      title: String(p.title || ""),
      subtitle: String(p.subtitle || ""),
      thumbnail: String(p.thumbnail || ""),
      date: String(p.date || ""),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      tldr: Array.isArray(p.tldr) ? p.tldr.map(String) : [],
      markdown: String(p.markdown || "")
    }));

    renderTagOptions();
    renderList();

    if (statusEl) statusEl.classList.add("hidden");
  } catch (e) {
    console.error(e);
    if (statusEl) {
      statusEl.textContent = `Could not load posts.json: ${String(e.message || e)}`;
      statusEl.classList.remove("hidden");
    }
  }
}

function uniqueTags(data) {
  return Array.from(new Set(data.flatMap((p) => p.tags))).sort();
}

function renderTagOptions() {
  if (!tagSelect) return;

  tagSelect.innerHTML = `<option value="all">All tags</option>`;
  uniqueTags(postsData).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagSelect.appendChild(opt);
  });
}

function matchesFilters(post) {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const tag = tagSelect?.value || "all";

  const hay = [post.title, post.subtitle, post.tags.join(" "), post.markdown].join(" ").toLowerCase();
  const inText = q === "" ? true : hay.includes(q);
  const inTag = tag === "all" ? true : post.tags.includes(tag);

  return inText && inTag;
}

on(searchInput, "input", () => renderList());
on(tagSelect, "change", () => renderList());

// ---------- Research LIST ----------
function cardPills(tags) {
  return (tags || [])
    .slice(0, 3)
    .map((t) => `<span class="pill pill-dark">${escapeHtml(t)}</span>`)
    .join("");
}

function renderList() {
  if (!listEl) return;

  if (articleEl) articleEl.classList.add("hidden");
  currentPost = null;

  listEl.innerHTML = "";
  listEl.classList.remove("tiles");
  listEl.classList.add("research-list");

  const filtered = postsData
    .filter(matchesFilters)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (filtered.length === 0) {
    if (statusEl) {
      statusEl.textContent = "No posts match your filters.";
      statusEl.classList.remove("hidden");
    }
    return;
  }

  if (statusEl) statusEl.classList.add("hidden");

  filtered.forEach((p) => {
    const a = document.createElement("a");
    a.href = `#s=research&post=${encodeURIComponent(p.id)}`;
    a.className = "research-card";
    a.setAttribute("aria-label", `Open article: ${p.title}`);

    const thumb = p.thumbnail
      ? `<div class="research-thumb" style="background-image:url('${escapeHtml(p.thumbnail)}')"></div>`
      : `<div class="research-thumb research-thumb-fallback"></div>`;

    const date = p.date ? formatDate(p.date) : "";

    a.innerHTML = `
      ${thumb}
      <div class="research-meta">
        <div class="research-topline">
          <div class="research-date">${escapeHtml(date)}</div>
          <div class="research-pills">${cardPills(p.tags)}</div>
        </div>

        <div class="research-titleline">
          <h3 class="research-h3">${escapeHtml(p.title)}</h3>
        </div>

        <p class="research-subtitle">${escapeHtml(p.subtitle)}</p>
      </div>
    `;

    on(a, "click", (e) => {
      e.preventDefault();
      setHash("research", p.id);
    });

    listEl.appendChild(a);
  });
}

// ---------- Inline article ----------
function openInline(post) {
  if (!articleEl) return;

  currentPost = post;

  const hero = post.thumbnail
    ? `<div class="hero"><div style="background-image:url('${post.thumbnail}')"></div></div>`
    : "";


  articleEl.innerHTML = `
    ${hero}
    <h2>${escapeHtml(post.title)}</h2>
    <p class="muted">${escapeHtml(post.subtitle || "")}</p>
 
    <div style="margin-top:12px;">
      ${markdownToHtml(post.markdown)}
    </div>
    <div class="row" style="margin-top:16px;">
      <button class="btn" id="backBtn" type="button">← Back to list</button>
      <button class="btn primary" id="copyBtn" type="button">Copy link</button>
    </div>
  `;

  articleEl.classList.remove("hidden");

  const backBtn = document.getElementById("backBtn");
  const copyBtn = document.getElementById("copyBtn");

  on(backBtn, "click", () => setHash("research"));

  on(copyBtn, "click", async () => {
    const link = `${location.origin}${location.pathname}#s=research&post=${encodeURIComponent(post.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy link"), 1200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  });

  articleEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Init ----------
(async function init() {
  await loadPosts();
  if (!location.hash) setHash("home");
  applyRoute();
})();