// meta.js – Lab 8 with:
//  • Summary cards
//  • Lines-of-code-as-dots + slider
//  • Slider also filters "Commits by time of day"
//  • Legend for language colors

const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(",")(n);
const day = d3.timeDay;

// Color scale reused for dots + legend
const langColor = d3
  .scaleOrdinal()
  .domain(["html", "css", "js", "ts", "svelte", "json", "other"])
  .range([
    "#f97316", // html
    "#22c55e", // css
    "#0ea5e9", // js
    "#6366f1", // ts
    "#e11d48", // svelte
    "#14b8a6", // json
    "#6b7280", // other / fallback
  ]);

// -------------------------------------------------------------
// Load and normalize CSV
// -------------------------------------------------------------
async function loadRows() {
  let rows = [];
  try {
    rows = await d3.csv("./loc.csv", d3.autoType);
  } catch (e) {
    console.warn("Could not load meta/loc.csv:", e);
  }

  if (!rows || !rows.length) {
    const now = new Date();
    rows = [
      {
        file: "demo/index.html",
        type: "html",
        author: "you",
        datetime: now.toISOString(),
        line: 30,
        depth: 2,
        length: 120,
      },
      {
        file: "demo/style.css",
        type: "css",
        author: "you",
        datetime: new Date(now - 5e7).toISOString(),
        line: 80,
        depth: 1,
        length: 200,
      },
      {
        file: "demo/global.js",
        type: "js",
        author: "you",
        datetime: new Date(now - 9e7).toISOString(),
        line: 60,
        depth: 3,
        length: 160,
      },
    ];
    $("#stats")?.insertAdjacentHTML(
      "beforeend",
      `<p class="notice">Showing demo data because <code>meta/loc.csv</code> was not found.
       Generate it with: <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code>.</p>`
    );
  }

  rows = rows.filter((r) => r.file && (r.datetime || (r.date && r.time)));

  for (const r of rows) {
    const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ""}`;
    r.dt = new Date(iso);
    if (isNaN(+r.dt)) continue;

    r.day = day.floor(r.dt);
    r.hour = r.dt.getHours();
    r.dow = r.dt.getDay();

    // elocuent columns
    r.lineNo = +r.line || 0; // line number
    r.depthVal = +r.depth || 0; // indentation depth
    r.lenChars = +r.length || 0; // characters in line

    r.lang = (r.type || "other").toLowerCase();
  }

  return rows.filter((r) => r.dt instanceof Date && !isNaN(+r.dt));
}

// -------------------------------------------------------------
// Summary cards at top
// -------------------------------------------------------------
function renderStats(rows) {
  const stats = $("#stats");
  const extras = $("#extras");
  const grouped = $("#grouped");
  const minmax = $("#minmax");

  if (!rows.length) return;

  const totalRows = rows.length;

  // Per-file max line number gives LOC
  const fileLineMax = d3
    .rollups(
      rows,
      (v) => d3.max(v, (d) => d.lineNo),
      (d) => d.file
    )
    .map(([file, loc]) => ({ file, loc }));

  const totalLoc = d3.sum(fileLineMax, (d) => d.loc);
  const distinctFiles = fileLineMax.length;
  const distinctAuthors = new Set(rows.map((d) => d.author)).size;

  stats.innerHTML = `
    <div class="card"><strong>Total Rows</strong><em>${fmt(
      totalRows
    )}</em></div>
    <div class="card"><strong>Total Lines</strong><em>${fmt(
      totalLoc
    )}</em></div>
    <div class="card"><strong>Total Files</strong><em>${fmt(
      distinctFiles
    )}</em></div>
    <div class="card"><strong># of Authors</strong><em>${fmt(
      distinctAuthors
    )}</em></div>
  `;

  // Extras: days worked, peak hour, peak weekday
  const distinctDays = new Set(rows.map((d) => d.dt.toDateString())).size;

  const byHour = d3
    .rollups(
      rows,
      (v) => v.length,
      (d) => d.hour
    )
    .map(([hour, count]) => ({ hour, count }));
  const peakHour = d3.greatest(byHour, (d) => d.count);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDow = d3
    .rollups(
      rows,
      (v) => v.length,
      (d) => d.dow
    )
    .map(([dow, count]) => ({ dow, count }));
  const peakDow = d3.greatest(byDow, (d) => d.count);

  extras.innerHTML = `
    <div class="card"><strong>Days Worked</strong><em>${fmt(
      distinctDays
    )}</em></div>
    <div class="card">
      <strong>Peak Hour</strong>
      <em>${
        peakHour
          ? new Date(1970, 0, 1, peakHour.hour).toLocaleTimeString("en", {
              hour: "numeric",
            })
          : "—"
      }</em>
    </div>
    <div class="card">
      <strong>Peak Weekday</strong>
      <em>${peakDow ? dayNames[peakDow.dow] : "—"}</em>
    </div>
  `;

  // By language/type
  const byLang = d3
    .rollups(
      rows,
      (v) => ({
        rows: v.length,
        loc: d3.sum(
          d3.rollups(
            v,
            (vv) => d3.max(vv, (d) => d.lineNo),
            (d) => d.file
          ),
          (d) => d[1]
        ),
      }),
      (d) => d.lang
    )
    .map(([lang, agg]) => ({ lang, ...agg }))
    .sort((a, b) => d3.descending(a.loc, b.loc));

  grouped.innerHTML = byLang
    .map(
      (d) => `
    <div class="card mini">
      <strong>${d.lang}</strong>
      <em>${fmt(d.rows)} rows</em>
      <em>${fmt(d.loc)} lines</em>
    </div>
  `
    )
    .join("");

  // Min / max file LOC
  const minFile = d3.least(fileLineMax, (d) => d.loc);
  const maxFile = d3.greatest(fileLineMax, (d) => d.loc);

  minmax.innerHTML = `
    <div class="card">
      <strong>Min Lines (File)</strong>
      <em>${minFile?.file ?? "—"}</em>
      <em>${fmt(minFile?.loc ?? 0)} lines</em>
    </div>
    <div class="card">
      <strong>Max Lines (File)</strong>
      <em>${maxFile?.file ?? "—"}</em>
      <em>${fmt(maxFile?.loc ?? 0)} lines</em>
    </div>
  `;
}

// -------------------------------------------------------------
// Lab 8: files-as-dots + slider + summary + legend
// -------------------------------------------------------------

function buildCommits(rows) {
  // Use commit/hash if present; otherwise group by datetime string
  return d3
    .groups(
      rows,
      (d) => d.commit || d.hash || d.datetime || d.dt.toISOString()
    )
    .map(([id, lines]) => ({
      id,
      dt: d3.max(lines, (d) => d.dt),
      lines,
    }))
    .sort((a, b) => d3.ascending(a.dt, b.dt));
}

function renderLegend(allRows) {
  const legendEl = $("#files-legend");
  if (!legendEl) return;

  const langs = Array.from(new Set(allRows.map((d) => d.lang))).sort();
  legendEl.innerHTML = langs
    .map(
      (lang) => `
    <span class="legend-item">
      <span class="legend-swatch" style="background:${langColor(lang)}"></span>
      ${lang}
    </span>`
    )
    .join("");
}

function updateFileDots(activeRows) {
  const container = $("#files-viz");
  if (!container) return;
  container.innerHTML = "";

  if (!activeRows.length) {
    container.textContent = "No commits in this range yet.";
    return;
  }

  // Aggregate by file
  const aggregated = d3
    .rollups(
      activeRows,
      (v) => ({
        loc: d3.max(v, (d) => d.lineNo),
        lang: v[0]?.lang || "other",
      }),
      (d) => d.file
    )
    .map(([file, agg]) => ({ file, ...agg }))
    .sort((a, b) => d3.descending(a.loc, b.loc));

  aggregated.forEach((f) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.style.setProperty("--dot-color", langColor(f.lang));

    const meta = document.createElement("div");
    meta.className = "file-row-meta";
    meta.innerHTML = `
      <strong>${f.file}</strong>
      <small>${fmt(f.loc)} lines</small>
    `;
    row.appendChild(meta);

    const dotsWrap = document.createElement("div");
    dotsWrap.className = "file-row-dots";

    // each dot ≈ 100 LOC, at least 1 if any lines
    const dotsCount = Math.max(1, Math.round(f.loc / 100));
    for (let i = 0; i < dotsCount; i++) {
      const dot = document.createElement("span");
      dot.className = "loc-dot";
      dotsWrap.appendChild(dot);
    }

    row.appendChild(dotsWrap);
    container.appendChild(row);
  });
}

function updateFileSummary(activeRows, activeCommits) {
  const box = $("#files-summary");
  if (!box) return;

  if (!activeRows.length) {
    box.innerHTML = "<p>No activity in this range yet.</p>";
    return;
  }

  const commitsCount = activeCommits.length;

  // per-file max line number for LOC stats
  const perFile = d3
    .rollups(
      activeRows,
      (v) => d3.max(v, (d) => d.lineNo),
      (d) => d.file
    )
    .map(([file, loc]) => ({ file, loc }));

  const fileCount = perFile.length;
  const totalLoc = d3.sum(perFile, (d) => d.loc);

  const maxDepth = d3.max(activeRows, (d) => d.depthVal) ?? 0;
  const longestLine = d3.max(activeRows, (d) => d.lenChars) ?? 0;
  const maxLines = d3.max(perFile, (d) => d.loc) ?? 0;

  box.innerHTML = `
    <div class="summary-card">
      <span class="label">COMMITS</span>
      <span class="value">${fmt(commitsCount)}</span>
    </div>
    <div class="summary-card">
      <span class="label">FILES</span>
      <span class="value">${fmt(fileCount)}</span>
    </div>
    <div class="summary-card">
      <span class="label">TOTAL LOC</span>
      <span class="value">${fmt(totalLoc)}</span>
    </div>
    <div class="summary-card">
      <span class="label">MAX DEPTH</span>
      <span class="value">${fmt(maxDepth)}</span>
    </div>
    <div class="summary-card">
      <span class="label">LONGEST LINE</span>
      <span class="value">${fmt(longestLine)}</span>
    </div>
    <div class="summary-card">
      <span class="label">MAX LINES</span>
      <span class="value">${fmt(maxLines)}</span>
    </div>
  `;
}

function initFileTimeline(allRows) {
  const slider = $("#commit-progress");
  const timeLabel = $("#commit-progress-time");
  if (!slider || !timeLabel || !allRows.length) {
    // fallback: render full scatter if slider missing
    renderScatter(allRows);
    return;
  }

  const commits = buildCommits(allRows);
  if (!commits.length) {
    renderScatter(allRows);
    return;
  }

  const timeExtent = d3.extent(commits, (c) => c.dt);
  const sliderScale = d3
    .scaleTime()
    .domain(timeExtent)
    .range([0, 100]);

  slider.min = 0;
  slider.max = 100;
  slider.value = 100;

  // legend does not depend on slider
  renderLegend(allRows);

  function onChange() {
    const pct = Number(slider.value);
    const cutoff = sliderScale.invert(pct);

    timeLabel.textContent = cutoff.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const activeCommits = commits.filter((c) => c.dt <= cutoff);
    const activeRows = activeCommits.flatMap((c) => c.lines);

    // update files view + summary + scatter
    updateFileDots(activeRows);
    updateFileSummary(activeRows, activeCommits);
    renderScatter(activeRows);
  }

  slider.addEventListener("input", onChange);
  onChange(); // initial state => also draws scatter
}

// -------------------------------------------------------------
// Scatterplot (same look; filtered by slider subset)
// -------------------------------------------------------------
function renderScatter(rows) {
  const svg = d3.select("#scatter");
  svg.selectAll("*").remove();
  if (!rows.length) return;

  const W = 960,
    H = 480,
    M = { t: 22, r: 24, b: 60, l: 60 };
  const iw = W - M.l - M.r,
    ih = H - M.t - M.b;

  const g = svg
    .attr("viewBox", `0 0 ${W} ${H}`)
    .append("g")
    .attr("transform", `translate(${M.l},${M.t})`);

  const uniqueDays = Array.from(new Set(rows.map((d) => +d.day)))
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));

  const x = d3
    .scalePoint()
    .domain(uniqueDays)
    .range([0, iw])
    .padding(0.5);
  const y = d3.scaleLinear().domain([0, 23]).range([ih, 0]).nice();

  const rArea = d3
    .scaleSqrt()
    .domain([
      0,
      d3.quantile(
        rows.map((d) => d.lenChars || 1).sort(d3.ascending),
        0.95
      ) || 1,
    ])
    .range([2, 16]);

  const xAxis = d3
    .axisBottom(x)
    .tickValues(uniqueDays)
    .tickFormat(d3.timeFormat("%m/%d"));
  const yAxis = d3
    .axisLeft(y)
    .ticks(8)
    .tickFormat((h) => {
      const ampm = h >= 12 ? "PM" : "AM";
      const hour = h % 12 === 0 ? 12 : h % 12;
      return `${hour}${ampm}`;
    });

  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${ih})`)
    .call(xAxis);

  g.append("g").attr("class", "y-axis").call(yAxis);

  g.append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(y.ticks(8))
    .join("line")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  const dots = g
    .append("g")
    .attr("class", "dots")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", (d) => x(d.day))
    .attr("cy", (d) => y(d.hour))
    .attr("r", (d) => rArea(d.lenChars || 1))
    .attr("fill", "var(--ucsd-navy)")
    .attr("opacity", 0.95);

  const tip = d3.select("#tooltip");
  const fmtDate = d3.timeFormat("%b %d, %Y %H:%M");
  function showTip(d, evt) {
    tip
      .attr("hidden", null)
      .html(
        `<strong>${d.file}</strong><br>${d.author ?? "—"}<br>${fmtDate(
          d.dt
        )}<br>Line: ${fmt(d.lineNo)}&nbsp;&bull;&nbsp;Depth: ${
          d.depthVal
        }&nbsp;&bull;&nbsp;Len: ${fmt(d.lenChars)}`
      );
    tip
      .style("left", `${evt.clientX + 12}px`)
      .style("top", `${evt.clientY + 12}px`);
  }
  const hideTip = () => tip.attr("hidden", true);

  const delaunay = d3.Delaunay.from(
    rows,
    (d) => x(d.day),
    (d) => y(d.hour)
  );
  const vor = delaunay.voronoi([0, 0, iw, ih]);
  g.append("g")
    .selectAll("path")
    .data(rows)
    .join("path")
    .attr("d", (_, i) => vor.renderCell(i))
    .attr("fill", "transparent")
    .on("mousemove", (evt, d) => showTip(d, evt))
    .on("mouseleave", hideTip);

  const HILITE = "var(--ucsd-gold)";
  const brush = d3
    .brush()
    .extent([
      [0, 0],
      [iw, ih],
    ])
    .on("start brush end", brushed);
  g.append("g").attr("class", "brush").call(brush);

  function brushed({ selection }) {
    const selCount = $("#sel-count");
    const langBreak = $("#lang-breakdown");

    let sel = [];
    if (selection) {
      const [
        [x0, y0],
        [x1, y1],
      ] = selection;
      sel = rows.filter((d) => {
        const px = x(d.day);
        const py = y(d.hour);
        return x0 <= px && px <= x1 && y0 <= py && py <= y1;
      });
    }

    dots
      .attr("fill", (d) =>
        sel.length && sel.includes(d) ? HILITE : "var(--ucsd-navy)"
      )
      .attr("opacity", (d) =>
        sel.length && !sel.includes(d) ? 0.35 : 0.95
      );

    selCount.textContent = `Selected: ${fmt(sel.length)}`;
    if (!sel.length) {
      langBreak.textContent = "Languages Used: —";
    } else {
      const by = d3
        .rollups(sel, (v) => v.length, (d) => d.lang)
        .map(([k, v]) => `${k}:${v}`)
        .sort();
      langBreak.textContent = `Languages Used: ${by.join(", ")}`;
    }
  }
}

// -------------------------------------------------------------
// Bootstrap
// -------------------------------------------------------------
(async () => {
  const rows = await loadRows();
  renderStats(rows);
  initFileTimeline(rows); // slider will call renderScatter internally
})();
