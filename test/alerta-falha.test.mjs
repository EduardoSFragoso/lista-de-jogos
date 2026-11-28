/* Testes do alerta de falha de workflow (tools/alerta-falha.mjs) —
   sem rede e sem dependências novas: o fetch é injetado (servidor
   falso da API do GitHub).

   Contrato do módulo:
   - dois modos: `falhou` e `passou` (argv); token por env
     GITHUB_TOKEN, repo por GITHUB_REPOSITORY;
   - título exato `[alerta] <nome do workflow> falhou`; label
     `alerta-falha` (criada se faltar);
   - `falhou`: sem Issue aberta com esse título e label → cria; com →
     comenta o link do run, exceto com ALERTA_SEM_COMENTARIO=1;
   - `passou`: com Issue aberta → comenta "voltou a passar (<run>)" e
     fecha; sem → não faz nada;
   - corpo/comentário com SÓ nome do workflow, evento, branch, SHA
     curto e link do run — nunca log, env ou token;
   - erro de API: mensagem NUNCA contém o token;
   - listagem de issues: ignorar itens com `pull_request` (a API
     devolve PRs) e itens sem a label. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LABEL,
  corpoAlerta,
  falhou,
  filtroIssues,
  main,
  passou,
  tituloAlerta,
} from '../tools/alerta-falha.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKEN = 'ghp_token_de_teste_0123456789';
const envBase = {
  GITHUB_TOKEN: TOKEN,
  GITHUB_REPOSITORY: 'EduardoSFragoso/lista-de-jogos',
  GITHUB_WORKFLOW: 'sync-neon',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF_NAME: 'main',
  GITHUB_SHA: 'abcd1234567890abcd1234567890abcd12345678',
  GITHUB_RUN_ID: '4242',
  GITHUB_SERVER_URL: 'https://github.test',
};

const URL_RUN = 'https://github.test/EduardoSFragoso/lista-de-jogos/actions/runs/4242';
const CORPO_ESPERADO = [
  'Workflow: sync-neon',
  'Evento: push',
  'Branch: main',
  'SHA: abcd123',
  `Run: ${URL_RUN}`,
].join('\n');

const resposta = (status, corpo = {}) => ({
  ok: status < 300,
  status,
  json: async () => corpo,
});

/* Servidor falso da API do GitHub: registra todas as chamadas e
   guarda o efeito de cada uma (issues criadas/comentadas/fechadas). */
function servidorFake(issuesIniciais = [], { temLabel = true } = {}) {
  const estado = {
    issues: issuesIniciais.map((i, k) => ({ number: k + 1, state: 'open', ...i })),
    temLabel,
    criadas: [],
    comentarios: [],
    labelsCriadas: [],
    chamadas: [],
  };
  const fetcher = vi.fn(async (url, opts = {}) => {
    const metodo = opts.method ?? 'GET';
    const corpo = opts.body ? JSON.parse(opts.body) : undefined;
    estado.chamadas.push({ url, metodo, corpo });
    const caminho = new URL(url).pathname;
    if (caminho.endsWith('/issues') && metodo === 'GET') {
      return resposta(
        200,
        estado.issues.filter((i) => i.state === 'open')
      );
    }
    if (caminho.endsWith('/issues') && metodo === 'POST') {
      const issue = {
        number: estado.issues.length + 1,
        state: 'open',
        html_url: `https://github.test/x/y/issues/${estado.issues.length + 1}`,
        ...corpo,
      };
      estado.issues.push(issue);
      estado.criadas.push(issue);
      return resposta(201, issue);
    }
    if (/\/labels\/[^/]+$/.test(caminho) && metodo === 'GET') {
      return estado.temLabel
        ? resposta(200, { name: LABEL })
        : resposta(404, { message: 'Not Found' });
    }
    if (caminho.endsWith('/labels') && metodo === 'POST') {
      estado.temLabel = true;
      estado.labelsCriadas.push(corpo);
      return resposta(201, corpo);
    }
    if (caminho.endsWith('/comments') && metodo === 'POST') {
      estado.comentarios.push(corpo);
      return resposta(201, {});
    }
    if (metodo === 'PATCH') {
      const numero = Number(caminho.match(/issues\/(\d+)/)?.[1]);
      const issue = estado.issues.find((i) => i.number === numero);
      if (!issue) return resposta(404, { message: 'Not Found' });
      Object.assign(issue, corpo);
      return resposta(200, issue);
    }
    return resposta(404, { message: 'Not Found' });
  });
  return { estado, fetcher };
}

/* Issue de alerta já aberta (com label e título exato). */
const issueAlerta = (workflow = 'sync-neon', extra = {}) => ({
  title: tituloAlerta(workflow),
  labels: [{ name: LABEL }],
  html_url: 'https://github.test/x/y/issues/7',
  ...extra,
});

describe('filtros de busca', () => {
  it('título exato por workflow', () => {
    expect(tituloAlerta('sync-neon')).toBe('[alerta] sync-neon falhou');
    expect(tituloAlerta('monitor de saúde')).toBe('[alerta] monitor de saúde falhou');
  });

  it('filtroIssues ignora PRs, itens sem label e título de outro workflow', () => {
    const issues = [
      issueAlerta('sync-neon', { pull_request: { url: 'https://github.test/x/y/pulls/1' } }),
      issueAlerta('sync-neon', { labels: [] }),
      issueAlerta('outro workflow'),
      issueAlerta('sync-neon'),
    ];
    const achadas = filtroIssues(issues, 'sync-neon');
    expect(achadas).toHaveLength(1);
    expect(achadas[0].title).toBe('[alerta] sync-neon falhou');
  });
});

