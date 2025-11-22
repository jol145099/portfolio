// Robust meta page: works with datetime OR date+time; shows demo if CSV missing.
// Scatter = x: date-only (ticks only where data exists), y: hour, brush with UCSD Gold highlight.
// Lab 8 extension: time slider + "lines of code as dots" per file.

const $ = (s) => document.querySelector(s);
const fmt = (n) => d3.format(",")(n);
const day = d3.timeDay;

// -------- Load CSV (safe) --------
async function loadRows() {
  let rows = [];
  try {
    rows = await d3.csv("./loc.csv", d3.autoType); // relative to /meta/
  } catch (e) {
    console.warn("Could not load meta/loc.csv:", e);
  }
  if (!rows || !rows.length) {
    // tiny demo so the page never looks empty
    const now = new Date();
    rows = [
      {
        file: "demo/a.js",
        type: "js",
        author: "you",
        datetime: now.toISOString(),
        length: 140,
        line: 1,
      },
      {
        file: "demo/b.css",
        type: "css",
        author: "you",
        datetime: new Date(now - 6e7).toISOString(),
        length: 260,
        line: 1,
      },
      {
        file: "demo/c.html",
        type: "html",
        author: "you",
        datetime: new Date(now - 9e7).toISOString(),
        length: 70,
        line: 1,
      },
    ];
    $("#stats")?.insertAdjacentHTML(
      "beforeend",
      `<p class="notice">Showing demo data because <code>meta/loc.csv</code> was not found.
       Generate it with: <code>npx elocuent -d . -o meta/loc.csv --spaces 2</code></p>`
    );
  }

  // normalize & derive fields
  rows = rows.filter((r) => r.file && (r.datetime || (r.date && r.time)));
  for (const r of rows) {
    const iso = r.datetime || `${r.date}T${r.time}${r.timezone ?? ""}`;
    r.dt = new Date(iso);
    if (isNaN(+r.dt)) continue;

    r.day = day.floor(r.dt); // date-only (for vertical alignment)
    r.hour = r.dt.getHours(); // 0..23
    r.dow = r.dt.getDay(); // 0..6

    // elocuent columns
    // line = 1-based line number in file
    r.lineNo = +r.line || 0;
    // length = characters in that line — we’ll keep using this for dot size
    r.lines = +r.length || 0;

    r.lang = (r.type || "other").toLowerCase();
  }
  return rows.filter((r) => r.dt instanceof Date && !isNaN(+r.dt));
}

