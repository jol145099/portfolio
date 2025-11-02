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
  // --- Selection/hover helpers (sticky selection) ---
  function applySelectionStyling() {
    const hasSel = !!state.selectedYear;

    // keep selected slice/pill highlighted, gray out others
    arcs
      .classed('is-selected', d => d.data.label === state.selectedYear)
      .classed('is-hovered',  d => d.data.label === state.selectedYear) // keep hover look on selected
      .classed('dimmed',      d => hasSel && d.data.label !== state.selectedYear)
      .attr('opacity',        d => (hasSel && d.data.label !== state.selectedYear ? 0.35 : 1));

    items
      .classed('is-selected', d => d.label === state.selectedYear)
      .classed('is-hovered',  d => d.label === state.selectedYear) // same hover look on legend pill
      .classed('dimmed',      d => hasSel && d.label !== state.selectedYear);
  }

  // When something is selected, ignore hover so the sticky highlight stays obvious
  function setHover(label) {
    if (state.selectedYear) return; // no hover when locked in
    arcs.classed('is-hovered', d => d.data.label === label)
        .attr('opacity', d => (label && d.data.label !== label ? 0.35 : 1));
    items.classed('is-hovered', d => d.label === label);
  }
  const clearHover = () => setHover(null);

  // Sticky select: clicking the same label keeps it selected (no toggle-off)
  function selectYear(label) {
    state.selectedYear = label;

    applySelectionStyling();
    renderList();

    // Rebuild the pie/legend from SEARCH-only set so UI reflects the query
    drawPie(rollupCounts(getSearchOnlyProjects()));
  }

  // Wire events
  arcs.on('mouseenter', (_, d) => setHover(d.data.label))
      .on('mouseleave', clearHover)
      .on('click',     (_, d) => selectYear(d.data.label))
      .on('keydown',   (ev, d) => {
        if (ev.key === 'Enter' || ev.key === ' ') selectYear(d.data.label);
      });

  items.on('mouseenter', (_, d) => setHover(d.label))
       .on('mouseleave', clearHover)
       .on('click',     (_, d) => selectYear(d.label))
       .on('keydown',   (ev, d) => {
         if (ev.key === 'Enter' || ev.key === ' ') selectYear(d.label);
       });

  // If there was already a selection, apply its styling immediately
  applySelectionStyling();


// --- Search wiring (cards = search ∩ year; pie = search-only) ---
searchEl?.addEventListener('input', () => {
  state.query = searchEl.value;
  renderList();
  drawPie(rollupCounts(getSearchOnlyProjects()));
});

// Initial render
renderList();
drawPie(rollupCounts(getSearchOnlyProjects()));
