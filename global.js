// ===============================
// global.js — merged & cleaned
// ===============================

console.log("IT'S ALIVE!");

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  injectNav();                 // build nav if none exists
  markCurrentLink();           // highlight active link
  ensureThemeSwitcher();       // Theme: [Automatic|Light|Dark]
  applySavedOrSystemTheme();   // apply saved choice or system
  wireContactForm();           // contact form mailto handler
});

// ---------- Navigation ----------
const NAV_ITEMS = [
  { href: "/",          text: "Home" },
  { href: "/projects/", text: "Projects" },
  { href: "/contact/",  text: "Contact" },
  { href: "/resume/",   text: "Resume" },
  { href: "https://github.com/jol145099", text: "GitHub", external: true },
];

// Detect GitHub Pages repo base (user.github.io/<repo>/...)
function basePath() {
  const isGhPages = location.hostname.endsWith(".github.io");
  const parts = location.pathname.split("/").filter(Boolean); // ["repo", ...]
  if (isGhPages && parts.length > 0) return `/${parts[0]}`;
  return "";
}

function absolutize(href) {
  if (href.startsWith("http")) return href;
  return basePath() + href;
}

function injectNav() {
  // If a <nav> already exists *with* links, do not replace it.
  let nav = document.querySelector("nav");
  if (!nav) {
    nav = document.createElement("nav");
    document.body.prepend(nav);
  }
  if (nav.querySelector("a")) return;

  const frag = document.createDocumentFragment();
  for (const item of NAV_ITEMS) {
    const a = document.createElement("a");
    a.href = absolutize(item.href);
    a.textContent = item.text;
    if (item.external) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    frag.appendChild(a);
  }
  nav.appendChild(frag);
  nav.setAttribute("data-auto", "true");
}

function normalizePath(pathname) {
  let p = pathname;
  const bp = basePath();
  if (bp && p.startsWith(bp)) p = p.slice(bp.length);
  p = p.replace(/\/index\.html?$/i, "/");
  if (!p.endsWith("/")) p += "/";
  return p;
}

function markCurrentLink() {
  const here = normalizePath(location.pathname);
  document.querySelectorAll("nav a").forEach(a => {
    const target = normalizePath(new URL(a.href, location.href).pathname);
    if (target === here) {
      a.classList.add("current");
      a.setAttribute("aria-current", "page");
    }
  });
}

// ---------- Theme switcher ----------
const THEME_KEY = "theme"; // 'auto' | 'light' | 'dark'
const MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
let mediaListener = null;

function ensureThemeSwitcher() {
  if (document.querySelector(".theme-switcher")) return; // already present

  const wrap = document.createElement("div");
  wrap.className = "theme-switcher";
  wrap.innerHTML = `
    <label for="theme-select">Theme:</label>
    <select id="theme-select" aria-label="Theme">
      <option value="auto">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  `;
  document.body.appendChild(wrap);

  const select = wrap.querySelector("#theme-select");
  select.value = localStorage.getItem(THEME_KEY) || "auto";
  select.addEventListener("change", () => {
    const choice = select.value;
    localStorage.setItem(THEME_KEY, choice);
    applyTheme(choice);
  });
}

function applySavedOrSystemTheme() {
  const choice = localStorage.getItem(THEME_KEY) || "auto";
  const select = document.querySelector("#theme-select");
  if (select) select.value = choice;
  applyTheme(choice);
}

function applyTheme(mode) {
  // remove any prior listener
  if (mediaListener) {
    MEDIA.removeEventListener("change", mediaListener);
    mediaListener = null;
  }
  const root = document.documentElement;
  root.removeAttribute("data-theme"); // reset

  if (mode === "light") {
    root.dataset.theme = "light";
  } else if (mode === "dark") {
    root.dataset.theme = "dark";
  } else {
    // auto: follow system + live update
    root.dataset.theme = MEDIA.matches ? "dark" : "light";
    mediaListener = e => {
      const current = localStorage.getItem(THEME_KEY) || "auto";
      if (current === "auto") {
        root.dataset.theme = e.matches ? "dark" : "light";
      }
    };
    MEDIA.addEventListener("change", mediaListener);
  }
}

// ---------- Contact form ----------
function wireContactForm() {
  const form = document.querySelector("#contactForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    // put your real email here
    const to = "jol145@ucsd.edu";

    const subject = `[Website] ${fd.get("subject") ?? ""}`.trim();
    const body = [
      `Name: ${fd.get("name") ?? ""}`,
      `Email: ${fd.get("email") ?? ""}`,
      "",
      fd.get("message") ?? ""
    ].join("\n");

    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    location.href = url;
  });
}

// ---------- Lab 4 shared utilities (exports) ----------
export async function fetchJSON(url) {
  try {
    // Avoid stale caches on GitHub Pages while iterating
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching or parsing JSON data:", err);
    return [];
  }
}

export function renderProjects(projects, containerElement, headingLevel = "h2") {
  if (!containerElement) return;

  const validHeading = /^(h[1-6])$/i.test(headingLevel) ? headingLevel.toLowerCase() : "h2";
  containerElement.innerHTML = "";

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = `<p class="empty-state">No projects to show.</p>`;
    return;
  }

  for (const project of projects) {
    const article = document.createElement("article");
    const title = project?.title ?? "Untitled Project";
    const img = project?.image ?? "https://dsc106.com/labs/lab02/images/empty.svg";
    const desc = project?.description ?? "";
    const year = project?.year ? `<span class="pill">${project.year}</span>` : "";

    const link = project?.link ?? null;

    article.innerHTML = link
      ? `
          <a href="${link}" target="_blank" rel="noopener noreferrer" class="project-link">
            <${validHeading}>${title} ${year}</${validHeading}>
            <img src="${img}" alt="${title}">
           <p>${desc}</p>
          </a>
        `
      : `
          <${validHeading}>${title} ${year}</${validHeading}>
          <img src="${img}" alt="${title}">
          <p>${desc}</p>
        `;
    containerElement.appendChild(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
