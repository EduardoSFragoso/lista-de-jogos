/* Passos dos últimos runs de main, para achar a etapa que quebrou. */
const runs = await (
  await fetch(
    'https://api.github.com/repos/EduardoSFragoso/lista-de-jogos/actions/runs?per_page=30'
  )
).json();
const mains = (runs.workflow_runs || [])
  .filter((r) => r.head_branch === 'main' && r.conclusion === 'failure')
  .slice(0, 2);
for (const run of mains) {
  console.log('RUN', run.id, run.head_sha.slice(0, 7));
  const jobs = await (
    await fetch(
      `https://api.github.com/repos/EduardoSFragoso/lista-de-jogos/actions/runs/${run.id}/jobs`
    )
  ).json();
  for (const job of jobs.jobs || []) {
    console.log(' JOB', job.name, '->', job.conclusion);
    for (const s of job.steps || []) console.log('   -', s.name, '->', s.conclusion);
  }
}