describe('corpo do alerta: só o essencial', () => {
  it('nome do workflow, evento, branch, SHA curto e link do run', () => {
    expect(corpoAlerta(envBase)).toBe(CORPO_ESPERADO);
    expect(corpoAlerta(envBase)).not.toContain(TOKEN);
    expect(corpoAlerta(envBase)).not.toContain('GITHUB_TOKEN');
  });
});

describe('modo falhou', () => {
  it('cria a Issue quando não há nenhuma aberta', async () => {
    const { estado, fetcher } = servidorFake();
    const r = await falhou({ env: envBase, fetcher });
    expect(r.acao).toBe('criada');
    expect(estado.criadas).toHaveLength(1);
    expect(estado.criadas[0].title).toBe('[alerta] sync-neon falhou');
    expect(estado.criadas[0].labels).toEqual([LABEL]);
    expect(estado.criadas[0].body).toBe(CORPO_ESPERADO);
  });

  it('comenta na Issue aberta existente, sem criar outra', async () => {
    const { estado, fetcher } = servidorFake([issueAlerta()]);
    const r = await falhou({ env: envBase, fetcher });
    expect(r.acao).toBe('comentada');
    expect(estado.criadas).toHaveLength(0);
    expect(estado.comentarios).toHaveLength(1);
    expect(estado.comentarios[0].body).toBe(CORPO_ESPERADO);
  });

  it('ALERTA_SEM_COMENTARIO=1: nem comenta, nem cria', async () => {
    const { estado, fetcher } = servidorFake([issueAlerta()]);
    const r = await falhou({ env: { ...envBase, ALERTA_SEM_COMENTARIO: '1' }, fetcher });
    expect(r.acao).toBe('silencio');
    expect(estado.comentarios).toHaveLength(0);
    expect(estado.criadas).toHaveLength(0);
  });

  it('ignora PRs e Issues sem a label — e título de outro workflow', async () => {
    const { estado, fetcher } = servidorFake([
      issueAlerta('sync-neon', { pull_request: { url: 'https://github.test/x/y/pulls/1' } }),
      issueAlerta('sync-neon', { labels: [] }),
      issueAlerta('outro workflow'),
    ]);
    const r = await falhou({ env: envBase, fetcher });
    expect(r.acao).toBe('criada');
    expect(estado.comentarios).toHaveLength(0);
    expect(estado.criadas).toHaveLength(1);
  });

  it('cria a label quando ela não existe', async () => {
    const { estado, fetcher } = servidorFake([], { temLabel: false });
    await falhou({ env: envBase, fetcher });
    expect(estado.labelsCriadas).toHaveLength(1);
    expect(estado.labelsCriadas[0].name).toBe(LABEL);
    expect(estado.criadas).toHaveLength(1);
  });

  it('erro 403 da API: mensagem sem o token', async () => {
    const fetcher = async () =>
      resposta(403, { message: 'Resource not accessible by integration' });
    await expect(falhou({ env: envBase, fetcher })).rejects.toThrow(/403.*Resource not accessible/);
    const erro = await falhou({ env: envBase, fetcher }).catch((e) => e);
    expect(String(erro.message), 'token não pode vazar no erro').not.toContain(TOKEN);
  });

  it('nenhuma chamada carrega o token em URL ou corpo', async () => {
    const { estado, fetcher } = servidorFake([issueAlerta()]);
    await falhou({ env: envBase, fetcher });
    expect(JSON.stringify(estado.chamadas)).not.toContain(TOKEN);
  });
});

describe('modo passou', () => {
  it('comenta "voltou a passar" e fecha a Issue aberta', async () => {
    const { estado, fetcher } = servidorFake([issueAlerta()]);
    const r = await passou({ env: envBase, fetcher });
    expect(r.acao).toBe('fechada');
    expect(estado.comentarios[0].body).toBe(`voltou a passar (${URL_RUN})`);
    const fechada = estado.issues.find((i) => i.title === tituloAlerta('sync-neon'));
    expect(fechada.state).toBe('closed');
  });

  it('sem Issue aberta: não faz nada', async () => {
    const { estado, fetcher } = servidorFake();
    const r = await passou({ env: envBase, fetcher });
    expect(r.acao).toBe('nada');
    const rede = estado.chamadas.filter((c) => c.metodo !== 'GET');
    expect(rede).toHaveLength(0);
  });

  it('não fecha Issue de outro workflow (título diferente)', async () => {
    const { estado, fetcher } = servidorFake([issueAlerta('outro workflow')]);
    const r = await passou({ env: envBase, fetcher });
    expect(r.acao).toBe('nada');
    expect(estado.issues[0].state).toBe('open');
  });
});

describe('main: argv e env', () => {
  const argv = (modo) => ['node', 'tools/alerta-falha.mjs', modo];

  it('main falhou cria a Issue', async () => {
    const { estado, fetcher } = servidorFake();
    const r = await main({ argv: argv('falhou'), env: envBase, fetcher });
    expect(r.acao).toBe('criada');
    expect(estado.criadas).toHaveLength(1);
  });

  it('main passou fecha a Issue', async () => {
    const { fetcher } = servidorFake([issueAlerta()]);
    const r = await main({ argv: argv('passou'), env: envBase, fetcher });
    expect(r.acao).toBe('fechada');
  });

  it('modo inválido → erro', async () => {
    await expect(
      main({ argv: argv('explode'), env: envBase, fetcher: async () => resposta(200, []) })
    ).rejects.toThrow(/falhou|passou/);
  });

  it('sem GITHUB_TOKEN → erro', async () => {
    await expect(
      main({
        argv: argv('falhou'),
        env: { ...envBase, GITHUB_TOKEN: undefined },
        fetcher: async () => resposta(200, []),
      })
    ).rejects.toThrow(/GITHUB_TOKEN/);
  });
});
