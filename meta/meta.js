// /meta/meta.js
// Loads meta/loc.csv and renders summary cards + scatter (x=date, y=hour)
// with tooltip, smaller dots, and brushing. Robust to either `datetime` OR
// `date` + `time` columns.

const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(',')(n);

// ---------- Load CSV ----------
const csvUrl = './loc.csv';
let rows = [];
try {
  rows = await d3.csv(csvUrl, d3.autoType);
} catch (e) {
  console.error('Failed to load meta/loc.csv', e);
  $('#stats')?.insertAdjacentHTML(
    'beforeend',
    `<p class="notice">Could not load <code>meta/loc.csv</code>. Did you run
     <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code>?</p>`
  );
}

// Keep rows that have a file AND either a `datetime` or (`date` & `time`)
rows = (rows ?? []).filter(r => {
  const hasDT = !!r.datetime || (!!r.date && !!r.time);
  return r.file && hasDT;
});

// Parse to JS Date and derive fields
for (const r of rows) {
  // prefer datetime; else compose from date + time (+ timezone if present)
  const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ''}`;
  r.dt = new Date(iso);
  if (isNaN(+r.dt)) continue; // skip unparsable
  r.hour  = r.dt.getHours();
  r.dow   = r.dt.getDay();         // 0..6
  r.lines = +r.length || 0;        // elocuent "length" ≈ line count
  r.lang  = (r.type || 'other').toLowerCase();
}

// ---------- Summary cards ----------
function renderStats() {
  const stats   = $('#stats');
  const grouped = $('#grouped');
  const minmax  = $('#minmax');
  const extras  = $('#extras');

  if (!rows.length) return;

  // Totals & distincts
  const totalRows      = rows.length;
  const totalLines     = d3.sum(rows, d => d.lines);
  const distinctFiles  = new Set(rows.map(d => d.file)).size;
  const distinctAuthors= new Set(rows.map(d => d.author)).size;

  stats.innerHTML = `
    <div class="card"><strong>Total Rows</strong><div>${fmt(totalRows)}</div></div>
    <div class="card"><strong>Total Lines</strong><div>${fmt(totalLines)}</div></div>
    <div class="card"><strong>Total Files</strong><div>${fmt(distinctFiles)}</div></div>
    <div class="card"><strong># of Authors</strong><div>${fmt(distinctAuthors)}</div></div>
  `;

  // NEW metrics (days worked, longest file, peak hour, peak weekday)
  const distinctDays = new Set(rows.map(d => d.dt.toDateString())).size;

  // define longestFile (bug fix: it was referenced but not defined)
  const fileTotals = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.file)
                       .map(([file, lines]) => ({ file, lines }));
  const longestFile = d3.greatest(fileTotals, d => d.lines);

  const byHour  = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.hour)
                    .map(([hour, lines]) => ({ hour, lines }));
  const peakHour = d3.greatest(byHour, d => d.lines);

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byDow  = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.dow)
                   .map(([dow, lines]) => ({ dow, lines }));
  const peakDow = d3.greatest(byDow, d => d.lines);

  extras.innerHTML = `
    <div class="card"><strong>Days worked</strong><div>${fmt(distinctDays)}</div></div>
    <div class="card"><strong>Longest File (most lines)</strong>
      <div title="${longestFile?.file ?? ''}">${longestFile?.file ?? '—'}</div>
      <em>${fmt(longestFile?.lines ?? 0)} lines</em>
    </div>
    <div class="card"><strong>Peak hour</strong>
      <div>${peakHour ? `${peakHour.hour}:00` : '—'}</div>
      <em>${fmt(peakHour?.lines ?? 0)} lines</em>
    </div>
    <div class="card"><strong>Peak weekday</strong>
      <div>${peakDow ? dayNames[peakDow.dow] : '—'}</div>
      <em>${fmt(peakDow?.lines ?? 0)} lines</em>
    </div>
  `;

  // By language/type
  const byLang = d3.rollups(
      rows,
      v => ({ rows: v.length, lines: d3.sum(v, d => d.lines) }),
      d => d.lang
    )
    .map(([lang, agg]) => ({ lang, ...agg }))
    .sort((a,b) => d3.descending(a.lines, b.lines));

  grouped.innerHTML = byLang.map(d => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <div>${fmt(d.rows)} rows</div>
      <div>${fmt(d.lines)} lines</div>
    </div>
  `).join('');

  // Min / Max file by total lines
  const minFile = d3.least(fileTotals,  d => d.lines);
  const maxFile = d3.greatest(fileTotals, d => d.lines);

  minmax.innerHTML = `
    <div class="card"><strong>Min Lines (File)</strong>
      <div>${minFile?.file ?? '—'}</div><em>${fmt(minFile?.lines ?? 0)}</em>
    </div>
    <div class="card"><strong>Max Lines (File)</strong>
      <div>${maxFile?.file ?? '—'}</div><em>${fmt(maxFile?.lines ?? 0)}</em>
    </div>
  `;
}

