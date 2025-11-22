// meta.js — Lab 8 version
// - Two-handled date range slider (indices into uniqueDays)
// - Scatterplot (equal spacing per day, 12-hour y-axis, gold selection)
// - Summary statistics
// - Unit visualization + 4-step scrollytelling with Scrollama

const $ = (s) => document.querySelector(s);
const fmt = d3.format(',');
const day = d3.timeDay;

let allRows = [];
let uniqueDays = [];
let dayIndexMap = new Map();
let units = [];

let mostActiveDay = null;
let mostActiveDow = null;
let topAuthor = null;

// ---------------------------------------------------------------------
// LOAD + PREP DATA
// ---------------------------------------------------------------------
async function loadRows() {
  let rows = [];
  try {
    rows = await d3.csv('./loc.csv', d3.autoType);
  } catch (err) {
    console.warn('Could not load loc.csv, using demo data.', err);
    const now = new Date();
    rows = [
      { file: 'demo/index.html',  type: 'html', author: 'you', datetime: now.toISOString(), length: 150 },
      { file: 'demo/style.css',   type: 'css',  author: 'you', datetime: new Date(now - 6e7).toISOString(), length: 200 },
      { file: 'demo/global.js',   type: 'js',   author: 'you', datetime: new Date(now - 12e7).toISOString(), length: 120 },
    ];
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.innerHTML = `
      Showing demo data because <code>meta/loc.csv</code> was not found.
      Generate it with:
      <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code>.
    `;
    $('#stats-overall')?.appendChild(notice);
  }

  // Normalize and derive fields
  const cleaned = [];
  for (const r of rows) {
    const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ''}`;
    const dt = new Date(iso);
    if (!(dt instanceof Date) || isNaN(+dt)) continue;

    const dayOnly = day.floor(dt);
    cleaned.push({
      ...r,
      dt,
      day: dayOnly,
      hour: dt.getHours(),
      dow: dt.getDay(),
      lines: +r.length || 0,
      lang: (r.type || 'other').toLowerCase(),
      author: r.author || 'Unknown'
    });
  }
  return cleaned;
}

function computeDerived() {
  // Unique days and mapping to indices
  uniqueDays = Array.from(new Set(allRows.map(d => +d.day)))
    .sort((a, b) => a - b)
    .map(ms => new Date(ms));

  dayIndexMap = new Map(uniqueDays.map((d, i) => [+d, i]));
  allRows.forEach(r => {
    r.dayIdx = dayIndexMap.get(+r.day);
  });

  // Most active day (by total lines)
  const byDay = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => +d.day);
  const maxDay = d3.greatest(byDay, d => d[1]);
  mostActiveDay = maxDay ? new Date(maxDay[0]) : null;

  // Most active weekday (0..6)
  const byDow = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => d.dow);
  const maxDow = d3.greatest(byDow, d => d[1]);
  mostActiveDow = maxDow ? maxDow[0] : null;

  // Top author (by lines)
  const byAuthor = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => d.author);
  const maxAuthor = d3.greatest(byAuthor, d => d[1]);
  topAuthor = maxAuthor ? maxAuthor[0] : null;
}

// ---------------------------------------------------------------------
// SUMMARY STATS
// ---------------------------------------------------------------------
function renderStats() {
  const overall = $('#stats-overall');
  const extra   = $('#stats-extra');
  const langDiv = $('#stats-lang');
  const minmax  = $('#stats-minmax');

  if (!allRows.length) return;

  const totalRows     = allRows.length;
  const totalLines    = d3.sum(allRows, d => d.lines);
  const distinctFiles = new Set(allRows.map(d => d.file)).size;
  const distinctAuth  = new Set(allRows.map(d => d.author)).size;

  overall.innerHTML = `
    <div class="card"><strong>Total Rows</strong><div>${fmt(totalRows)}</div></div>
    <div class="card"><strong>Total Lines</strong><div>${fmt(totalLines)}</div></div>
    <div class="card"><strong>Total Files</strong><div>${fmt(distinctFiles)}</div></div>
    <div class="card"><strong># of Authors</strong><div>${fmt(distinctAuth)}</div></div>
  `;

  // Extra: days worked, peak hour, peak weekday
  const daysWorked = new Set(allRows.map(d => d.day.toDateString())).size;
  const byHour = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => d.hour)
    .map(([h, lines]) => ({ hour: h, lines }));
  const peakHour = d3.greatest(byHour, d => d.lines);

  const byDow = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => d.dow)
    .map(([dow, lines]) => ({ dow, lines }));
  const peakDow = d3.greatest(byDow, d => d.lines);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  extra.innerHTML = `
    <div class="card">
      <strong>Days Worked</strong>
      <div>${fmt(daysWorked)}</div>
    </div>
    <div class="card">
      <strong>Peak Hour</strong>
      <div>${formatHour12(peakHour?.hour ?? 0)}</div>
      <em>${fmt(peakHour?.lines ?? 0)} lines</em>
    </div>
    <div class="card">
      <strong>Peak Weekday</strong>
      <div>${peakDow ? dayNames[peakDow.dow] : '—'}</div>
      <em>${fmt(peakDow?.lines ?? 0)} lines</em>
    </div>
  `;

  // By language/type
  const byLang = d3.rollups(
    allRows,
    v => ({
      rows: v.length,
      lines: d3.sum(v, d => d.lines)
    }),
    d => d.lang
  )
    .map(([lang, agg]) => ({ lang, ...agg }))
    .sort((a, b) => d3.descending(a.lines, b.lines));

  langDiv.innerHTML = byLang.map(d => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <div>${fmt(d.rows)} rows</div>
      <em>${fmt(d.lines)} lines</em>
    </div>
  `).join('');

  // Min / max file
  const fileTotals = d3.rollups(allRows, v => d3.sum(v, d => d.lines), d => d.file)
    .map(([file, lines]) => ({ file, lines }));
  const minFile = d3.least(fileTotals, d => d.lines);
  const maxFile = d3.greatest(fileTotals, d => d.lines);

  minmax.innerHTML = `
    <div class="card">
      <strong>Min Lines (File)</strong>
      <div>${minFile?.file ?? '—'}</div>
      <em>${fmt(minFile?.lines ?? 0)} lines</em>
    </div>
    <div class="card">
      <strong>Max Lines (File)</strong>
      <div>${maxFile?.file ?? '—'}</div>
      <em>${fmt(maxFile?.lines ?? 0)} lines</em>
    </div>
  `;
}

