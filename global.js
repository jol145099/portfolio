// ============ Site bootstrap ============
console.log("IT'S ALIVE!");

document.addEventListener("DOMContentLoaded", () => {
  injectNav();           // build nav on every page
  markCurrentLink();     // highlight current page
  ensureThemeSwitcher(); // add Theme: [Automatic|Light|Dark] in top-right
  applySavedOrSystemTheme(); // apply saved choice (or system if "auto")
  wireContactForm();     // optional: mailto handler on contact page
});

// ============ Navigation (keeps Lab 2 look via your CSS) ============
const NAV_ITEMS = [
  { href: "/",          text: "Home" },
  { href: "/projects/", text: "Projects" },
  { href: "/contact/",  text: "Contact" },
  { href: "/resume/",   text: "Resume" },
  { href: "https://github.com/jol145099", text: "GitHub", external: true },
];

// GitHub Pages repo base (user.github.io/<repo>/...)
function basePath() {
  const isGhPages = location.hostname.endsWith(".github.io");
  const parts = location.pathname.split("/").filter(Boolean);
  if (isGhPages && parts.length > 0) return `/${parts[0]}`;
  return "";
}
function absolutize(href) {
  if (href.startsWith("http")) return href;
  return basePath() + href;
}

function injectNav() {
  // If a hardcoded <nav> exists, leave it. If not, insert one.
  let nav = document.querySelector("nav");
  if (!nav) {
    nav = document.createElement("nav");
    document.body.prepend(nav);
  }

  // If the nav already has links, don't duplicate.
  if (nav.querySelector("a")) return;

  // Allow both direct <a> and <ul>/<li> per your CSS
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

  // Make it discoverable for your nav styles if you target [data-auto]
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

// ============ Theme switcher (Lab 3 behavior) ============
const THEME_KEY = "theme";          // 'auto' | 'light' | 'dark'
const MEDIA = window.matchMedia("(prefers-color-scheme: dark)");
let mediaListener = null;

function ensureThemeSwitcher() {
  // If already present (e.g., you hand-wrote it), don't duplicate.
  if (document.querySelector(".theme-switcher")) return;

  const wrap = document.createElement("div");
  wrap.className = "theme-switcher";
  wrap.innerHTML = `
    <label for="theme-select">Theme:</label>
    <select id="theme-select">
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
  // remove old listener if switching away from auto
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
    // auto = follow system *and* live-update on change
    root.dataset.theme = MEDIA.matches ? "dark" : "light";
    mediaListener = e => {
      // only react when still in "auto"
      const current = localStorage.getItem(THEME_KEY) || "auto";
      if (current === "auto") {
        root.dataset.theme = e.matches ? "dark" : "light";
      }
    };
    MEDIA.addEventListener("change", mediaListener);
  }
}

function wireContactForm() {
  const form = document.querySelector("#contactForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    // TODO: update with your real email
    const to = "YOUR_EMAIL@EXAMPLE.COM";

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


export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    // Return a safe fallback that callers can handle
    return [];
  }
}


export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!containerElement) return;

  const validHeading = /^(h[1-6])$/i.test(headingLevel) ? headingLevel.toLowerCase() : 'h2';

  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = `<p class="empty-state">No projects to show.</p>`;
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    const title = project?.title ?? 'Untitled Project';
    const img = project?.image ?? 'https://dsc106.com/labs/lab02/images/empty.svg';
    const desc = project?.description ?? '';

    article.innerHTML = `
      <${validHeading}>${title}</${validHeading}>
      <img src="${img}" alt="${title}">
      <p>${desc}</p>
    `;
    containerElement.appendChild(article);
  }
}

// GitHub API wrapper (Step 3.2)
export async function fetchGitHubData(username) {
  // Uses the same fetchJSON under the hood
  return fetchJSON(`https://api.github.com/users/${username}`);
}
