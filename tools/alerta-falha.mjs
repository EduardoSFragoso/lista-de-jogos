/* Alerta de falha de workflow via Issue automática no GitHub.

   Contexto: o sync-neon ficou vermelho de 2026-11-21 a 2026-11-25
   sem ninguém notar — o e-mail do GitHub só avisa quem criou o
   commit do evento e se perde no ruído. Este script roda como
   ÚLTIMO passo dos jobs sync-neon, backup-notas e monitor-health:
   com falha (`falhou`) cria/comenta numa Issue com a label
   `alerta-falha`; com sucesso (`passou`) comenta e fecha.

   Uso (no Actions, com o checkout do repo):
     node tools/alerta-falha.mjs falhou
     node tools/alerta-falha.mjs passou

   Env (o Actions fornece todas automaticamente, exceto o token):
     GITHUB_TOKEN          token do Actions (obrigatório)
     GITHUB_REPOSITORY     dono/repo
     GITHUB_WORKFLOW       nome do workflow
     GITHUB_EVENT_NAME     evento que disparou (push, schedule,
                           workflow_dispatch)
     GITHUB_REF_NAME       branch/ref
     GITHUB_SHA            SHA completo do commit
     GITHUB_RUN_ID         id do run (para o link)
     GITHUB_API_URL        base da API (padrão https://api.github.com)
     GITHUB_SERVER_URL     base do site (padrão https://github.com)
     ALERTA_SEM_COMENTARIO = '1' → em `falhou`, NÃO comenta numa Issue
                           já aberta (usado no monitor-health, que roda
                           a cada 30 min e encheria a Issue de ruído)

   Contratos (travados por test/alerta-falha.test.mjs e
   test/workflows.test.mjs):
   - título exato `[alerta] <nome do workflow> falhou` — uma Issue por
     workflow; a listagem da API de issues também devolve PRs, então
     itens com `pull_request` e itens sem a label são ignorados;
   - o corpo/comentário tem SÓ nome do workflow, evento, branch, SHA
     curto e link do run — nunca log, env ou o token; em erro de API a
     mensagem é sanitizada (nunca contém o token);
   - `issues: write` só no job dos três workflows (o topo segue
     `contents: read`); o passo `passou` tem continue-on-error: true
     (um erro ao fechar a Issue não pode deixar o run vermelho);
   - em evento de pull_request o alerta não roda (if nos passos). */

import { pathToFileURL } from 'node:url';

export const LABEL = 'alerta-falha';

/** Título exato da Issue de alerta de um workflow. */
export function tituloAlerta(workflow) {
  return `[alerta] ${workflow} falhou`;
}

/**
 * Filtra a listagem da API: sem `pull_request` (a API de issues
 * também devolve PRs), com a label `alerta-falha` e com o título
 * exato do workflow — casa com UMA Issue por workflow.
 */
export function filtroIssues(issues, workflow) {
  const titulo = tituloAlerta(workflow);
  return (issues ?? []).filter(
    (i) =>
      !i.pull_request &&
      Array.isArray(i.labels) &&
      i.labels.some((l) => (l.name ?? l) === LABEL) &&
      i.title === titulo
  );
}

/**
 * Corpo do alerta: SÓ o essencial (workflow, evento, branch, SHA
 * curto, link do run) — nada de logs, envs ou token.
 */
export function corpoAlerta(env) {
  const workflow = env.GITHUB_WORKFLOW ?? '(sem nome)';
  const evento = env.GITHUB_EVENT_NAME ?? '(sem evento)';
  const branch = env.GITHUB_REF_NAME ?? '(sem ref)';
  const sha = (env.GITHUB_SHA ?? '(sem sha)').slice(0, 7);
  const run = urlRun(env);
  return `Workflow: ${workflow}\nEvento: ${evento}\nBranch: ${branch}\nSHA: ${sha}\nRun: ${run}`;
}

function urlRun(env) {
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repo = env.GITHUB_REPOSITORY;
  return `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID ?? ''}`;
}

/* Nunca ecoar o token em mensagens de erro (split/join: sem regex,
   para não se importar com caracteres especiais no token). */
function sanitiza(texto, token) {
  return token ? texto.split(token).join('***') : texto;
}

/**
 * Uma chamada à API REST do GitHub, com token Bearer e JSON.
 * Em erro, a mensagem inclui status, caminho e a mensagem da API —
 * SEMPRE sanitizada (sem o token).
 */
