// Projects page (Lab 5 exact behavior)
import { fetchJSON, renderProjects } from '../global.js';

const d3ok = !!window.d3;
const $ = (sel) => document.querySelector(sel);

const cardsEl  = $('.projects');
const titleEl  = $('.projects-title');
const searchEl = $('#project-search');
const svgEl    = $('#projects-pie-plot');
const legendEl = document.querySelector('.legend');

let all = await fetchJSON('../lib/projects.json');
if (!Array.isArray(all)) all = [];
titleEl.textContent = `Projects (${all.length})`;

// ---- Lab 5 state ----
// ORIGINAL LAB BEHAVIOR (not combined filters):
// - Search filters the list and also recomputes the pie from the *search results*.
// - Clicking a slice/legend filters to that year.
// - If you then change the search, the slice may disappear (the "final pitfall").
const state = {
  query: '',
  selectedYear: null
};

// Normalize for search
const norm = (v) => (v ?? '').toString().toLowerCase();

function searchOnly(items) {
  if (!state.query) return items;
  const q = norm(state.query);
  return items.filter(p =>
    [p.title, p.description, p.year, p.link]
      .map(norm)
      .some(x => x.includes(q))
  );
}

function visibleItems() {
  // Build from search first (lab intent)
  let items = searchOnly(all);
  // If a year is selected, filter to that year
  if (state.selectedYear) {
    items = items.filter(p => String(p.year) === String(state.selectedYear));
  }
  return items;
}

function rollupByYear(items) {
  // year -> count
  const m = new Map();
  for (const p of items) {
    const y = String(p.year ?? '').trim();
    if (!y) continue;
    m.set(y, (m.get(y) ?? 0) + 1);
  }
  return Array.from(m, ([label, value]) => ({ label, value }))
              .sort((a,b) => a.label.localeCompare(b.label));
}

function renderList() {
  const items = visibleItems();
  renderProjects(items, cardsEl, 'h2');
  titleEl.textContent = `Projects (${items.length})`;
}

function drawPie(data) {
  if (!d3ok) return; // cards still render

  const d3 = window.d3;
  const svg = d3.select(svgEl);
  const legend = d3.select(legendEl);

  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  if (!data.length) return;

  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  const arc = d3.arc().innerRadius(24).outerRadius(48);     // donut
  const pie = d3.pie().value(d => d.value).sort(null);

  const g = svg.append('g');

  const arcs = g.selectAll('path')
    .data(pie(data))
    .enter()
    .append('path')
    .attr('class', 'slice')
    .attr('d', arc)
    .attr('fill', (_, i) => colors(i))
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

    // Re-render list
    renderList();

    // Now rebuild the pie from the *current* visible set per lab spec (this is
    // what leads to the "final pitfall" when mixing search + year).
    const pieData = rollupByYear(visibleItems());
    drawPie(pieData);
  }

  arcs.on('mouseenter', (_, d) => setHover(d.data.label))
      .on('mouseleave', clearHover)
      .on('click',     (_, d) => toggleSelect(d.data.label))
      .on('keydown',   (ev, d) => {
        if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.data.label);
      });

  items.on('mouseenter', (_, d) => setHover(d.label))
       .on('mouseleave', clearHover)
       .on('click',     (_, d) => toggleSelect(d.label))
       .on('keydown',   (ev, d) => {
         if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.label);
       });
}

// Search -> update list + pie (pie computed from *search results*)
searchEl?.addEventListener('input', () => {
  state.query = searchEl.value;
  renderList();
  state.selectedYear = state.selectedYear; // no-op; keeps logic explicit
  drawPie(rollupByYear(searchOnly(all)));
});

// Initial render
renderList();
drawPie(rollupByYear(searchOnly(all)));
