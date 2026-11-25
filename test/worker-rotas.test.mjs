/* Testes de caracterização das rotas do Worker — capturam o comportamento
   ATUAL do código (bugs ou não), com o driver do Neon mockado: nenhum
   teste toca em rede ou banco. Rodar: npm test (vitest run).

   Índices dos parâmetros capturados, para leitura dos `values`:
   - PATCH /api/games/:id (update): pares flag/val na ordem title (0/1),
     title_pt (2/3), platform (4/5), engine (6/7), company (8/9),
     genre (10/11), mode (12/13), review (14/15), year (16/17),
     rating (18/19); índice 20 = id do caminho. */
import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Estado compartilhado com o mock do driver — precisa de vi.hoisted,
   pois a fábrica do vi.mock é içada para o topo do arquivo. */
const estado = vi.hoisted(() => ({
  fila: [], // resposta(s) programada(s) para as próximas consultas SQL
  chamadas: [], // cada consulta capturada: { strings, values }
  urls: [], // DATABASE_URL(s) passado(s) a neon()
}));

/* Mock do driver: neon(url) devolve a função tagged-template que
   registra a consulta (strings textuais, values parametrizados) e
   responde com a próxima entrada da fila — array de linhas fixas,
   [] ou um Error para simular falha do banco. Nunca há rede.

   O Worker resolve '@neondatabase/serverless' do node_modules do
   worker/ QUANDO ele existe (instalação local), e da raiz no CI
   (aí só `npm install` da raiz). Com o pacote instalado nos DOIS
   lugares são dois módulos distintos, então mockamos OS DOIS
   caminhos: o bare specifier (raiz) e a cópia do worker/ quando
   existir. Mockar menos que isso deixa requisições vazarem para a
   cópia real do driver (rede de verdade — ECONNREFUSED). */
const fabricaDriver = () => ({
  neon: (url) => {
    estado.urls.push(url);
    return async (strings, ...values) => {
      estado.chamadas.push({ strings: [...strings], values });
      const proximo = estado.fila.shift();
      if (proximo instanceof Error) throw proximo;
      return proximo !== undefined ? proximo : [];
    };
  },
});

const temNodeModulesNoWorker = existsSync(
  new URL('../worker/node_modules/@neondatabase/serverless/package.json', import.meta.url)
);

/* vi.doMock (não içado) para poder condicionar ao existsSync; o import
   dinâmico do Worker vem depois, então os registros são respeitados.
   O especificador do worker/ resolve pelo campo "exports" do pacote
   (index.mjs), exatamente como o import do Worker resolve. */
vi.doMock('@neondatabase/serverless', fabricaDriver);
if (temNodeModulesNoWorker) {
  vi.doMock('../worker/node_modules/@neondatabase/serverless', fabricaDriver);
}

const worker = (await import('../worker/src/index.js')).default;

/* Mesmo ENV de test/worker.test.mjs. */
const ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  ADMIN_PASSWORD: 'senha-de-teste',
  SESSION_SECRET: 'segredo-de-teste',
  ALLOWED_ORIGIN: 'http://localhost:8080',
};

/* Linha fixa devolvida pelo banco nas rotas que retornam jogo. */
const LINHA_JOGO = { id: 7, title: 'Jogo Mockado', updated_at: 'agora' };

const BEARER = `Bearer ${ENV.ADMIN_PASSWORD}`;
const ORIGEM = ENV.ALLOWED_ORIGIN;

/* IP novo por requisição: o rate limit do /api/login é estado do
   módulo (Map), então testes podem contaminar uns aos outros. */
let seqIp = 0;
const ipNovo = () => `10.0.0.${++seqIp}`;

beforeEach(() => {
  estado.fila = [];
  estado.chamadas = [];
  estado.urls = [];
});

const postLogin = (env, { ip, origin, password } = {}) =>
  worker.fetch(
    new Request('http://x.test/api/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: origin ?? env.ALLOWED_ORIGIN,
        'cf-connecting-ip': ip ?? ipNovo(),
      },
      body: JSON.stringify({ password: password ?? env.ADMIN_PASSWORD }),
    }),
    env
  );

