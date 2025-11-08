// /meta/meta.js
// Robust Meta page: will render even if loc.csv is missing, and works with
// either `datetime` or (`date` + `time`).

// --- ensure D3 is available even if the head tags were changed accidentally
async function ensureD3() {
  if (window.d3) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/d3@7';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  if (!window.d3) throw new Error('D3 failed to load');
  if (!window.d3.Delaunay) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/d3-delaunay@6';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
}

const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(',')(n);

// ---------- Load rows ----------
// If CSV not found, we’ll inject a tiny demo so the page never looks empty.
async function loadRows() {
  let rows = [];
  try {
    rows = await d3.csv('./loc.csv', d3.autoType); // relative to /meta/
  } catch (e) {
    console.warn('Could not load meta/loc.csv:', e);
  }

  // If no data, seed demo rows so the UI renders:
  if (!rows || !rows.length) {
    const now = new Date();
    rows = [
      { file: 'demo/a.js',   type: 'js',   author: 'you', datetime: now.toISOString(),                length: 14 },
      { file: 'demo/b.css',  type: 'css',  author: 'you', datetime: new Date(now-6e7).toISOString(), length: 40 },
      { file: 'demo/c.html', type: 'html', author: 'you', datetime: new Date(now-9e7).toISOString(), length: 7  },
    ];
    $('#stats')?.insertAdjacentHTML('beforeend',
      `<p class="notice">Showing demo data because <code>meta/loc.csv</code> was not found.
      To generate it, run <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code> in your repo root and commit the file.</p>`);
  }

  // Normalize & derive fields
  rows = rows.filter(r => r.file && (r.datetime || (r.date && r.time)));
  for (const r of rows) {
    const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ''}`;
    r.dt = new Date(iso);
    if (isNaN(+r.dt)) continue;
    r.hour  = r.dt.getHours();
    r.dow   = r.dt.getDay();
    r.lines = +r.length || 0;
    r.lang  = (r.type || 'other').toLowerCase();
  }
  // drop any unparsable dates
  rows = rows.filter(r => r.dt instanceof Date && !isNaN(+r.dt));
  return rows;
}

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
    <div class="card"><strong>Total Rows</strong><div>${fmt(totalRows)}</div></div>
    <div class="card"><strong>Total Lines</strong><div>${fmt(totalLines)}</div></div>
    <div class="card"><strong>Total Files</strong><div>${fmt(distinctFiles)}</div></div>
    <div class="card"><strong># of Authors</strong><div>${fmt(distinctAuthors)}</div></div>
  `;

  // Extras
  const distinctDays = new Set(rows.map(d => d.dt.toDateString())).size;
  const fileTotals = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.file)
                       .map(([file, lines]) => ({ file, lines }));
  const longestFile = d3.greatest(fileTotals, d => d.lines);
  const byHour = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.hour)
                   .map(([hour, lines]) => ({ hour, lines }));
  const peakHour = d3.greatest(byHour, d => d.lines);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byDow = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.dow)
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

  // Grouped by language/type
  const byLang = d3.rollups(rows, v => ({
    rows: v.length,
    lines: d3.sum(v, d => d.lines)
  }), d => d.lang).map(([lang, agg]) => ({ lang, ...agg }))
   .sort((a,b) => d3.descending(a.lines, b.lines));

  grouped.innerHTML = byLang.map(d => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <div>${fmt(d.rows)} rows</div>
      <div>${fmt(d.lines)} lines</div>
    </div>
  `).join('');

  // Min/Max by file
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

function renderScatter(rows) {
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

  const rArea = d3.scaleSqrt()
    .domain([0, d3.quantile(rows.map(d => d.lines).sort(d3.ascending), 0.95) || 1])
    .range([1.5, 8]);  // smaller dots

  const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %d'));
  const yAxis = d3.axisLeft(y).ticks(6).tickFormat(h => `${h}:00`);

  g.append('g').attr('transform', `translate(0,${ih})`).call(xAxis);
  g.append('g').call(yAxis);

  g.append('g').attr('class', 'grid')
    .selectAll('line')
    .data(y.ticks(6))
    .join('line')
    .attr('x1', 0).attr('x2', iw)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  const dots = g.append('g').attr('class', 'dots')
    .selectAll('circle').data(rows)
    .join('circle')
      .attr('cx', d => x(d.dt))
      .attr('cy', d => y(d.hour))
      .attr('r',  d => rArea(d.lines))
      .attr('fill', 'var(--ucsd-navy)')
      .attr('opacity', 0.85);

  // Tooltip
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

  const delaunay = d3.Delaunay.from(rows, d => x(d.dt), d => y(d.hour));
  const vor = delaunay.voronoi([0,0,iw,ih]);
  g.append('g').selectAll('path')
    .data(rows).join('path')
    .attr('d', (_, i) => vor.renderCell(i))
    .attr('fill', 'transparent')
    .on('mousemove', (evt, d) => showTip(d, evt))
    .on('mouseleave', hideTip);

  // Brush
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

// ---------- boot ----------
(async () => {
  try {
    await ensureD3();
    const rows = await loadRows();
    renderStats(rows);
    renderScatter(rows);
  } catch (e) {
    console.error(e);
    $('#stats')?.insertAdjacentHTML('beforeend',
      `<p class="notice">Meta page failed to initialize. Open DevTools (F12) → Console for details.</p>`);
  }
})();