// -------- Summary cards --------
function renderStats(rows) {
  const stats = $("#stats");
  const grouped = $("#grouped");
  const minmax = $("#minmax");
  const extras = $("#extras");

  if (!rows.length) return;

  // ----- Total rows -----
  const totalRows = rows.length;

  // ----- Total lines of code (LOC) -----
  // For each file, take the maximum line number, then sum those.
  const fileLocPairs = d3.rollups(
    rows,
    (v) => d3.max(v, (d) => d.lineNo || d.line || 0),
    (d) => d.file
  );
  const totalLines = d3.sum(fileLocPairs, (d) => d[1]);

  const distinctFiles = new Set(rows.map((d) => d.file)).size;
  const distinctAuthors = new Set(rows.map((d) => d.author)).size;

  stats.innerHTML = `
    <div class="card"><strong>Total Rows</strong><em>${fmt(
      totalRows
    )}</em></div>
    <div class="card"><strong>Total Lines</strong><em>${fmt(
      totalLines
    )}</em></div>
    <div class="card"><strong>Total Files</strong><em>${fmt(
      distinctFiles
    )}</em></div>
    <div class="card"><strong># of Authors</strong><em>${fmt(
      distinctAuthors
    )}</em></div>
  `;

  // ----- extra cards -----
  const distinctDays = new Set(rows.map((d) => d.dt.toDateString())).size;

  // per-file LOC for min/max, using same LOC definition as above
  const fileTotals = fileLocPairs.map(([file, loc]) => ({
    file,
    lines: loc,
  }));

  // Peak hour and weekday by number of LOC (counting one LOC per row)
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
    <div class="card"><strong>Peak Hour</strong>
      <em>${
        peakHour
          ? new Date(1970, 0, 1, peakHour.hour).toLocaleTimeString("en", {
              hour: "numeric",
            })
          : "—"
      }</em>
      <em>${fmt(peakHour?.count ?? 0)} rows</em>
    </div>
    <div class="card"><strong>Peak Weekday</strong>
      <em>${peakDow ? dayNames[peakDow.dow] : "—"}</em>
      <em>${fmt(peakDow?.count ?? 0)} rows</em>
    </div>
  `;

  // ----- by language/type (using LOC per file for “lines”) -----
  const byLang = d3
    .rollups(
      rows,
      (v) => ({
        rows: v.length,
        loc: d3.sum(
          d3.rollups(
            v,
            (vv) => d3.max(vv, (d) => d.lineNo || d.line || 0),
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

  // ----- min/max by file (again using LOC) -----
  const minFile = d3.least(fileTotals, (d) => d.lines);
  const maxFile = d3.greatest(fileTotals, (d) => d.lines);

  minmax.innerHTML = `
    <div class="card"><strong>Min Lines (File)</strong>
      <em>${minFile?.file ?? "—"}</em><em>${fmt(
    minFile?.lines ?? 0
  )} lines</em>
    </div>
    <div class="card"><strong>Max Lines (File)</strong>
      <em>${maxFile?.file ?? "—"}</em><em>${fmt(
    maxFile?.lines ?? 0
  )} lines</em>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Lab 8 — slider + "lines of code as dots" per file
// ---------------------------------------------------------------------

function initFileTimeline(rows) {
  const vizEl = document.querySelector("#files-viz");
  const slider = document.querySelector("#commit-progress");
  const timeLabel = document.querySelector("#commit-progress-time");
  if (!vizEl || !slider || !timeLabel || !rows.length) return;

  // Group rows by commit (if available) so progress follows commit history.
  // If there is no commit column, fall back to one pseudo-commit per row.
  const commits = d3
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

  if (!commits.length) return;

  const timeExtent = d3.extent(commits, (d) => d.dt);
  const timeScale = d3
    .scaleTime()
    .domain(timeExtent)
    .range([0, 100]);

  slider.min = 0;
  slider.max = 100;
  slider.value = 100;

  function updateFromSlider() {
    const pct = Number(slider.value);
    const cutoff = timeScale.invert(pct);

    timeLabel.textContent = cutoff.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const activeCommits = commits.filter((c) => c.dt <= cutoff);
    const activeRows = activeCommits.flatMap((c) => c.lines);
    renderFileDots(activeRows);
  }

  slider.addEventListener("input", updateFromSlider);
  updateFromSlider(); // initial state
}

function renderFileDots(rows) {
  const container = document.querySelector("#files-viz");
  if (!container) return;

  container.innerHTML = "";

  if (!rows.length) {
    container.textContent = "No commits in this range yet.";
    return;
  }

  const fmtInt = d3.format(",");

  const colorScale = d3
    .scaleOrdinal()
    .domain(["html", "js", "css", "svelte", "ts", "json", "other"])
    .range([
      "#f97316", // html-ish
      "#0ea5e9", // js
      "#22c55e", // css
      "#e11d48", // svelte
      "#6366f1", // ts
      "#14b8a6", // json
      "#6b7280", // other
    ]);

  // Aggregate LOC by file for the currently visible rows.
  const aggregated = d3
    .rollups(
      rows,
      (v) => ({
        loc: d3.max(v, (d) => d.lineNo || d.line || 0),
        lang: v[0]?.lang || "other",
      }),
      (d) => d.file
    )
    .map(([file, agg]) => ({ file, ...agg }))
    .sort((a, b) => d3.descending(a.loc, b.loc));

  aggregated.forEach((f) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.style.setProperty("--dot-color", colorScale(f.lang));

    const meta = document.createElement("div");
    meta.className = "file-row-meta";
    meta.innerHTML = `<strong>${f.file}</strong><small>${fmtInt(
      f.loc
    )} lines</small>`;
    row.appendChild(meta);

    const dotsWrap = document.createElement("div");
    dotsWrap.className = "file-row-dots";

    // Each dot ~100 lines, at least 1 dot if file has any lines.
    const dotsCount = Math.max(1, Math.round(f.loc / 10));
    for (let i = 0; i < dotsCount; i++) {
      const dot = document.createElement("span");
      dot.className = "loc-dot";
      dotsWrap.appendChild(dot);
    }

    row.appendChild(dotsWrap);
    container.appendChild(row);
  });
}

// -------- Scatter (date-only x; ticks only where data exists; UCSD Gold highlight) --------
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
        rows.map((d) => d.lines).sort(d3.ascending),
        0.95
      ) || 1,
    ])
    .range([1.8, 9]);

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
    .attr("r", (d) => rArea(d.lines))
    .attr("fill", "var(--ucsd-navy)")
    .attr("opacity", 0.95);

  const tip = d3.select("#tooltip");
  const fmtDate = d3.timeFormat("%b %d, %Y %H:%M");
  function showTip(d, evt) {
    tip
      .attr("hidden", null)
      .html(
        `
      <strong>${d.file}</strong><br>
      ${d.author ?? "—"}<br>
      ${fmtDate(d.dt)}<br>
      line: ${fmt(d.lineNo || d.line || 0)}<br>
      chars: ${fmt(d.lines)}
    `
      );
    const { clientX: xv, clientY: yv } = evt;
    tip.style("left", `${xv + 12}px`).style("top", `${yv + 12}px`);
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

// -------- Boot --------
(async () => {
  const rows = await loadRows();
  renderStats(rows);
  initFileTimeline(rows); // Lab 8 section
  renderScatter(rows);
})();
