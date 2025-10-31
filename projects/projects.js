// /projects/projects.js
import { fetchJSON, renderProjects } from '../global.js';

const $ = (s) => document.querySelector(s);
const cardsEl  = $('.projects');
const titleEl  = $('.projects-title');
const searchEl = $('#project-search');
const svgEl    = $('#projects-pie-plot');
const legendEl = document.querySelector('.legend');

let allProjects = await fetchJSON('../lib/projects.json');
if (!Array.isArray(allProjects)) allProjects = [];
titleEl.textContent = `Projects (${allProjects.length})`;

// --- State: search ∩ year (both apply together) ---
const state = { query: '', selectedYear: null };

// --- Helpers ---
const norm = v => (v ?? '').toString().toLowerCase();

function getSearchOnlyProjects() {
  if (!state.query) return allProjects;
  const q = norm(state.query);
  return allProjects.filter(p =>
    [p.title, p.description, p.year, p.link].map(norm).some(t => t.includes(q))
  );
}

function getVisibleProjects() {
  // COMBINED FILTERS: search first, then year
  let items = getSearchOnlyProjects();
  if (state.selectedYear) {
    items = items.filter(p => String(p.year) === String(state.selectedYear));
  }
  return items;
}

function rollupCounts(items) {
  const m = new Map();
  for (const p of items) {
    const y = String(p.year ?? '').trim();
    if (!y) continue;
    m.set(y, (m.get(y) ?? 0) + 1);
  }
  return Array.from(m, ([label, value]) => ({ label, value }))
              .sort((a,b) => a.label.localeCompare(b.label));
}

// --- Cards ---
function renderList() {
  const items = getVisibleProjects();
  renderProjects(items, cardsEl, 'h2');
  titleEl.textContent = `Projects (${items.length})`;
}

// --- Pie + Legend (keeps slice colors identical when selected) ---
function drawPie(data) {
  if (!window.d3 || !data?.length) return;   // graceful if D3 missing

  const d3 = window.d3;
  const svg = d3.select(svgEl);
  const legend = d3.select(legendEl);

  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  const arc = d3.arc().innerRadius(24).outerRadius(48); // donut
  const pie = d3.pie().value(d => d.value).sort(null);

  const g = svg.append('g');

  const arcs = g.selectAll('path')
    .data(pie(data))
    .enter()
    .append('path')
    .attr('class', 'slice')
    .attr('d', arc)
    .attr('fill', (_, i) => colors(i))        // <-- fill color never changes
    .attr('stroke', '#fff')                   // thin separators
    .attr('stroke-linejoin', 'round')
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', d => `Filter year ${d.data.label} (${d.data.value})`);

  const items = legend.selectAll('li')
    .data(data)
    .enter()
    .append('li')
    .attr('style', (_, i) => `--color: ${colors(i)}`)  // swatch color stays the same
    .attr('tabindex', 0)
    .html(d => `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);

  // Hover & select (no color change; just subtle ring/scale from CSS)
  function setHover(label) {
    arcs.classed('is-hovered', d => d.data.label === label)
        .attr('opacity', d => (label && d.data.label !== label ? 0.35 : 1));
    items.classed('is-hovered', d => d.label === label);
  }
  const clearHover = () => setHover(null);

  function toggleSelect(label) {
    state.selectedYear = (state.selectedYear === label) ? null : label;

    arcs.classed('is-selected', d => d.data.label === state.selectedYear);
    items.classed('is-selected', d => d.label === state.selectedYear);

    // Re-render cards and rebuild pie from SEARCH-only data (so legend/pie reflect current query)
    renderList();
    drawPie(rollupCounts(getSearchOnlyProjects()));
  }

  arcs.on('mouseenter', (_, d) => setHover(d.data.label))
      .on('mouseleave', clearHover)
      .on('click',     (_, d) => toggleSelect(d.data.label))
      .on('keydown',   (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.data.label); });

  items.on('mouseenter', (_, d) => setHover(d.label))
       .on('mouseleave', clearHover)
       .on('click',     (_, d) => toggleSelect(d.label))
       .on('keydown',   (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.label); });
}

// --- Search wiring (cards = search ∩ year; pie = search-only) ---
searchEl?.addEventListener('input', () => {
  state.query = searchEl.value;
  renderList();
  drawPie(rollupCounts(getSearchOnlyProjects()));
});

// Initial render
renderList();
drawPie(rollupCounts(getSearchOnlyProjects()));