// ---------- Scatter: x = calendar date, y = hour (smaller dots) ----------
function renderScatter() {
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();
  if (!rows.length) return;

  const W = 640, H = 320, M = { t: 18, r: 14, b: 44, l: 52 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const g = svg.attr('viewBox', `0 0 ${W} ${H}`)
               .append('g')
               .attr('transform', `translate(${M.l},${M.t})`);

  const x = d3.scaleTime()
              .domain(d3.extent(rows, d => d.dt))
              .range([0, iw]);

  const y = d3.scaleLinear()
              .domain([0, 23])
              .range([ih, 0])
              .nice();

  // Smaller dots
  const rArea = d3.scaleSqrt()
                  .domain([0, d3.quantile(rows.map(d => d.lines).sort(d3.ascending), 0.95) || 1])
                  .range([1.5, 8]);

  const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %d'));
  const yAxis = d3.axisLeft(y).ticks(6).tickFormat(h => `${h}:00`);

  g.append('g').attr('transform', `translate(0,${ih})`).call(xAxis);
  g.append('g').call(yAxis);

  // grid
  g.append('g').attr('class', 'grid')
    .selectAll('line')
    .data(y.ticks(6))
    .join('line')
    .attr('x1', 0).attr('x2', iw)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  // dots
  const dots = g.append('g').attr('class', 'dots')
    .selectAll('circle').data(rows)
    .join('circle')
      .attr('cx', d => x(d.dt))
      .attr('cy', d => y(d.hour))
      .attr('r',  d => rArea(d.lines))
      .attr('fill', 'var(--ucsd-navy)')
      .attr('opacity', 0.85);

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

  // Voronoi hover
  const delaunay = d3.Delaunay.from(rows, d => x(d.dt), d => y(d.hour));
  const vor = delaunay.voronoi([0,0,iw,ih]);
  g.append('g').selectAll('path')
    .data(rows).join('path')
    .attr('d', (_, i) => vor.renderCell(i))
    .attr('fill', 'transparent')
    .on('mousemove', (evt, d) => showTip(d, evt))
    .on('mouseleave', hideTip);

  // brush
  const brush = d3.brush().extent([[0,0],[iw,ih]]).on('start brush end', brushed);
  g.append('g').attr('class', 'brush').call(brush);

  function brushed({selection}) {
    const selCount  = $('#sel-count');
    const langBreak = $('#lang-breakdown');

    let sel = [];
    if (selection) {
      const [[x0,y0],[x1,y1]] = selection;
      sel = rows.filter(d => {
        const px = x(d.dt), py = y(d.hour);
        return x0 <= px && px <= x1 && y0 <= py && py <= y1;
      });
    }

    dots.attr('fill', d => sel.length && !sel.includes(d) ? 'var(--accent-weak)' : 'var(--ucsd-navy)')
        .attr('opacity', d => sel.length && !sel.includes(d) ? 0.35 : 0.85);

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

// ---------- Run ----------
renderStats();
renderScatter();
