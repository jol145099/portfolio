// /projects/projects.js
// Projects page: sticky year selection + search∩year filtering.
// Keeps your existing styling; selected year stays highlighted; others dim.

import { fetchJSON, renderProjects } from '../global.js';

const $ = (s) => document.querySelector(s);
const cardsEl  = $('.projects');
const titleEl  = $('.projects-title');
const searchEl = $('#project-search');
const svgEl    = $('#projects-pie-plot');
const legendEl = document.querySelector('.legend');

// ---------- Data ----------
let allProjects = await fetchJSON('../lib/projects.json');
if (!Array.isArray(allProjects)) allProjects = [];
titleEl.textContent = `Projects (${allProjects.length})`;

// ---------- State (combined filters, sticky selection) ----------
const state = { query: '', selectedYear: null };

// ---------- Helpers ----------
const norm = v => (v ?? '').toString().toLowerCase();

function getSearchOnlyProjects() {
  if (!state.query) return allProjects;
  const q = norm(state.query);
  return allProjects.filter(p =>
    [p.title, p.description, p.year, p.link].map(norm).some(t => t.includes(q))
  );
}

function getVisibleProjects() {
  // search ∩ year (both applied together)
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

// ---------- Cards ----------
function renderList() {
  const items = getVisibleProjects();
  renderProjects(items, cardsEl, 'h2');
  titleEl.textContent = `Projects (${items.length})`;
}

// ---------- Pie + Legend ----------
function drawPie(data) {
  // If D3 didn't load for any reason, don't break the page; cards still render.
  if (!window.d3) return;
  const d3 = window.d3;

  const svg = d3.select(svgEl);
  const legend = d3.select(legendEl);
  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  if (!data?.length) return;

  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  const arc = d3.arc().innerRadius(24).outerRadius(48); // donut look
  const pie = d3.pie().value(d => d.value).sort(null);

  const g = svg.append('g');

  const arcs = g.selectAll('path')
    .data(pie(data))
    .enter()
    .append('path')
    .attr('class', 'slice')
    .attr('d', arc)
    .attr('fill', (_, i) => colors(i))  // color never changes on select
    .attr('stroke', '#fff')
    .attr('stroke-linejoin', 'round')
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', d => `Filter year ${d.data.label} (${d.data.value})`);

  const items = legend.selectAll('li')
    .data(data)
    .enter()
    .append('li')
    .attr('style', (_, i) => `--color: ${colors(i)}`)
    .attr('tabindex', 0)
    .html(d => `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);

  // --- Selection / hover (sticky) ---
  function applySelectionStyling() {
    const hasSel = !!state.selectedYear;

    // Selected keeps hover look; others dim
    arcs
      .classed('is-selected', d => d.data.label === state.selectedYear)
      .classed('is-hovered',  d => d.data.label === state.selectedYear) // keep hover animation on selected
      .classed('dimmed',      d => hasSel && d.data.label !== state.selectedYear)
      .attr('opacity',        d => (hasSel && d.data.label !== state.selectedYear ? 0.35 : 1));

    items
      .classed('is-selected', d => d.label === state.selectedYear)
      .classed('is-hovered',  d => d.label === state.selectedYear)
      .classed('dimmed',      d => hasSel && d.label !== state.selectedYear);
  }

  // Ignore hover when locked to a selection (keeps the sticky look obvious)
  function setHover(label) {
    if (state.selectedYear) return;
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

    // Rebuild pie from SEARCH-only set so pie/legend reflect the query,
    // but keep the sticky selection & dimming rules.
    drawPie(rollupCounts(getSearchOnlyProjects()));
  }

  // Events
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

  // Apply styles immediately if a selection already exists
  applySelectionStyling();
}

// ---------- Search ----------
searchEl?.addEventListener('input', () => {
  state.query = searchEl.value;
  renderList();
  drawPie(rollupCounts(getSearchOnlyProjects())); // pie reflects current query
});

// ---------- Initial render ----------
renderList();
drawPie(rollupCounts(getSearchOnlyProjects()));