async function api(fetcher, { metodo, caminho, corpo, token, baseUrl }) {
  const res = await fetcher(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(corpo ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!res.ok) {
    let detalhe = '';
    try {
      const j = await res.json();
      if (j?.message) detalhe = ` (${j.message})`;
    } catch {
      // corpo sem JSON: o status basta
    }
    throw new Error(sanitiza(`API do GitHub: HTTP ${res.status} em ${caminho}${detalhe}`, token));
  }
  try {
    return await res.json();
  } catch {
    return null; // 204 (sem corpo) e respostas vazias
  }
}

const caminhoIssues = (repo) =>
  `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`;

/** Busca (com o filtro rigoroso) a Issue aberta do workflow. */
async function buscaIssue(fetcher, { repo, workflow, token, baseUrl }) {
  const abertas = await api(fetcher, {
    metodo: 'GET',
    caminho: caminhoIssues(repo),
    token,
    baseUrl,
  });
  const achadas = filtroIssues(abertas, workflow);
  return achadas[0] ?? null;
}

/** Garante que a label existe (cria se a API disser 404). */
async function criaLabelSeFaltando(fetcher, { repo, token, baseUrl }) {
  try {
    await api(fetcher, {
      metodo: 'GET',
      caminho: `/repos/${repo}/labels/${LABEL}`,
      token,
      baseUrl,
    });
    return;
  } catch (e) {
    if (!/HTTP 404/.test(e.message)) throw e;
  }
  await api(fetcher, {
    metodo: 'POST',
    caminho: `/repos/${repo}/labels`,
    corpo: {
      name: LABEL,
      color: 'B60205',
      description: 'Falha de workflow (criada por tools/alerta-falha.mjs)',
    },
    token,
    baseUrl,
  });
}

/**
 * Modo `falhou`: sem Issue aberta → garante a label e cria a Issue;
 * com Issue aberta → comenta o link do novo run, SALVO
 * ALERTA_SEM_COMENTARIO=1 (monitor-health roda a cada 30 min).
 */
export async function falhou({ env, fetcher, baseUrl }) {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const workflow = env.GITHUB_WORKFLOW;
  const comun = {
    fetcher,
    token,
    baseUrl: baseUrl ?? env.GITHUB_API_URL ?? 'https://api.github.com',
  };
  const existente = await buscaIssue(fetcher, { repo, workflow, ...comun });
  if (existente) {
    if (env.ALERTA_SEM_COMENTARIO === '1') return { acao: 'silencio', issue: existente.html_url };
    await api(fetcher, {
      metodo: 'POST',
      caminho: `/repos/${repo}/issues/${existente.number}/comments`,
      corpo: { body: corpoAlerta(env) },
      ...comun,
    });
    return { acao: 'comentada', issue: existente.html_url };
  }
  await criaLabelSeFaltando(fetcher, { repo, ...comun });
  const criada = await api(fetcher, {
    metodo: 'POST',
    caminho: `/repos/${repo}/issues`,
    corpo: { title: tituloAlerta(workflow), body: corpoAlerta(env), labels: [LABEL] },
    ...comun,
  });
  return { acao: 'criada', issue: criada?.html_url };
}

/**
 * Modo `passou`: com Issue aberta do workflow → comenta "voltou a
 * passar (<run>)" e fecha; sem → não faz nada.
 */
export async function passou({ env, fetcher, baseUrl }) {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const workflow = env.GITHUB_WORKFLOW;
  const base = baseUrl ?? env.GITHUB_API_URL ?? 'https://api.github.com';
  const existente = await buscaIssue(fetcher, { repo, workflow, token, baseUrl: base });
  if (!existente) return { acao: 'nada' };
  await api(fetcher, {
    metodo: 'POST',
    caminho: `/repos/${repo}/issues/${existente.number}/comments`,
    corpo: { body: `voltou a passar (${urlRun(env)})` },
    fetcher,
    token,
    baseUrl: base,
  });
  await api(fetcher, {
    metodo: 'PATCH',
    caminho: `/repos/${repo}/issues/${existente.number}`,
    corpo: { state: 'closed' },
    fetcher,
    token,
    baseUrl: base,
  });
  return { acao: 'fechada', issue: existente.html_url };
}

/**
 * main: valida env/argv e despacha para `falhou`/`passou`.
 * Injetável para testes ({ argv, env, fetcher, baseUrl }).
 */
export async function main(opts = {}) {
  const env = opts.env ?? process.env;
  const argv = opts.argv ?? process.argv;
  const baseUrl = opts.baseUrl ?? env.GITHUB_API_URL ?? 'https://api.github.com';
  const fetcher = opts.fetcher ?? fetch;
  const modo = argv[2];
  if (modo !== 'falhou' && modo !== 'passou') {
    throw new Error("uso: node tools/alerta-falha.mjs 'falhou'|'passou'");
  }
  if (!env.GITHUB_TOKEN) throw new Error('sem GITHUB_TOKEN (env) — não sei falar com a API');
  if (!env.GITHUB_REPOSITORY) throw new Error('sem GITHUB_REPOSITORY (env)');
  const args = { env, fetcher, baseUrl };
  const r = modo === 'falhou' ? await falhou(args) : await passou(args);
  // Saída mínima e segura: ação + URL pública da Issue (nunca token/env)
  console.log(`${modo}: ${r.acao}${r.issue ? ` — ${r.issue}` : ''}`);
  return r;
}

/* CLI: erro → mensagem sanitizada e exit 1 (a Issue pode não ter sido
   criada, mas o run já está vermelho de qualquer forma). A comparação
   de import.meta.url precisa de pathToFileURL (no Windows o caminho é
   file:///C:/... — concatenar 'file://' na mão nunca bate). */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(sanitiza(String(e?.message ?? e), process.env.GITHUB_TOKEN));
    process.exit(1);
  });
}