// ---------------------------------------------------------------------
// RANGE SLIDER + SCATTER
// ---------------------------------------------------------------------
function initSliderAndScatter() {
  const startInput = $('#date-start');
  const endInput   = $('#date-end');
  const label      = $('#range-label');

  if (!uniqueDays.length) {
    startInput.disabled = true;
    endInput.disabled = true;
    return;
  }

  const maxIdx = uniqueDays.length - 1;
  startInput.min = '0';
  endInput.min   = '0';
  startInput.max = String(maxIdx);
  endInput.max   = String(maxIdx);
  startInput.value = '0';
  endInput.value   = String(maxIdx);

  const fmtDay = d3.timeFormat('%m/%d');

  function updateRangeLabel(s, e) {
    const startDay = uniqueDays[s];
    const endDay   = uniqueDays[e];
    label.textContent = `${fmtDay(startDay)} – ${fmtDay(endDay)}`;
  }

  function applyFilter() {
    let s = +startInput.value;
    let e = +endInput.value;
    if (s > e) [s, e] = [e, s];

    updateRangeLabel(s, e);

    const subset = allRows.filter(r => r.dayIdx >= s && r.dayIdx <= e);
    renderScatter(subset);
  }

  startInput.addEventListener('input', applyFilter);
  endInput.addEventListener('input', applyFilter);

  // initial render
  updateRangeLabel(0, maxIdx);
  const initialRows = allRows.filter(r => r.dayIdx >= 0 && r.dayIdx <= maxIdx);
  renderScatter(initialRows);
}

