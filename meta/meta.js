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

  stats.innerHTML = `
    <div class="card"><strong>Total records</strong><div>${fmt(totalRows)}</div></div>
    <div class="card"><strong>Total lines</strong><div>${fmt(totalLines)}</div></div>
    <div class="card"><strong>Distinct files</strong><div>${fmt(distinctFiles)}</div></div>
    <div class="card"><strong>Distinct authors</strong><div>${fmt(distinctAuthors)}</div></div>
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
    <div class="card"><strong>Min lines (file)</strong><div>${minFile?.file ?? '—'}</div><em>${fmt(minFile?.lines ?? 0)}</em></div>
    <div class="card"><strong>Max lines (file)</strong><div>${maxFile?.file ?? '—'}</div><em>${fmt(maxFile?.lines ?? 0)}</em></div>
  `;
}

// ---------- Step 2: scatter (time vs day) ----------
function renderScatter() {
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();
  if (!rows.length) return;

  const W = 700, H = 420, M = { t: 20, r: 20, b: 40, l: 50 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);

  // Scales
  const x = d3.scaleLinear().domain([0, 23]).range([0, iw]); // hours 0–23
  const y = d3.scalePoint().domain([0,1,2,3,4,5,6]).range([0, ih]).padding(0.5); // days 0–6
  const rArea = d3.scaleSqrt() // Step 4.1 + 4.2: area-correct size  :contentReference[oaicite:7]{index=7}
    .domain([0, d3.quantile(rows.map(d=>d.lines).sort(d3.ascending), 0.95) || 1])
    .range([2, 18]);

  // Axes (Step 2.2)
  const xAxis = d3.axisBottom(x).ticks(12).tickFormat(d => `${d}:00`);
  const yAxis = d3.axisLeft(y).tickFormat(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]);

  g.append('g').attr('transform', `translate(0,${ih})`).call(xAxis);
  g.append('g').call(yAxis);

  // Grid (Step 2.3 - horizontal)
  g.append('g')
    .attr('class', 'grid')
    .selectAll('line')
    .data(y.domain())
    .join('line')
    .attr('x1', 0).attr('x2', iw)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  // Dots (Step 2.1 + Step 4.1/4.2)
  const dots = g.append('g').attr('class', 'dots')
    .selectAll('circle').data(rows)
    .join('circle')
    .attr('cx', d => x(d.hour))
    .attr('cy', d => y(d.dow))
    .attr('r', d => rArea(d.lines))
    .attr('fill', 'var(--ucsd-navy)')
    .attr('opacity', 0.85);

  // Tooltip (Step 3)
  const tip = d3.select('#tooltip');

  function showTip(d, evt) {
    tip.attr('hidden', null)
       .html(`
        <strong>${d.file}</strong><br>
        ${d.author ?? '—'}<br>
        ${d.dt.toLocaleString()}<br>
        lines: ${fmt(d.lines)}
      `);
    positionTip(evt);
  }
  function hideTip() { tip.attr('hidden', true); }
  function positionTip(evt) {
    const { clientX:x, clientY:y } = evt;
    tip.style('left', `${x + 12}px`).style('top', `${y + 12}px`);
  }

  // Step 4.3: Voronoi hover – better hit-testing for overlapping dots  :contentReference[oaicite:8]{index=8}
  const delaunay = d3.Delaunay.from(rows, d => x(d.hour), d => y(d.dow));
  const vor = delaunay.voronoi([0,0,iw,ih]);

  const hover = g.append('g').attr('class', 'hover')
    .selectAll('path').data(rows).join('path')
    .attr('d', (_, i) => vor.renderCell(i))
    .attr('fill', 'transparent')
    .on('mousemove', function(evt, d) {
      showTip(d, evt);
    })
    .on('mouseleave', hideTip);

  // ---------- Step 5: Brushing ----------
  const brush = d3.brush()
    .extent([[0,0],[iw,ih]])
    .on('start brush end', brushed);

  const brushG = g.append('g').attr('class', 'brush').call(brush);

  function brushed({selection}) {
    const selCount = $('#sel-count');
    const langBreak = $('#lang-breakdown');

    let sel = [];
    if (selection) {
      const [[x0,y0],[x1,y1]] = selection;
      sel = rows.filter(d => {
        const px = x(d.hour), py = y(d.dow);
        return x0 <= px && px <= x1 && y0 <= py && py <= y1;
      });
    }

    // Update visuals
    dots.attr('fill', d => sel.length && !sel.includes(d) ? 'var(--accent-weak)' : 'var(--ucsd-navy)')
        .attr('opacity', d => sel.length && !sel.includes(d) ? 0.35 : 0.85);

    // 5.5: show count  :contentReference[oaicite:9]{index=9}
    selCount.textContent = `Selected: ${fmt(sel.length)}`;

    // 5.6: language breakdown  :contentReference[oaicite:10]{index=10}
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
