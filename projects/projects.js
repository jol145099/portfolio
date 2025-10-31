// /projects/projects.js
import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm'; // lab uses jsDelivr +esm import  :contentReference[oaicite:4]{index=4}

const container = document.querySelector('.projects');
const titleEl = document.querySelector('.projects-title');
const searchInput = document.getElementById('project-search');
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');

let allProjects = await fetchJSON('../lib/projects.json');   // from Lab 4
if (!Array.isArray(allProjects)) allProjects = [];
titleEl.textContent = `Projects (${allProjects.length})`;

// ------------------------------
// State: search + selected year
// ------------------------------
let state = {
  query: '',
  selectedYear: null,    // clicking a pie slice/legend sets this
  // Set to true to combine search AND year filter (extra credit). If false, it's the default lab behavior.
  combineFilters: false
};

function normalize(str) {
  return (str ?? '').toString().toLowerCase();
}

// Visible subset based on state
function getVisibleProjects() {
  let items = allProjects;

  // Search (Step 4.2 + 4.3: case-insensitive & across multiple fields)  :contentReference[oaicite:5]{index=5}
  if (state.query) {
    const q = normalize(state.query);
    items = items.filter(p => {
      return [p.title, p.description, p.year, p.link]
        .map(normalize)
        .some(v => v.includes(q));
    });
  }

  // Year filter (Step 5.3)  :contentReference[oaicite:6]{index=6}
  if (state.selectedYear && (state.combineFilters || !state.query)) {
    items = items.filter(p => String(p.year) === String(state.selectedYear));
  }
  return items;
}

// Render the card grid (Lab 4)
function renderList() {
  const visible = getVisibleProjects();

  // Render cards
  renderProjects(visible, container, 'h2');

  // Update count in heading
  titleEl.textContent = `Projects (${visible.length})`;
}

// ------------------------------
// Pie & legend helpers (Step 1–3)
// ------------------------------
const colors = d3.scaleOrdinal(d3.schemeTableau10); // any categorical palette is fine

// map: year -> count from a given project list
function rollupCounts(items) {
  // Step 3.1: roll up by year then map to { label, value }  :contentReference[oaicite:7]{index=7}
  const rolled = d3.rollups(items, v => v.length, d => String(d.year));
  return rolled.map(([year, count]) => ({ label: year, value: count })).sort((a, b) => d3.ascending(a.label, b.label));
}

function drawPie(data) {
  svg.selectAll('*').remove();       // clear
  legend.selectAll('*').remove();    // clear

  if (!data.length) return;

  // Geometry
  const arc = d3.arc().innerRadius(0).outerRadius(48);
  const pie = d3.pie().value(d => d.value).sort(null);

  // Pie paths
  const g = svg.append('g');

  const arcs = g.selectAll('path')
    .data(pie(data))
    .enter()
    .append('path')
    .attr('d', arc)
    .attr('fill', (d, i) => colors(i))
    .attr('stroke', 'currentColor')
    .attr('stroke-width', 0.5)
    .attr('data-label', d => d.data.label)
    .attr('tabindex', 0)                           // accessibility
    .attr('role', 'button')
    .attr('aria-label', d => `Filter year ${d.data.label} (${d.data.value})`);

  // Step 2: Build legend items from data and set style="--color: ..."  :contentReference[oaicite:8]{index=8}
  const items = legend.selectAll('li')
    .data(data)
    .enter()
    .append('li')
    .attr('style', (_, i) => `--color: ${colors(i)}`)
    .attr('tabindex', 0)
    .html(d => `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);

  // --- Interactions (Step 5.1, 5.2, 5.3)  :contentReference[oaicite:9]{index=9}
  function setHover(label) {
    arcs.classed('is-hovered', d => d.data.label === label)
        .attr('opacity', d => (label && d.data.label !== label ? 0.35 : 1));
    items.classed('is-hovered', d => d.label === label);
  }
  function clearHover() { setHover(null); }

  function toggleSelect(label) {
    state.selectedYear = (state.selectedYear === label) ? null : label;
    // highlight selected
    arcs.classed('is-selected', d => d.data.label === state.selectedYear);
    items.classed('is-selected', d => d.label === state.selectedYear);
    renderList(); // filter the cards by year (Step 5.3)
  }

  // Hover (pie)
  arcs.on('mouseenter', (_, d) => setHover(d.data.label))
      .on('mouseleave', clearHover)
      .on('click', (_, d) => toggleSelect(d.data.label))
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.data.label); });

  // Hover (legend)
  items.on('mouseenter', (_, d) => setHover(d.label))
       .on('mouseleave', clearHover)
       .on('click',   (_, d) => toggleSelect(d.label))
       .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') toggleSelect(d.label); });
}

// ------------------------------
// Wire up search (Step 4)
// ------------------------------
searchInput?.addEventListener('input', () => {
  state.query = searchInput.value;
  renderList();
  // Pie should reflect currently visible projects (Step 4.4)
  const data = rollupCounts(getVisibleProjects());
  drawPie(data);
});

// ------------------------------
// Initial render
// ------------------------------
renderList();
drawPie(rollupCounts(getVisibleProjects()));

