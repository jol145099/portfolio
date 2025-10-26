// projects/projects.js
import { fetchJSON, renderProjects } from '../global.js';

// Step 1.3: fetch and render all projects
const projects = await fetchJSON('../lib/projects.json');

const container = document.querySelector('.projects');
renderProjects(projects, container, 'h2');

// Step 1.6: count projects in the page title
const titleEl = document.querySelector('.projects-title');
if (titleEl) {
  const count = Array.isArray(projects) ? projects.length : 0;
  titleEl.textContent = `Projects (${count})`;
}
