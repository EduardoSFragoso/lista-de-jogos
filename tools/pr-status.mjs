/* Lista PRs abertos + status de checks e aprovações. */
const API = 'https://api.github.com/repos/EduardoSFragoso/lista-de-jogos';

const prs = (await (await fetch(`${API}/pulls?state=open&per_page=30`)).json()).filter(
  (p) => p.user.login === 'dependabot[bot]'
);
console.log(`PRs abertos do dependabot: ${prs.length}\n`);

for (const pr of prs) {
  const sha = pr.head.sha;
  const [checks, review] = await Promise.all([
    fetch(`${API}/commits/${sha}/check-runs`).then((r) => r.json()),
    fetch(`${API}/pulls/${pr.number}/reviews?per_page=5`).then((r) => r.json()),
  ]);
  const names = (checks.check_runs || [])
    .filter((c) => c.conclusion !== 'neutral' && c.conclusion !== 'skipped')
    .map((c) => `${c.name}=${c.conclusion || c.status}`)
    .join(', ');
  const states = (review || []).map((r) => r.state).join(',') || 'sem review';
  console.log(`#${pr.number} ${pr.title}`);
  console.log(`   branch: ${pr.head.ref} | checks: ${names || 'nenhum'} | reviews: ${states}`);
}
