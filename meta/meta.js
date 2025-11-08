const d3ok = !!window.d3;
const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(',')(n);

// ---------- Load CSV (Step 1.1) ----------
const csvUrl = './loc.csv';
let rows = [];
try {
  rows = await d3.csv(csvUrl, d3.autoType);
} catch (e) {
  console.error('Failed to load meta/loc.csv', e);
  // Show a friendly hint:
  $('#stats')?.insertAdjacentHTML('beforeend',
    `<p class="notice">Could not load <code>meta/loc.csv</code>. Did you run
     <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code>?</p>`);
}

// Defensive: ensure required columns exist (file,line,type,author,date,time,datetime,length,language?)  :contentReference[oaicite:3]{index=3}
rows = (rows ?? []).filter(r => r.file && r.datetime);

// Parse to JS Date and derive fields we need
for (const r of rows) {
  r.dt = new Date(r.datetime || `${r.date}T${r.time}${r.timezone ?? ''}`);
  r.hour = r.dt.getHours();
  r.dow = r.dt.getDay(); 
  r.lines = +r.length || 0;
  r.lang = (r.type || 'other').toLowerCase();
}

// ---------- Step 1.2 & 1.3: compute & render stats ----------
function renderStats() {
  const stats = $('#stats');
  const grouped = $('#grouped');
  const minmax = $('#minmax');

  if (!rows.length) return;

  // Aggregates over the whole dataset (count of rows, total lines, files, authors)  :contentReference[oaicite:4]{index=4}
  const totalRows = rows.length;
  const totalLines = d3.sum(rows, d => d.lines);
  const distinctFiles = new Set(rows.map(d => d.file)).size;
  const distinctAuthors = new Set(rows.map(d => d.author)).size;

  const extras = document.getElementById('extras');
  const distinctDays = new Set(rows.map(d => d.dt.toDateString())).size;
  const byHour = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.hour)
                   .map(([hour, lines]) => ({ hour, lines }));
  const peakHour = d3.greatest(byHour, d => d.lines);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byDow = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.dow)
                  .map(([dow, lines]) => ({ dow, lines }));
  const peakDow = d3.greatest(byDow, d => d.lines);

  extras.innerHTML = `
    <div class="card"><strong>Days worked</strong><div>${fmt(distinctDays)}</div></div>
    <div class="card"><strong>Longest File (most lines)</strong><div title="${longestFile?.file ?? ''}">${longestFile?.file ?? '—'}</div><em>${fmt(longestFile?.lines ?? 0)} lines</em></div>
    <div class="card"><strong>Peak Hour</strong><div>${peakHour ? `${peakHour.hour}:00` : '—'}</div><em>${fmt(peakHour?.lines ?? 0)} lines</em></div>
    <div class="card"><strong>Peak Weekday</strong><div>${peakDow ? dayNames[peakDow.dow] : '—'}</div><em>${fmt(peakDow?.lines ?? 0)} lines</em></div>
  `;

  stats.innerHTML = `
    <div class="card"><strong>Total Rows</strong><div>${fmt(totalRows)}</div></div>
    <div class="card"><strong>Total Lines</strong><div>${fmt(totalLines)}</div></div>
    <div class="card"><strong>Total Files</strong><div>${fmt(distinctFiles)}</div></div>
    <div class="card"><strong># of Authors</strong><div>${fmt(distinctAuthors)}</div></div>
  `;

  // Grouped aggregates (by language/type)  :contentReference[oaicite:5]{index=5}
  const byLang = d3.rollups(rows, v => ({
    rows: v.length,
    lines: d3.sum(v, d => d.lines)
  }), d => d.lang).map(([k, v]) => ({ lang: k, ...v }))
   .sort((a,b) => d3.descending(a.lines, b.lines));

  grouped.innerHTML = byLang.map(d => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <div>${fmt(d.rows)} rows</div>
      <div>${fmt(d.lines)} lines</div>
    </div>
  `).join('');

  // Min/max value (per file by total lines)  :contentReference[oaicite:6]{index=6}
  const byFile = d3.rollups(rows, v => d3.sum(v, d => d.lines), d => d.file)
                   .map(([file, lines]) => ({ file, lines }));
  const minFile = d3.least(byFile, d => d.lines);
  const maxFile = d3.greatest(byFile, d => d.lines);

  minmax.innerHTML = `
    <div class="card"><strong>Min Lines (File)</strong><div>${minFile?.file ?? '—'}</div><em>${fmt(minFile?.lines ?? 0)}</em></div>
    <div class="card"><strong>Max Lines (File)</strong><div>${maxFile?.file ?? '—'}</div><em>${fmt(maxFile?.lines ?? 0)}</em></div>
  `;
}

// ---------- Step 2: scatter (time vs day) ----------
function renderScatter() {
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();
  if (!rows.length) return;

  // ── Size & margins
  const W = 640, H = 320, M = { t: 18, r: 14, b: 44, l: 52 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const g = svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .append('g')
    .attr('transform', `translate(${M.l},${M.t})`);

  // ── Scales
  // X: calendar date (by d.dt)
  const x = d3.scaleTime()
    .domain(d3.extent(rows, d => d.dt))
    .range([0, iw]);

  // Y: hour of day (0–23)
  const y = d3.scaleLinear()
    .domain([0, 23])
    .range([ih, 0])
    .nice();

  // Radius: smaller dots (quantile cap + smaller range)
  const rArea = d3.scaleSqrt()
    .domain([0, d3.quantile(rows.map(d => d.lines).sort(d3.ascending), 0.95) || 1])
    .range([1.5, 8]);     // <— smaller bubbles

  // ── Axes
  const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %d'));
  const yAxis = d3.axisLeft(y).ticks(6).tickFormat(h => `${h}:00`);

  g.append('g').attr('transform', `translate(0,${ih})`).call(xAxis);
  g.append('g').call(yAxis);

  // Horizontal grid lines every ~4 hours
  g.append('g')
    .attr('class', 'grid')
    .selectAll('line')
    .data(y.ticks(6))
    .join('line')
    .attr('x1', 0).attr('x2', iw)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  // ── Dots
  const dots = g.append('g').attr('class', 'dots')
    .selectAll('circle').data(rows)
    .join('circle')
    .attr('cx', d => x(d.dt))
    .attr('cy', d => y(d.hour))
    .attr('r', d => rArea(d.lines))
    .attr('fill', 'var(--ucsd-navy)')
    .attr('opacity', 0.85);

  // ── Tooltip
  const tip = d3.select('#tooltip');
  const fmtDate = d3.timeFormat('%b %d, %Y %H:%M');

  function showTip(d, evt) {
    tip.attr('hidden', null)
       .html(`
        <strong>${d.file}</strong><br>
        ${d.author ?? '—'}<br>
        ${fmtDate(d.dt)}<br>
        lines: ${d3.format(',')(d.lines)}
      `);
    const { clientX:xv, clientY:yv } = evt;
    tip.style('left', `${xv + 12}px`).style('top', `${yv + 12}px`);
  }
  function hideTip() { tip.attr('hidden', true); }

  // Better hover with Voronoi on new coordinates
  const delaunay = d3.Delaunay.from(rows, d => x(d.dt), d => y(d.hour));
  const vor = delaunay.voronoi([0,0,iw,ih]);

  g.append('g').selectAll('path')
    .data(rows).join('path')
    .attr('d', (_, i) => vor.renderCell(i))
    .attr('fill', 'transparent')
    .on('mousemove', (evt, d) => showTip(d, evt))
    .on('mouseleave', hideTip);

  // ── Brushing (keeps your selection counters working)
  const brush = d3.brush()
    .extent([[0,0],[iw,ih]])
    .on('start brush end', brushed);

  g.append('g').attr('class', 'brush').call(brush);

  function brushed({selection}) {
    const selCount = document.getElementById('sel-count');
    const langBreak = document.getElementById('lang-breakdown');

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

    selCount.textContent = `Selected: ${d3.format(',')(sel.length)}`;

    if (!sel.length) {
      langBreak.textContent = 'Languages: —';
    } else {
      const by = d3.rollups(sel, v => v.length, d => d.lang)
                   .map(([k,v]) => `${k}:${v}`).sort();
      langBreak.textContent = `Languages: ${by.join(', ')}`;
    }
  }
}


renderStats();
renderScatter();
