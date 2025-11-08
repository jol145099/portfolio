// Robust meta page: works with datetime OR date+time; shows demo if CSV missing.
// Scatter = x: date-only (ticks only where data exists), y: hour, brush with UCSD Gold highlight.

const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(',')(n);
const day = d3.timeDay;

// -------- Load CSV (safe) --------
async function loadRows() {
  let rows = [];
  try {
    rows = await d3.csv('./loc.csv', d3.autoType); // relative to /meta/
  } catch (e) {
    console.warn('Could not load meta/loc.csv:', e);
  }
  if (!rows || !rows.length) {
    // tiny demo so the page never looks empty
    const now = new Date();
    rows = [
      { file:'demo/a.js',   type:'js',   author:'you', datetime:now.toISOString(),                length:14 },
      { file:'demo/b.css',  type:'css',  author:'you', datetime:new Date(now-6e7).toISOString(), length:40 },
      { file:'demo/c.html', type:'html', author:'you', datetime:new Date(now-9e7).toISOString(), length:7  },
    ];
    $('#stats')?.insertAdjacentHTML('beforeend',
      `<p class="notice">Showing demo data because <code>meta/loc.csv</code> was not found.
       Generate it with: <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code></p>`);
  }

  // normalize & derive fields
  rows = rows.filter(r => r.file && (r.datetime || (r.date && r.time)));
  for (const r of rows) {
    const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ''}`;
    r.dt   = new Date(iso);
    if (isNaN(+r.dt)) continue;
    r.day  = day.floor(r.dt);      // date-only (for vertical alignment)
    r.hour = r.dt.getHours();      // 0..23
    r.dow  = r.dt.getDay();        // 0..6
    r.lines = +r.length || 0;
    r.lang  = (r.type || 'other').toLowerCase();
  }
  return rows.filter(r => r.dt instanceof Date && !isNaN(+r.dt));
}

// -------- Summary cards --------
function renderStats(rows) {
  const stats   = $('#stats');
  const grouped = $('#grouped');
  const minmax  = $('#minmax');
  const extras  = $('#extras');

  if (!rows.length) return;

  const totalRows       = rows.length;
  const totalLines      = d3.sum(rows, d => d.lines);
  const distinctFiles   = new Set(rows.map(d => d.file)).size;
  const distinctAuthors = new Set(rows.map(d => d.author)).size;

  stats.innerHTML = `
    <div class="card"><strong>Total Rows</strong><em>${fmt(totalRows)}</em></div>
    <div class="card"><strong>Total Lines</strong><em>${fmt(totalLines)}</em></div>
    <div class="card"><strong>Total Files</strong><em>${fmt(distinctFiles)}</em></div>
    <div class="card"><strong># of Authors</strong><em>${fmt(distinctAuthors)}</em></div>
  `;

  // extras
  const distinctDays = new Set(rows.map(d => d.dt.toDateString())).size;
  const fileTotals = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.file)
                       .map(([file, lines]) => ({ file, lines }));

  const byHour  = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.hour)
                    .map(([hour, lines]) => ({ hour, lines }));
  const peakHour = d3.greatest(byHour, d => d.lines);

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byDow  = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.dow)
                   .map(([dow, lines]) => ({ dow, lines }));
  const peakDow = d3.greatest(byDow, d => d.lines);

  extras.innerHTML = `
    <div class="card"><strong>Days Worked</strong><em>${fmt(distinctDays)}</em></div>
    <div class="card"><strong>Peak Hour</strong>
      <em>${peakHour ? `${peakHour.hour}:00` : '—'}</em>
      <em>${fmt(peakHour?.lines ?? 0)} lines</em>
    </div>
    <div class="card"><strong>Peak Weekday</strong>
      <em>${peakDow ? dayNames[peakDow.dow] : '—'}</em>
      <em>${fmt(peakDow?.lines ?? 0)} lines</em>
    </div>
  `;

  // by language/type
  const byLang = d3.rollups(rows, v => ({
    rows: v.length,
    lines: d3.sum(v, d => d.lines)
  }), d => d.lang).map(([lang, agg]) => ({ lang, ...agg }))
   .sort((a,b) => d3.descending(a.lines, b.lines));

  grouped.innerHTML = byLang.map(d => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <em>${fmt(d.rows)} rows</em>
      <em>${fmt(d.lines)} lines</em>
    </div>
  `).join('');

  // min/max by file
  const minFile = d3.least(fileTotals,  d => d.lines);
  const maxFile = d3.greatest(fileTotals, d => d.lines);

  minmax.innerHTML = `
    <div class="card"><strong>Min Lines (File)</strong>
      <em>${minFile?.file ?? '—'}</em><em>${fmt(minFile?.lines ?? 0)} lines</em>
    </div>
    <div class="card"><strong>Max Lines (File)</strong>
      <em>${maxFile?.file ?? '—'}</em><em>${fmt(maxFile?.lines ?? 0)} lines</em>
    </div>
  `;
}

