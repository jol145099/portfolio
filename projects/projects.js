import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const container = document.querySelector('.projects');
renderProjects(projects, container, 'h2');

const titleEl = document.querySelector('.projects-title');
if (titleEl) {
  const count = Array.isArray(projects) ? projects.length : 0;
  titleEl.textContent = `Projects (${count})`;
}
