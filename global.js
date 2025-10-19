console.log("IT'S ALIVE!");

document.addEventListener('DOMContentLoaded', () => {
  injectNav();
  markCurrentLink();
  injectThemeSwitcher();
  applySavedTheme();
  wireContactForm();
});


const NAV_ITEMS = [
  { href: '/',              text: 'Home' },
  { href: '/projects/',     text: 'Projects' },
  { href: '/contact/',      text: 'Contact' },
  { href: '/resume/',       text: 'Resume' },
  { href: 'https://github.com/jol145099', text: 'GitHub', external: true }
];


function basePath() {
  const isGhPages = location.hostname.endsWith('.github.io');
  const parts = location.pathname.split('/').filter(Boolean); // ["repo", "subdir", ...]
  if (isGhPages && parts.length > 0) {
    return `/${parts[0]}`;
  }
  return '';
}

function absolutize(href) {
  if (href.startsWith('http')) return href;
  return basePath() + href;
}

function injectNav() {
  document.querySelectorAll('nav').forEach(n => {
    if (!n.hasAttribute('data-auto')) n.remove();
  });

  const nav = document.createElement('nav');
  nav.setAttribute('data-auto', 'true');

  const ul = document.createElement('ul');
  for (const item of NAV_ITEMS) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = item.text;
    a.href = absolutize(item.href);

    if (item.external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }

    li.appendChild(a);
    ul.appendChild(li);
  }
  nav.appendChild(ul);

  document.body.prepend(nav);

  document.querySelectorAll('a[href^="http"]').forEach(a => {
    if (!a.target) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
}

function markCurrentLink() {
  const here = normalizePath(location.pathname);

  document.querySelectorAll('nav[data-auto] a').forEach(a => {
    const target = normalizePath(new URL(a.href).pathname);
    if (target === here) a.classList.add('current');
  });
}

function normalizePath(pathname) {
  let p = pathname;
  const bp = basePath();
  if (bp && p.startsWith(bp)) p = p.slice(bp.length);
  p = p.replace(/\/index\.html?$/i, '/');
  if (!p.endsWith('/')) p += '/';
  return p;
}

const THEME_KEY = 'themePref'; // 'auto' | 'light' | 'dark'
let mediaListener = null;

function injectThemeSwitcher() {
  const wrap = document.createElement('div');
  wrap.className = 'theme-switcher';
  wrap.innerHTML = `
    <label>
      Theme:
      <select id="theme-select" aria-label="Theme">
        <option value="auto">Automatic</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  `;
  document.body.appendChild(wrap);

  const select = wrap.querySelector('#theme-select');
  select.value = localStorage.getItem(THEME_KEY) || 'auto';
  select.addEventListener('change', () => {
    const val = select.value;
    localStorage.setItem(THEME_KEY, val);
    applyTheme(val);
  });
}

function applySavedTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
}

function applyTheme(mode) {
  const root = document.documentElement;
  // clear prior listener
  if (mediaListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaListener);
    mediaListener = null;
  }

  if (mode === 'light') {
    root.style.setProperty('color-scheme', 'light');
    root.setAttribute('data-theme', 'light');
  } else if (mode === 'dark') {
    root.style.setProperty('color-scheme', 'dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    // auto: follow OS; also keep data-theme in sync
    root.style.removeProperty('color-scheme'); // uses :root default "light dark"
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    mediaListener = (e) => root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    mq.addEventListener('change', mediaListener);
  }
}

function wireContactForm() {
  const form = document.querySelector('#contactForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const to = 'jol145@ucsd.edu';

    const subject = `[Website] ${fd.get('subject')}`.trim();
    const bodyLines = [
      `Name: ${fd.get('name')}`,
      `Email: ${fd.get('email')}`,
      '',
      fd.get('message')
    ];

    const url =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

    location.href = url;
  });
}
