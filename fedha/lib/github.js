// Fetch public repositories for a GitHub username (no auth — public API).
// Accepts a raw username or a full GitHub URL and extracts the username.
export function parseGithubUser(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/github\.com\/([^/\s?#]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, '');
}

export async function fetchRepos(username) {
  const user = parseGithubUser(username);
  if (!user) throw new Error('Enter a GitHub username');
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`);
  if (res.status === 404) throw new Error(`GitHub user "${user}" not found`);
  if (res.status === 403) throw new Error('GitHub rate limit reached — try again in a bit');
  if (!res.ok) throw new Error('Could not load repos from GitHub');
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    html_url: r.html_url,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    updated_at: r.updated_at,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
  }));
}

export const REPO_SORTS = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'stars', label: 'Most stars' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'created', label: 'Newest' },
];

export function sortRepos(repos, sortId) {
  const list = [...repos];
  switch (sortId) {
    case 'stars': return list.sort((a, b) => b.stars - a.stars);
    case 'name': return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'created': return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    case 'updated':
    default: return list.sort((a, b) => new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at));
  }
}
