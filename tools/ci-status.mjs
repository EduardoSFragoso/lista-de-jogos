/* Passos dos últimos runs de main, para achar a etapa que quebrou.
   Mostra os 3 runs mais recentes (qualquer conclusão) + os 2 últimos failures. */
const API = 'https://api.github.com/repos/EduardoSFragoso/lista-de-jogos/actions';

const runs =
  (await (await fetch(`${API}/runs?branch=main&per_page=10`)).json()).workflow_runs || [];

const show = async (run, label) => {
  console.log(label, 'RUN', run.id, run.head_sha.slice(0, 7), `${run.status}/${run.conclusion}`);
  const jobs = await (await fetch(`${API}/runs/${run.id}/jobs`)).json();
  for (const job of jobs.jobs || []) {
    console.log(' JOB', job.name, '->', job.conclusion);
    for (const s of job.steps || []) console.log('   -', s.name, '->', s.conclusion);
  }
};

for (const run of runs.filter((r) => r.path.startsWith('.github/workflows/')).slice(0, 3))
  await show(run, 'recente');
console.log('--- failures recentes ---');
for (const run of runs.filter((r) => r.conclusion === 'failure').slice(0, 2))
  await show(run, 'falha  ');
