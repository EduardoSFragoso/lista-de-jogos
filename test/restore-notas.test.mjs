/* Testes do restore-notas — restauração das notas do backup (branch
   backup-notas) no Neon, com sql mockado (nada toca no banco de verdade,
   exceto o teste do driver real, que usa fetchFunction injetada e não
   faz rede). Rodar: npm test (vitest run). */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const { aplicar, carregaNotas, criaCliente, main, parseArgs, planejar, primRotulo, valida } =
  await import('../tools/restore-notas.mjs');
/* Driver real — usado no teste da lição do PR 26 (nenhum outro teste
   toca no driver; TODOS passam por fakeSql). */
const { neon, neonConfig } = await import('@neondatabase/serverless');

const URL_FALSA =
  'postgresql://dono:senha_clara@ep-xxxx-teste-pooler.sa-east-1.aws.neon.tech/neondb';
const HOST_LABEL = 'ep-xxxx-teste-pooler';

/* sql fake no padrão do driver real: só db.query() existe; chamada via
   template (fn\`\`) é erro — o módulo não deve usá-la. `linhas` é o
   estado "atual" do banco respondido ao select; `updateRetorno` saída
   do UPDATE (rowCount é o número de linhas efetivamente alteradas). */
function fakeSql({ linhas = [], updateRetorno = { rowCount: 0 } } = {}) {
  const consultas = [];
  const fn = () => {
    throw new Error('chamada inesperada via template — o módulo deve usar db.query()');
  };
  fn.consultas = consultas;
  fn.escritas = () => consultas.filter((c) => /update games/.test(c.texto));
  fn.query = async (texto, params) => {
    consultas.push({ texto, params });
    if (texto.includes('select id, rating, review')) return { rows: linhas };
    if (texto.includes('update games')) return updateRetorno;
    throw new Error('consulta inesperada: ' + texto);
  };
  return fn;
}

const jogo = (id, rating = null, review = null) => ({ id, title: `Jogo ${id}`, rating, review });
const dados = (jogos) => ({ total: jogos.length, jogos });

/* Banco "atual" para os cenários de dry-run/aplicar:
   id1 idêntico; id2 idêntico (tudo vazio); id3 a restaurar;
   id4 conflito; id5 não existe no banco (faltante). */
const BANCO = [
  { id: 1, rating: 3, review: null },
  { id: 2, rating: null, review: null },
  { id: 3, rating: null, review: null },
  { id: 4, rating: 2, review: null },
];
const NOTAS = [
  jogo(1, 3, null),
  jogo(2, null, null),
  jogo(3, 4, 'boa'),
  jogo(4, 5, null),
  jogo(5, 2, 'reencarnado'),
];