function formatHour12(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${ampm}`;
}

function renderScatter(rows) {
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();
  if (!rows.length) return;

  const W = 960, H = 420, M = { t: 20, r: 24, b: 60, l: 60 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const g = svg.attr('viewBox', `0 0 ${W} ${H}`)
    .append('g')
    .attr('transform', `translate(${M.l},${M.t})`);

  // x scale: equal spacing per day (scalePoint)
  const daysForPlot = Array.from(new Set(rows.map(d => +d.day)))
    .sort((a, b) => a - b)
    .map(ms => new Date(ms));

  const x = d3.scalePoint()
    .domain(daysForPlot)
    .range([0, iw])
    .padding(0.5);

  // y scale: 0–23 hours
  const y = d3.scaleLinear()
    .domain([0, 23])
    .range([ih, 0])
    .nice();

  // radius ~ sqrt(lines), but capped
  const rArea = d3.scaleSqrt()
    .domain([0, d3.quantile(rows.map(d => d.lines).sort(d3.ascending), 0.95) || 1])
    .range([1.8, 9]);

  const fmtDay = d3.timeFormat('%m/%d');

  // Axes
  const xAxis = d3.axisBottom(x).tickFormat(fmtDay);
  const yAxis = d3.axisLeft(y)
    .ticks(8)
    .tickFormat(h => formatHour12(h));

  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${ih})`)
    .call(xAxis);

  g.append('g')
    .attr('class', 'y-axis')
    .call(yAxis);

  // horizontal grid
  g.append('g')
    .attr('class', 'grid')
    .selectAll('line')
    .data(y.ticks(8))
    .join('line')
    .attr('x1', 0)
    .attr('x2', iw)
    .attr('y1', d => y(d))
    .attr('y2', d => y(d));

  // dots
  const dots = g.append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(rows)
    .join('circle')
    .attr('cx', d => x(d.day))
    .attr('cy', d => y(d.hour))
    .attr('r', d => rArea(d.lines))
    .attr('fill', 'var(--ucsd-navy)')
    .attr('opacity', 0.95);

  // Tooltip
  const tip = d3.select('#tooltip');
  const fmtDate = d3.timeFormat('%m/%d/%Y %I:%M %p');

  function showTip(d, evt) {
    tip.attr('hidden', null).html(`
      <strong>${d.file}</strong><br>
      ${d.author}<br>
      ${fmtDate(d.dt)}<br>
      ${fmt(d.lines)} lines
    `);
    tip.style('left', `${evt.clientX + 12}px`)
       .style('top', `${evt.clientY + 12}px`);
  }
  const hideTip = () => tip.attr('hidden', true);

  // Voronoi hover for easier targeting
  const delaunay = d3.Delaunay.from(rows, d => x(d.day), d => y(d.hour));
  const vor = delaunay.voronoi([0, 0, iw, ih]);

  g.append('g')
    .selectAll('path')
    .data(rows)
    .join('path')
    .attr('d', (_, i) => vor.renderCell(i))
    .attr('fill', 'transparent')
    .on('mousemove', (evt, d) => showTip(d, evt))
    .on('mouseleave', hideTip);

  // Brush selection: highlight with UCSD gold
  const HILITE = 'var(--ucsd-gold)';
  const brush = d3.brush()
    .extent([[0, 0], [iw, ih]])
    .on('start brush end', brushed);

  g.append('g')
    .attr('class', 'brush')
    .call(brush);

  function brushed({ selection }) {
    const selCount  = $('#sel-count');
    const langBreak = $('#lang-breakdown');

    let sel = [];
    if (selection) {
      const [[x0, y0], [x1, y1]] = selection;
      sel = rows.filter(d => {
        const px = x(d.day);
        const py = y(d.hour);
        return x0 <= px && px <= x1 && y0 <= py && py <= y1;
      });
    }

    dots
      .attr('fill', d => sel.length && sel.includes(d) ? HILITE : 'var(--ucsd-navy)')
      .attr('opacity', d => sel.length && !sel.includes(d) ? 0.35 : 0.95);

    selCount.textContent = `Selected: ${fmt(sel.length)}`;
    if (!sel.length) {
      langBreak.textContent = 'Languages: —';
    } else {
      const by = d3.rollups(sel, v => v.length, d => d.lang)
        .map(([k, v]) => `${k}:${v}`)
        .sort();
      langBreak.textContent = `Languages: ${by.join(', ')}`;
    }
  }
}

// ---------------------------------------------------------------------
// UNIT VISUALIZATION + SCROLLY
// ---------------------------------------------------------------------
function buildUnits() {
  const units = [];
  for (const row of allRows) {
    const count = Math.max(1, Math.round(row.lines / 100)); // 1 dot ~= 100 lines
    for (let i = 0; i < count; i++) {
      units.push({
        id: units.length,
        row
      });
    }
  }
  return units;
}

function initUnitViz() {
  units = buildUnits();
  const svg = d3.select('#unit-svg');
  svg.selectAll('*').remove();
  if (!units.length) return;

  const W = 640;
  const H = 420;
  const padding = 32;
  const cell = 20;
  const cols = 20;

  const g = svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .append('g')
    .attr('transform', `translate(${padding},${padding})`);

  units.forEach((u, i) => {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    u.x = col * cell;
    u.y = rowIdx * cell;
  });

  g.selectAll('circle')
    .data(units)
    .join('circle')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', 6)
    .attr('fill', 'var(--ucsd-navy)')
    .attr('opacity', 0.85);

  // initial state: show all
  updateUnitHighlight('all');
}

function isHighlighted(mode, row) {
  if (mode === 'all') return true;
  if (mode === 'today' && mostActiveDay) {
    return day.floor(row.day).getTime() === day.floor(mostActiveDay).getTime();
  }
  if (mode === 'weekday' && mostActiveDow != null) {
    return row.dow === mostActiveDow;
  }
  if (mode === 'author' && topAuthor) {
    return row.author === topAuthor;
  }
  return false;
}

function updateUnitHighlight(mode = 'all') {
  const BASE = 'var(--ucsd-navy)';
  const HI   = 'var(--ucsd-gold)';

  const circles = d3.select('#unit-svg').selectAll('circle');

  circles
    .transition()
    .duration(600)
    .attr('fill', d => (isHighlighted(mode, d.row) ? HI : BASE))
    .attr('opacity', d => (isHighlighted(mode, d.row) ? 0.95 : 0.2));
}

function initScrolly() {
  const scroller = scrollama();

  scroller
    .setup({
      step: '#scrolly-steps .step',
      offset: 0.6,
    })
    .onStepEnter(({ element }) => {
      const mode = element.dataset.step || 'all';
      updateUnitHighlight(mode);
    });

  window.addEventListener('resize', () => scroller.resize());
}

// ---------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------
(async function init() {
  allRows = await loadRows();
  if (!allRows.length) return;

  computeDerived();
  renderStats();
  initSliderAndScatter();
  initUnitViz();
  initScrolly();
})();
