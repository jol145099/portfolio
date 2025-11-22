import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// ---------- Load and preprocess data ----------

async function loadData() {
  const rows = await d3.csv("./loc.csv", (d) => {
    const datetime = new Date(d.datetime);
    return {
      ...d,
      line: +d.line,
      depth: +d.depth,
      length: +d.length,
      datetime,
    };
  });
  return rows;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      const ret = {
        id: commit,
        url: first.url || "",
        author,
        date,
        time,
        timezone,
        datetime,
        // hour as decimal for scatterplot
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        // how many lines in this commit
        totalLines: lines.length,
      };

      // keep original line data, but hide it from console.log
      Object.defineProperty(ret, "lines", {
        value: lines,
        enumerable: false,
      });

      return ret;
    })
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

// ---------- Summary statistics ----------

function renderCommitInfo(data, commits) {
  const dl = d3.select("#stats").append("dl").attr("class", "stats");

  const fmtInt = d3.format(",");

  // 1) total rows
  dl.append("dt").text("Total rows");
  dl.append("dd").text(fmtInt(data.length));

  // 2) total lines of code (max line per file, summed)
  const totalLines = d3.sum(
    d3.rollups(
      data,
      (v) => d3.max(v, (d) => d.line),
      (d) => d.file
    ),
    (d) => d[1]
  );
  dl.append("dt").text("Total lines");
  dl.append("dd").text(fmtInt(totalLines));

  // 3) number of files
  const numFiles = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.file
  ).length;
  dl.append("dt").text("Total files");
  dl.append("dd").text(fmtInt(numFiles));

  // 4) number of authors
  const numAuthors = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.author
  ).length;
  dl.append("dt").text("# of Authors");
  dl.append("dd").text(fmtInt(numAuthors));

  // 5) days worked
  const daysWorked = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleDateString("en")
  ).length;
  dl.append("dt").text("Days Worked");
  dl.append("dd").text(daysWorked);

  // 6) peak hour
  const workByHour = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).getHours()
  );
  const peakHour = d3.greatest(workByHour, (d) => d[1])?.[0];
  dl.append("dt").text("Peak Hour");
  dl.append("dd").text(
    peakHour != null
      ? new Date(1970, 0, 1, peakHour).toLocaleTimeString("en", {
          hour: "numeric",
        })
      : "—"
  );

  // 7) peak weekday
  const workByWeekday = d3.rollups(
    data,
    (v) => v.length,
    (d) =>
      new Date(d.datetime).toLocaleDateString("en", {
        weekday: "short",
      })
  );
  const peakWeekday = d3.greatest(workByWeekday, (d) => d[1])?.[0];
  dl.append("dt").text("Peak Weekday");
  dl.append("dd").text(peakWeekday ?? "—");

  // 8) lines per language (type)
  const langGroups = d3
    .rollups(
      data,
      (v) => v.length,
      (d) => d.type
    )
    .sort((a, b) => d3.descending(a[1], b[1]));

  for (const [lang, count] of langGroups) {
    dl.append("dt").text(lang);
    dl.append("dd").text(fmtInt(count) + " lines");
  }

  // 9) min & max file length
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file
  );

  const minFile = d3.least(fileLengths, (d) => d[1]);
  const maxFile = d3.greatest(fileLengths, (d) => d[1]);

  if (minFile) {
    dl.append("dt").text("Min Lines (File)");
    dl.append("dd").html(
      `${minFile[0]}<br><small>${fmtInt(minFile[1])} lines</small>`
    );
  }

  if (maxFile) {
    dl.append("dt").text("Max Lines (File)");
    dl.append("dd").html(
      `${maxFile[0]}<br><small>${fmtInt(maxFile[1])} lines</small>`
    );
  }
}

// ---------- Scatter plot: commits over time ----------

let xScale;
let yScale;

function renderScatterPlot(data, commits) {
  const width = 900;
  const height = 450;
  const margin = { top: 10, right: 20, bottom: 40, left: 40 };

  const usable = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usable.left, usable.right])
    .nice();

  yScale = d3.scaleLinear().domain([0, 24]).range([usable.bottom, usable.top]);

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) =>
      new Date(1970, 0, 1, d).toLocaleTimeString("en", { hour: "numeric" })
    );

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${usable.bottom})`)
    .call(xAxis);

  svg
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${usable.left}, 0)`)
    .call(yAxis);

  svg.append("g").attr("class", "dots");

  updateScatterPlot(commits);
}

function updateScatterPlot(commits) {
  const svg = d3.select("#chart").select("svg");
  if (svg.empty()) return;

  const rScale = d3
    .scaleSqrt()
    .domain(d3.extent(commits, (d) => d.totalLines))
    .range([3, 20]);

  const dotsGroup = svg.select("g.dots");

  const sorted = d3.sort(commits, (d) => -d.totalLines);

  dotsGroup
    .selectAll("circle")
    .data(sorted, (d) => d.id)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines || 1))
    .attr("class", "commit-dot")
    .style("fill-opacity", 0.8);
}

// ---------- Slider filtering (single slider like 2.4) ----------

let timeScale;
let allCommits = [];

const colors = d3.scaleOrdinal(d3.schemeTableau10);

function setupFiltering(commits) {
  allCommits = commits;

  timeScale = d3
    .scaleTime()
    .domain([
      d3.min(commits, (d) => d.datetime),
      d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);

  const slider = document.querySelector("#commit-progress");
  const timeEl = document.querySelector("#commit-time");

  function onTimeSliderChange() {
    const progress = Number(slider.value);
    const cutoff = timeScale.invert(progress);

    timeEl.textContent = cutoff.toLocaleString("en", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const filtered = allCommits.filter((d) => d.datetime <= cutoff);

    updateScatterPlot(filtered);
    updateFileDisplay(filtered);
  }

  slider.addEventListener("input", onTimeSliderChange);
  onTimeSliderChange(); // initial render
}

// ---------- Lines of code as dots (Step 2.4 style) ----------

function updateFileDisplay(commits) {
  const lines = commits.flatMap((d) => d.lines);
  const container = d3.select("#files");

  if (!lines.length) {
    container.selectAll("*").remove();
    return;
  }

  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({
      name,
      lines,
      type: lines[0].type,
    }))
    .sort((a, b) => d3.descending(a.lines.length, b.lines.length));

  const fmtInt = d3.format(",");

  const cards = container
    .selectAll("div")
    .data(files, (d) => d.name)
    .join((enter) =>
      enter
        .append("div")
        .call((div) => {
          div.append("dt").append("code");
          div.append("dd");
        })
    )
    .attr("style", (d) => `--loc-color: ${colors(d.type)};`);

  // filename + length
  cards
    .select("dt code")
    .html(
      (d) =>
        `${d.name}<small>${fmtInt(d.lines.length)} lines</small>`
    );

  // dots
  cards
    .select("dd")
    .selectAll("div")
    .data((d) => d.lines)
    .join("div")
    .attr("class", "loc");
}

// ---------- Main ----------

async function main() {
  const data = await loadData();
  const commits = processCommits(data);

  renderCommitInfo(data, commits);
  renderScatterPlot(data, commits);
  setupFiltering(commits);
}

main().catch((err) => console.error(err));