function tempNotas(conteudo) {
  const dir = mkdtempSync(path.join(tmpdir(), 'restaura-notas-'));
  const arq = path.join(dir, 'notas.json');
  writeFileSync(arq, JSON.stringify(conteudo));
  return { arq, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

async function rodar(over = {}) {
  const saidas = [];
  const erros = [];
  const retorno = await main({
    arquivo: tempNotas(dados(NOTAS)).arq,
    print: (l) => saidas.push(l),
    env: { DATABASE_URL: URL_FALSA },
    ...over,
  });
  return { retorno, saidas, erros };
}

describe('valida: arquivo com problemas → erro (exit 1 via CLI), zero escritas', () => {
  it('"jogos" não array → erro', () => {
    expect(() => valida({ jogos: 3 })).toThrow(/jogos/);
    expect(() => valida(null)).toThrow(/jogos/);
  });
  it('ids duplicados → erro', () => {
    expect(() => valida(dados([jogo(1), jogo(1)]))).toThrow(/duplicado/);
  });
  it('id não inteiro → erro', () => {
    expect(() => valida(dados([jogo(1.5)]))).toThrow(/id/);
    expect(() => valida(dados([jogo('1')]))).toThrow(/id/);
  });
  it('rating 0, 6, "5" ou 4.5 → erro', () => {
    for (const r of [0, 6, '5', 4.5]) {
      expect(() => valida(dados([jogo(1, r)])), String(r)).toThrow(/rating/);
    }
  });
  it('review não string → erro', () => {
    expect(() => valida(dados([jogo(1, null, 42)]))).toThrow(/review/);
  });
  it('rating/review null e valores válidos passam', () => {
    expect(() => valida(dados([jogo(1, 5, 'ótima'), jogo(2, null, null)]))).not.toThrow();
  });
  it('carregaNotas: rating 6 em arquivo → erro antes de qualquer consulta', async () => {
    const { arq, limpar } = tempNotas(dados([jogo(1, 6)]));
    try {
      expect(() => carregaNotas(arq)).toThrow(/rating/);
    } finally {
      limpar();
    }
  });
});

/* Gap de teste do PR 31: "banco vazio" é rating E review nulos. Se a
   regra passar a olhar só UM dos campos, o script sobrescreveria um
   valor que já existe (ex.: review antiga) sem --sobrescrever. */
describe('banco com UM campo preenchido nunca é "vazio" — CONFLITO, não sobrescreve', () => {
  const bancoMisto = [
    { id: 6, rating: null, review: 'antiga' }, // rating vazio, review preenchida
    { id: 7, rating: 2, review: null }, // review vazia, rating preenchido
  ];
  const notasMisto = [jogo(6, 4, 'boa'), jogo(7, 5, 'nova revisão')];
  const rodarMisto = async (over = {}) => {
    const sql = fakeSql({ linhas: bancoMisto, updateRetorno: { rowCount: 2 } });
    const { arq, limpar } = tempNotas(dados(notasMisto));
    try {
      const { retorno, saidas } = await rodar({
        arquivo: arq,
        aplicar: true,
        confirmoHost: HOST_LABEL,
        sql,
        ...over,
      });
      return { retorno, saidas, sql };
    } finally {
      limpar();
    }
  };
  it('a. rating NULO + review preenchida → conflito, não escrito, id em "pulados"', async () => {
    const { retorno, saidas, sql } = await rodarMisto();
    expect(retorno.plano.conflitos.map((j) => j.id)).toContain(6);
    expect(retorno.plano.aRestaurar.map((j) => j.id)).not.toContain(6);
    expect(saidas.join('\n')).toMatch(/pulados por conflito \(só ids.*\): 6, 7/);
    expect(sql.escritas()).toHaveLength(0); // só conflitos → nada é escrito
  });
  it('b. review NULA + rating preenchido → conflito, não escrito, id em "pulados"', async () => {
    const { retorno, saidas, sql } = await rodarMisto();
    expect(retorno.plano.conflitos.map((j) => j.id)).toContain(7);
    expect(retorno.plano.aRestaurar.map((j) => j.id)).not.toContain(7);
    expect(saidas.join('\n')).toMatch(/pulados por conflito \(só ids.*\): 6, 7/);
    expect(sql.escritas()).toHaveLength(0);
  });
  it('c. com --sobrescrever, a e b são gravados (parâmetros exatos)', async () => {
    const { retorno, sql } = await rodarMisto({ sobrescrever: true });
    const escritas = sql.escritas();
    expect(escritas).toHaveLength(1);
    expect(escritas[0].params).toEqual([6, 4, 'boa', 7, 5, 'nova revisão']);
    expect(retorno.pulados).toEqual([]);
  });
});

describe('dry-run (padrão): contagens certas e ZERO escritas', () => {
  it('classifica 5 jogos: 2 idênticos, 1 a restaurar, 1 conflito, 1 faltante', async () => {
    const { retorno, saidas } = await rodar({ sql: fakeSql({ linhas: BANCO }) });
    expect(retorno.plano.identicos).toEqual([1, 2]);
    expect(retorno.plano.aRestaurar.map((j) => j.id)).toEqual([3]);
    expect(retorno.plano.conflitos.map((j) => j.id)).toEqual([4]);
    expect(retorno.plano.faltantes).toEqual([5]);
    expect(saidas.join('\n')).toMatch(/a restaurar \(vazios no banco\): 1/);
    expect(saidas.join('\n')).toMatch(/em conflito \(banco tem outro valor\): 1/);
    expect(saidas.join('\n')).toMatch(/faltando no banco.*: 1/);
    expect(saidas.join('\n')).toMatch(/DRY-RUN: nenhuma escrita/);
  });
  it('não escreve nada', async () => {
    const sql = fakeSql({ linhas: BANCO });
    const { retorno } = await rodar({ sql });
    expect(retorno.restaurados).toBe(0);
    expect(sql.escritas()).toHaveLength(0);
  });
});

describe('--aplicar: exigências de confirmação', () => {
  it('sem --confirmo-host → erro', async () => {
    await expect(rodar({ aplicar: true, sql: fakeSql() })).rejects.toThrow(/confirmo-host/);
  });
  it('host errado → erro (e nada é escrito)', async () => {
    const sql = fakeSql({ linhas: BANCO });
    await expect(rodar({ aplicar: true, confirmoHost: 'outro-host', sql })).rejects.toThrow(
      /não bate com o alvo/
    );
    expect(sql.escritas()).toHaveLength(0);
  });
});

describe('--aplicar com host certo: preenche só vazios, pula conflitos', () => {
  it('escreve apenas as linhas vazias em UMA única atualização atômica', async () => {
    const sql = fakeSql({ linhas: BANCO, updateRetorno: { rowCount: 1 } });
    const { retorno, saidas } = await rodar({ aplicar: true, confirmoHost: HOST_LABEL, sql });
    const escritas = sql.escritas();
    expect(escritas).toHaveLength(1);
    expect(escritas[0].texto).toMatch(/update games as g/);
    expect(escritas[0].texto).toMatch(/from \(values/);
    expect(escritas[0].texto).toMatch(/updated_at = now\(\)/);
    expect(escritas[0].params).toEqual([3, 4, 'boa']); // só o id 3; conflito 4 fora
    expect(retorno.restaurados).toBe(1);
    expect(retorno.pulados).toEqual([4]);
    expect(saidas.join('\n')).toMatch(/pulados por conflito \(só ids.*\): 4/);
  });
  it('--sobrescrever grava também nos conflitos', async () => {
    const sql = fakeSql({ linhas: BANCO, updateRetorno: { rowCount: 2 } });
    const { retorno } = await rodar({
      aplicar: true,
      confirmoHost: HOST_LABEL,
      sobrescrever: true,
      sql,
    });
    const escritas = sql.escritas();
    expect(escritas).toHaveLength(1);
    // arrays de parâmetros EXATOS: 4 tem de entrar como id (3ª linha de
    // values), não como rating do jogo 3 — aqui: [id3, 4, 'boa', id4, 5, null]
    expect(escritas[0].params).toEqual([3, 4, 'boa', 4, 5, null]);
    expect(retorno.pulados).toEqual([]);
  });
  it('ids ausentes no banco são ignorados (contados como faltantes, nunca escritos)', async () => {
    const sql = fakeSql({ linhas: BANCO });
    const { retorno } = await rodar({ aplicar: true, confirmoHost: HOST_LABEL, sql });
    expect(retorno.plano.faltantes).toEqual([5]);
    const params = sql.escritas()[0].params;
    expect(params).not.toContain(5);
  });
});

describe('segredos: a saída nunca mostra URL, senha nem host completo', () => {
  it('mostra só o primeiro rótulo do host', async () => {
    const { saidas } = await rodar({ sql: fakeSql({ linhas: BANCO }) });
    const { saidas: ls2 } = await rodar({
      aplicar: true,
      confirmoHost: HOST_LABEL,
      sql: fakeSql({ linhas: BANCO }),
    });
    const texto = [...saidas, ...ls2].join('\n');
    expect(texto).toContain(HOST_LABEL);
    expect(texto).not.toContain('senha_clara');
    expect(texto).not.toContain('postgresql://');
    expect(texto).not.toContain('neon.tech');
  });
  it('primRotulo: devolve o primeiro rótulo do host', () => {
    expect(primRotulo(URL_FALSA)).toBe(HOST_LABEL);
  });
});

describe('parseArgs', () => {
  it('lê --arquivo, --aplicar, --confirmo-host e --sobrescrever', () => {
    const r = parseArgs([
      '--arquivo',
      'notas.json',
      '--aplicar',
      '--confirmo-host',
      'ep-abc',
      '--sobrescrever',
    ]);
    expect(r).toEqual({
      arquivo: 'notas.json',
      aplicar: true,
      confirmoHost: 'ep-abc',
      sobrescrever: true,
    });
  });
  it('argumento desconhecido → erro', () => {
    expect(() => parseArgs(['--foo'])).toThrow(/desconhecido/);
  });
});

describe('driver real 1.x: db("SQL", params) lança erro — o módulo deve usar db.query()', () => {
  const deVerdade = neon(URL_FALSA);
  it('contraste: a chamada convencional lança o erro do 1.x', () => {
    expect(() => deVerdade('select 1', ['x'])).toThrow(/tagged-template/);
  });
  it('o módulo usa db.query(): planejar e aplicar não tocam o erro do 1.x', async () => {
    // fetchFunction é configuração GLOBAL do driver (v1.x); salva e
    // restaura para não vazar para outros testes. A função injetada
    // lança ANTES de qualquer rede: se a chamada chega até ela, é
    // sinal de que o módulo falou com o driver pelo caminho certo.
    const anterior = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async () => {
      throw new Error('sem rede na prova — a chamada saiu do módulo como db.query()');
    };
    try {
      const db = neon(URL_FALSA);
      await expect(planejar(db, dados([jogo(1, 3)]))).rejects.toThrow(/sem rede na prova/);
      await expect(aplicar(db, [jogo(1, 3)])).rejects.toThrow(/sem rede na prova/);
    } finally {
      neonConfig.fetchFunction = anterior;
    }
  });

  /* Defeito achado no PR 31: sem fullResults, db.query() do driver 1.x
     devolve um ARRAY de linhas (sem .rows/.rowCount) — planejar() quebrava
     com TypeError. Aqui o driver REAL responde no formato do protocolo
     HTTP do Neon (fields: [{name, dataTypeID}...], rows como arrays de
     valores, rowCount) e o cliente é criado pelo MESMO caminho do main()
     (criaCliente). Nenhuma rede de verdade: a resposta é simulada. */
  describe('driver real com resposta do protocolo do Neon (ponta a ponta)', () => {
    const cabecalhos = [
      { name: 'id', dataTypeID: 23 }, // int4
      { name: 'rating', dataTypeID: 21 }, // int2
      { name: 'review', dataTypeID: 25 }, // text
    ];
    const resposta = (linhas, rowCount) =>
      new Response(JSON.stringify({ fields: cabecalhos, rows: linhas, rowCount }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    it('planejar e aplicar funcionam com o cliente de criaCliente (fullResults)', async () => {
      const anterior = neonConfig.fetchFunction;
      let chamadas = 0;
      neonConfig.fetchFunction = async () =>
        ++chamadas === 1
          ? resposta(
              [
                [1, 3, null],
                [2, null, null],
                [4, 2, null],
              ],
              3
            )
          : resposta([], 1);
      try {
        const db = criaCliente(URL_FALSA);
        const plano = await planejar(
          db,
          dados([jogo(1, 3), jogo(2, null, null), jogo(4, 5, null)])
        );
        expect(plano.identicos).toEqual([1, 2]);
        expect(plano.conflitos.map((j) => j.id)).toEqual([4]);
        expect(await aplicar(db, [jogo(4, 5, null)])).toBe(1);
      } finally {
        neonConfig.fetchFunction = anterior;
      }
    });
  });
});

describe('backup vazio (jogos: []): "nada a restaurar", NENHUMA consulta ao banco', () => {
  function tempVazio() {
    const { arq, limpar } = tempNotas(dados([]));
    return { arq, limpar };
  }
  it('dry-run: mensagem e zero consultas', async () => {
    const { arq, limpar } = tempVazio();
    const sql = fakeSql();
    try {
      const { retorno, saidas } = await rodar({ arquivo: arq, sql });
      expect(saidas.join('\n')).toMatch(/nada a restaurar/);
      expect(sql.consultas).toHaveLength(0);
      expect(retorno.restaurados).toBe(0);
    } finally {
      limpar();
    }
  });
  it('mesmo com --aplicar e host certo: nada escrito, zero consultas', async () => {
    const { arq, limpar } = tempVazio();
    const sql = fakeSql();
    try {
      const { retorno, saidas } = await rodar({
        arquivo: arq,
        aplicar: true,
        confirmoHost: HOST_LABEL,
        sql,
      });
      expect(saidas.join('\n')).toMatch(/nada a restaurar/);
      expect(sql.consultas).toHaveLength(0);
      expect(retorno.restaurados).toBe(0);
      expect(sql.escritas()).toHaveLength(0);
    } finally {
      limpar();
    }
  });
});

describe('aceita os dois formatos do notas.json (só `jogos` importa)', () => {
  it('formato antigo (com `total`) é aceito', () => {
    expect(() => valida({ total: 2, jogos: [jogo(1, 3), jogo(2)] })).not.toThrow();
    expect(() => valida({ total: 0, jogos: [] })).not.toThrow();
  });
  it('formato novo (total_com_nota/total_jogos_na_base) é aceito', () => {
    expect(() =>
      valida({
        total_com_nota: 2,
        total_jogos_na_base: 364,
        jogos: [jogo(1, 3), jogo(2)],
      })
    ).not.toThrow();
  });
  it('carregaNotas: formato antigo lê os jogos normalmente', () => {
    const { arq, limpar } = tempNotas({ total: 1, jogos: [jogo(7, 2, 'velha')] });
    try {
      expect(carregaNotas(arq).jogos).toEqual([{ id: 7, rating: 2, review: 'velha' }]);
    } finally {
      limpar();
    }
  });
});
