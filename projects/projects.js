import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
renderProjects(projects, document.querySelector('.projects'), 'h2');

const title = document.querySelector('.projects-title');
if (title) title.textContent = `Projects (${Array.isArray(projects) ? projects.length : 0})`;

