// index.js
import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

// Step 2: latest 3 projects
const all = await fetchJSON('./lib/projects.json');
const latest = Array.isArray(all) ? all.slice(0, 3) : [];
const homeProjects = document.querySelector('.projects');
if (homeProjects) {
  renderProjects(latest, homeProjects, 'h3');
}

// Step 3–5: GitHub stats
const profileStats = document.querySelector('#profile-stats');
if (profileStats) {
  const username = 'jol145099';
  const githubData = await fetchGitHubData(username);

  if (githubData && !githubData.message) {
    profileStats.innerHTML = `
      <h3>@${username}</h3>
      <dl>
        <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
        <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers:</dt><dd>${githubData.followers}</dd>
        <dt>Following:</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  } else {
    profileStats.innerHTML = `<p>Unable to load GitHub stats right now.</p>`;
  }
}