/** Abre sessão real e devolve o par "lista_session=..." do set-cookie. */
const loginCookie = async (env = ENV) => {
  const res = await postLogin(env, { ip: ipNovo() });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie').split(';')[0];
};

const patchFetch = (id, body, cabec = {}, env = ENV) =>
  worker.fetch(
    new Request(`http://x.test/api/games/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ipNovo(),
        ...cabec,
      },
      body: JSON.stringify(body),
    }),
    env
  );

const patchComBearer = (id, body, cabec = {}, env = ENV) =>
  patchFetch(
    id,
    body,
    { origin: ORIGEM, authorization: `Bearer ${env.ADMIN_PASSWORD}`, ...cabec },
    env
  );

const postFetch = (corpo, cabec = {}, env = ENV) =>
  worker.fetch(
    new Request('http://x.test/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ipNovo(),
        ...cabec,
      },
      body: corpo,
    }),
    env
  );

const postComBearer = (obj, cabec = {}, env = ENV) =>
  postFetch(
    JSON.stringify(obj),
    { origin: ORIGEM, authorization: `Bearer ${env.ADMIN_PASSWORD}`, ...cabec },
    env
  );

describe('GET públicos e cabeçalhos de resposta', () => {
  it('GET /api/games → 200 { games } com no-store, nosniff e CORS', async () => {
    estado.fila = [[LINHA_JOGO.id, LINHA_JOGO.title]];
    const res = await worker.fetch(new Request('http://x.test/api/games'), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ games: [LINHA_JOGO.id, LINHA_JOGO.title] });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEM);
  });

  it('GET /api/health → 200 { ok: true, total } contando no banco', async () => {
    estado.fila = [[{ total: 364 }]];
    const res = await worker.fetch(new Request('http://x.test/api/health'), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, total: 364 });
    expect(estado.chamadas).toHaveLength(1);
    expect(estado.chamadas[0].strings.join(' ')).toContain('count(*)');
  });
});

describe('validate() do PATCH — normalização do corpo (migrado do POST removido)', () => {
  /** PATCH com corpo cru (sem passar por JSON.stringify dos helpers). */
  const patchRaw = (cru, env = ENV) =>
    worker.fetch(
      new Request('http://x.test/api/games/42', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': ipNovo(),
          origin: ORIGEM,
          authorization: BEARER,
        },
        body: cru,
      }),
      env
    );

  it('title é aparado (trim) antes de ir ao SQL', async () => {
    estado.fila = [[LINHA_JOGO]];
    const res = await patchComBearer(42, { title: '  Com Espaços  ' });
    expect(res.status).toBe(200);
    expect(estado.chamadas[0].values[0]).toBe(1); // flag do title
    expect(estado.chamadas[0].values[1]).toBe('Com Espaços');
  });

  it('campos desconhecidos (id, updated_at, foo) não chegam aos values do SQL', async () => {
    estado.fila = [[LINHA_JOGO]];
    const res = await patchComBearer(42, {
      id: 999,
      updated_at: 'hackeado',
      foo: 'batata',
      rating: 3,
    });
    expect(res.status).toBe(200);
    const { values } = estado.chamadas[0];
    expect(values).not.toContain(999);
    expect(values).not.toContain('hackeado');
    expect(values).not.toContain('batata');
    /* o campo válido (rating) segue: flag 1 em values[18], valor em [19] */
    expect(values[18]).toBe(1);
    expect(values[19]).toBe(3);
    expect(values[20]).toBe(42); // id do caminho, não do corpo
  });

  it('corpo de PATCH só com campos desconhecidos → 400 e nenhuma consulta SQL', async () => {
    const res = await patchComBearer(42, { id: 999, foo: 'batata', updated_at: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('nenhum campo válido enviado');
    expect(estado.chamadas).toHaveLength(0);
  });

  it('corpo que não é objeto JSON (string, null, número) → 400', async () => {
    for (const cru of ['"texto"', 'null', '42']) {
      const res = await patchRaw(cru);
      expect(res.status, `corpo ${cru}`).toBe(400);
      expect((await res.json()).error).toBe('corpo precisa ser um objeto JSON');
      expect(estado.chamadas).toHaveLength(0);
    }
  });

  /* COMPORTAMENTO ATUAL (auditoria): array JSON passa no typeof === 'object'
     do validate (arrays são objetos) e sobra sem campos válidos — quem
     rejeita com "nenhum campo válido enviado" é a rota do PATCH. */
  it('corpo array JSON → 400 "nenhum campo válido enviado"', async () => {
    const res = await patchRaw('[1,2]');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('nenhum campo válido enviado');
    expect(estado.chamadas).toHaveLength(0);
  });
});

describe('limites de tamanho e intervalos (caracterização)', () => {
  const casoPATCH = async (obj) => {
    estado.fila = [[LINHA_JOGO]];
    return patchComBearer(42, obj);
  };

  it('title/review no limite passam e 1 caractere além → 400', async () => {
    expect((await casoPATCH({ title: 'a'.repeat(200) })).status).toBe(200);
    expect((await casoPATCH({ title: 'a'.repeat(201) })).status).toBe(400);
    expect((await casoPATCH({ review: 'a'.repeat(4000) })).status).toBe(200);
    expect((await casoPATCH({ review: 'a'.repeat(4001) })).status).toBe(400);
    /* só as duas consultas válidas ocorreram (title 200 e review 4000);
       no UPDATE, values[0] é flag(title) — o title vai no values[1],
       o review no values[15] */
    expect(estado.chamadas).toHaveLength(2);
    expect(estado.chamadas[0].values[0]).toBe(1);
    expect(estado.chamadas[0].values[1]).toBe('a'.repeat(200));
    expect(estado.chamadas[1].values[0]).toBe(0);
    expect(estado.chamadas[1].values[15]).toBe('a'.repeat(4000));
  });

  it('rating 1 e 5 passam; 0, 6, "5" (string) e 4.5 → 400', async () => {
    expect((await casoPATCH({ rating: 1 })).status).toBe(200);
    expect((await casoPATCH({ rating: 5 })).status).toBe(200);
    for (const rating of [0, 6, '5', 4.5]) {
      const res = await casoPATCH({ rating });
      expect(res.status, `rating ${JSON.stringify(rating)}`).toBe(400);
    }
  });

  it('year 1950 e 2100 passam; 1949 e 2101 → 400', async () => {
    expect((await casoPATCH({ year: 1950 })).status).toBe(200);
    expect((await casoPATCH({ year: 2100 })).status).toBe(200);
    for (const year of [1949, 2101]) {
      expect((await casoPATCH({ year })).status).toBe(400);
    }
  });
});

describe('PATCH /api/games/:id — flags por coluna', () => {
  it('Bearer certo → 200 { game }; só colunas enviadas têm flag 1', async () => {
    estado.fila = [[LINHA_JOGO]];
    const res = await patchComBearer(42, { engine: 'Motor A', rating: 4 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ game: LINHA_JOGO });
    const { values } = estado.chamadas[0];
    expect(values[20]).toBe(42); // id do caminho
    expect(values[6]).toBe(1); // flag engine
    expect(values[7]).toBe('Motor A');
    expect(values[18]).toBe(1); // flag rating
    expect(values[19]).toBe(4);
    for (const flagNaoEnviada of [0, 2, 4, 8, 10, 12, 14, 16]) {
      expect(values[flagNaoEnviada], `flag índice ${flagNaoEnviada}`).toBe(0);
      expect(values[flagNaoEnviada + 1], `val índice ${flagNaoEnviada + 1}`).toBe(null);
    }
  });

  it('{ review: null } zera: flag 1 com valor null no SQL', async () => {
    estado.fila = [[LINHA_JOGO]];
    const res = await patchComBearer(42, { review: null });
    expect(res.status).toBe(200);
    const { values } = estado.chamadas[0];
    expect(values[14]).toBe(1); // flag review enviada
    expect(values[15]).toBe(null);
  });

  it('{} → 400 "nenhum campo válido enviado" sem tocar o banco', async () => {
    const res = await patchComBearer(42, {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('nenhum campo válido enviado');
    expect(estado.chamadas).toHaveLength(0);
  });

  it('banco devolve [] (id inexistente) → 404 com o id na mensagem', async () => {
    estado.fila = [[]];
    const res = await patchComBearer(99, { rating: 3 });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('99');
  });
});

describe('exigência de Origin nas escritas (COMPORTAMENTO ATUAL)', () => {
  /* COMPORTAMENTO ATUAL (auditoria): também a autenticação por Bearer
     (terminal/scripts) exige Origin — rotas de escrita fazem
     originAllowed independentemente do método de autenticação. Parece
     intencional (defesa em profundidade anti-CSRF), então está
     caracterizado aqui e não "corrigido". */
  it('PATCH com Bearer certo MAS sem Origin → 403', async () => {
    const req = new Request('http://x.test/api/games/42', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ipNovo(),
        authorization: BEARER,
      },
      body: JSON.stringify({ rating: 3 }),
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(403);
    expect(estado.chamadas).toHaveLength(0);
  });

  it('PATCH com Bearer certo e Origin ERRADA → 403', async () => {
    const res = await patchComBearer(42, { rating: 3 }, { origin: 'http://inimigo.test' });
    expect(res.status).toBe(403);
    expect(estado.chamadas).toHaveLength(0);
  });

  it('login com Origin errada → 403 (antes mesmo de validar a senha)', async () => {
    const res = await postLogin(ENV, { origin: 'http://inimigo.test', password: 'errada' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origem não permitida');
  });
});

describe('sessão por cookie', () => {
  it('login certo → 200 com set-cookie HttpOnly, Secure, SameSite=None, Max-Age=604800', async () => {
    const res = await postLogin(ENV, { ip: ipNovo() });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('lista_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Max-Age=604800');
  });

  it('cookie de sessão válido autoriza PATCH → 200', async () => {
    estado.fila = [[LINHA_JOGO.id, LINHA_JOGO.title]];
    const cookie = await loginCookie();
    const res = await patchFetch(42, { rating: 3 }, { origin: ORIGEM, cookie });
    expect(res.status).toBe(200);
    expect(estado.chamadas).toHaveLength(1);
  });

  it('cookie com 1 caractere da assinatura trocado → 401', async () => {
    const cookie = await loginCookie();
    const [nome, valor] = cookie.split('=');
    const [iat, jti, exp, sig] = valor.split('.');
    const sigFalsificado = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
    const falsificado = `${nome}=${iat}.${jti}.${exp}.${sigFalsificado}`;
    const res = await patchFetch(42, { rating: 3 }, { origin: ORIGEM, cookie: falsificado });
    expect(res.status).toBe(401);
  });

  it('cookie expirado (7 dias + 1 s, relógio fake) → 401', async () => {
    vi.useFakeTimers();
    try {
      const cookie = await loginCookie();
      vi.advanceTimersByTime((7 * 24 * 60 * 60 + 1) * 1000);
      const res = await patchFetch(42, { rating: 3 }, { origin: ORIGEM, cookie });
      expect(res.status).toBe(401);
      expect(estado.chamadas).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cookie assinado com outro SESSION_SECRET → 401', async () => {
    const ENV_OUTRO = { ...ENV, SESSION_SECRET: 'segredo-diferente' };
    const cookie = await loginCookie(ENV_OUTRO);
    const res = await patchFetch(42, { rating: 3 }, { origin: ORIGEM, cookie });
    expect(res.status).toBe(401);
    expect(estado.chamadas).toHaveLength(0);
  });

  it('cookie com 3 partes → 401', async () => {
    const cookie = await loginCookie();
    const [nome, valor] = cookie.split('=');
    const semSig = `${nome}=${valor.split('.').slice(0, 3).join('.')}`;
    const res = await patchFetch(42, { rating: 3 }, { origin: ORIGEM, cookie: semSig });
    expect(res.status).toBe(401);
    expect(estado.chamadas).toHaveLength(0);
  });

  it('ENV sem SESSION_SECRET → 401 mesmo com cookie válido de outra sessão', async () => {
    const cookie = await loginCookie();
    const res = await patchFetch(
      42,
      { rating: 3 },
      { origin: ORIGEM, cookie },
      { ...ENV, SESSION_SECRET: undefined }
    );
    expect(res.status).toBe(401);
    expect(estado.chamadas).toHaveLength(0);
  });
});

describe('rate limit (COMPORTAMENTO ATUAL)', () => {
  /* COMPORTAMENTO ATUAL (auditoria): o limite de 5/min existe só no
     /api/login; as demais rotas (inclusive PATCH) não têm limite —
     caracterizado para não parecer que há proteção geral por IP. */
  it('IP A esgota o login (429) enquanto IP B ainda recebe 401', async () => {
    const ipA = ipNovo();
    const ipB = ipNovo();
    const statusA = [];
    for (let i = 0; i < 6; i++) {
      const res = await postLogin(ENV, { ip: ipA, password: 'errada' });
      statusA.push(res.status);
    }
    expect(statusA).toEqual([401, 401, 401, 401, 401, 429]);
    const resB = await postLogin(ENV, { ip: ipB, password: 'errada' });
    expect(resB.status).toBe(401);
  });

  it('20 PATCH seguidos com Bearer errado → sempre 401, nunca 429', async () => {
    const status = [];
    for (let i = 0; i < 20; i++) {
      const res = await patchComBearer(
        42,
        { rating: 3 },
        {
          authorization: 'Bearer senha-errada',
        }
      );
      status.push(res.status);
    }
    expect(status.every((s) => s === 401)).toBe(true);
    expect(status.some((s) => s === 429)).toBe(false);
    expect(estado.chamadas).toHaveLength(0);
  });
});

describe('rotas diversas e erro do banco', () => {
  it('rota desconhecida → 404 "rota não encontrada"', async () => {
    const res = await worker.fetch(new Request('http://x.test/api/naoexiste'), ENV);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('rota não encontrada');
  });

  it('erro lançado pelo banco → 500 com mensagem fixa, sem vazar o erro original', async () => {
    const espiaoConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      estado.fila = [new Error('boom pg: conexão recusada')];
      const res = await worker.fetch(new Request('http://x.test/api/games'), ENV);
      expect(res.status).toBe(500);
      const corpo = await res.json();
      expect(corpo.error).toBe('erro interno do Worker');
      expect(JSON.stringify(corpo)).not.toContain('boom');
    } finally {
      espiaoConsole.mockRestore();
    }
  });

  it('logout → 200 com set-cookie apagando a sessão (Max-Age=0)', async () => {
    const res = await worker.fetch(
      new Request('http://x.test/api/logout', { method: 'POST' }),
      ENV
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('lista_session=');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('POST /api/games removida (rota sem uso)', () => {
  it('POST /api/games com Bearer e Origin certos e corpo válido → 404 sem tocar no banco', async () => {
    estado.fila = [[LINHA_JOGO.id, LINHA_JOGO.title]];
    const res = await postComBearer({ title: 'Válido', rating: 5 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'rota não encontrada' });
    expect(estado.chamadas).toHaveLength(0);
  });

  it('POST /api/games sem autenticação → 404 (não 401)', async () => {
    const res = await postFetch(JSON.stringify({ title: 'x' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'rota não encontrada' });
    expect(estado.chamadas).toHaveLength(0);
  });

  it('OPTIONS /api/games continua respondendo 204 com CORS', async () => {
    const res = await worker.fetch(
      new Request('http://x.test/api/games', {
        method: 'OPTIONS',
        headers: { origin: ORIGEM, 'access-control-request-method': 'GET' },
      }),
      ENV
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEM);
  });
});