// -------- Scatter (date-only x; ticks only where data exists; UCSD Gold highlight) --------
function renderScatter(rows) {
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();
  if (!rows.length) return;

  const W = 960, H = 480, M = { t: 22, r: 24, b: 60, l: 60 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const g = svg.attr('viewBox', `0 0 ${W} ${H}`)
               .append('g')
               .attr('transform', `translate(${M.l},${M.t})`);

  // x domain padded by 1 day on each side
  const d0 = d3.min(rows, d => d.day);
  const d1 = d3.max(rows, d => d.day);
  const start = day.offset(day.floor(d0), -1);
  const end   = day.offset(day.ceil(d1),  +1);

  const uniqueDays = Array.from(new Set(rows.map(d => +d.day)))
    .sort((a,b) => a - b)
    .map(ms => new Date(ms));

  const x = d3.scalePoint().domain(uniqueDays).range([0, iw]).padding(0.5);
  const y = d3.scaleLinear().domain([0, 23]).range([ih, 0]).nice();

  // area-correct, smaller dots
  const rArea = d3.scaleSqrt()
    .domain([0, d3.quantile(rows.map(d => d.lines).sort(d3.ascending), 0.95) || 1])
    .range([1.8, 9]);

  const xAxis = d3.axisBottom(x)
    .tickValues(uniqueDays)
    .tickFormat(d3.timeFormat('%m/%d'));

  const yAxis = d3.axisLeft(y).ticks(8).tickFormat(h => `${h}:00`);

  g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${ih})`).call(xAxis);
  g.append('g').attr('class', 'y-axis').call(yAxis);

  // horizontal grid
  g.append('g').attr('class', 'grid')
    .selectAll('line')
    .data(y.ticks(8))
    .join('line')
      .attr('x1', 0).attr('x2', iw)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

  // dots (use date-only for cx so each day is a vertical column)
  const dots = g.append('g').attr('class', 'dots')
    .selectAll('circle').data(rows)
    .join('circle')
      .attr('cx', d => x(d.day))
      .attr('cy', d => y(d.hour))
      .attr('r',  d => rArea(d.lines))
      .attr('fill', 'var(--ucsd-navy)')
      .attr('opacity', 0.95);

  // tooltip
  const tip = d3.select('#tooltip');
  const fmtDate = d3.timeFormat('%b %d, %Y %H:%M');
  function showTip(d, evt) {
    tip.attr('hidden', null).html(`
      <strong>${d.file}</strong><br>
      ${d.author ?? '—'}<br>
      ${fmtDate(d.dt)}<br>
      lines: ${fmt(d.lines)}
    `);
    const { clientX:xv, clientY:yv } = evt;
    tip.style('left', `${xv + 12}px`).style('top', `${yv + 12}px`);
  }
  const hideTip = () => tip.attr('hidden', true);

  // voronoi hover (aligned coords)
  const delaunay = d3.Delaunay.from(rows, d => x(d.day), d => y(d.hour));
  const vor = delaunay.voronoi([0,0,iw,ih]);
  g.append('g').selectAll('path')
    .data(rows).join('path')
      .attr('d', (_, i) => vor.renderCell(i))
      .attr('fill', 'transparent')
      .on('mousemove', (evt, d) => showTip(d, evt))
      .on('mouseleave', hideTip);

  // brush (highlight selected in UCSD GOLD)
  const HILITE = 'var(--ucsd-gold)';

  const brush = d3.brush().extent([[0,0],[iw,ih]]).on('start brush end', brushed);
  g.append('g').attr('class', 'brush').call(brush);

  function brushed({selection}) {
    const selCount  = $('#sel-count');
    const langBreak = $('#lang-breakdown');

    let sel = [];
    if (selection) {
      const [[x0,y0],[x1,y1]] = selection;
      sel = rows.filter(d => {
        const px = x(d.day), py = y(d.hour);
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
                   .map(([k,v]) => `${k}:${v}`).sort();
      langBreak.textContent = `Languages: ${by.join(', ')}`;
    }
  }
}

// -------- Boot --------
(async () => {
  const rows = await loadRows();
  renderStats(rows);
  renderScatter(rows);
})();
