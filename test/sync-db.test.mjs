/* Testes do sync-db — upsert em blocos com sql mockado (nada toca no banco).
   Rodar: npm test (vitest run). */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { main } = await import('../worker/sync-db.mjs');

afterEach(() => {
  vi.unstubAllEnvs();
});

/* sql fake: roteia consultas por texto. As guardas G1 (select id, title)
   e G2 (rating/review fora do JSON) respondem de `extras.titulos` e
   `extras.notas` (padrão: [] — sem divergência e sem notas). As demais
   consultas consomem `responses` em ordem (cíclico). Registra em `calls`
   APENAS as consultas da lista (mantém as asserções antigas e seus
   índices exatamente como eram); todas as consultas existem em `all`,
   cada uma como { texto, args }. */
function fakeSql(responses, extras = {}) {
  const calls = [];
  const all = [];
  let i = 0;
  const fn = (...args) => {
    const texto = typeof args[0] === 'string' ? args[0] : args[0].join(' ');
    all.push({ texto, args });
    if (texto.includes('select id, title')) {
      return Promise.resolve(extras.titulos ?? []);
    }
    if (texto.includes('rating is not null or review is not null')) {
      return Promise.resolve(extras.notas ?? []);
    }
    calls.push(args);
    const r = responses[i++ % responses.length];
    return Promise.resolve(Array.isArray(r) ? r : [r]);
  };
  fn.calls = calls;
  fn.all = all;
  return fn;
}

const escritas = (sql) =>
  sql.all.filter((c) => /insert into games|delete from games/.test(c.texto));

const game = (n) => ({ id: n + 1, title: `Jogo ${n + 1}` });
const json60 = Array.from({ length: 60 }, (_, i) => game(i));

describe('sync-db main()', () => {
  it('upsert em 2 blocos para 60 jogos e retorna totais', async () => {
    const games = json60;
    const sql = fakeSql([
      { n: 70 }, // upsert bloco 1 (ignorado)
      { n: 64 }, // upsert bloco 2 (ignorado)
      { n: 70 }, // count antes do tombstone
      [], // delete → nada fora
      { n: 64 }, // count final
      { n: 5 }, // sem engine/platform
    ]);
    const out = await main({ sql, games });
    expect(out.chunks).toBe(2);
    expect(out.total).toBe(64);
    expect(out.removed).toBe(0);
    expect(sql.calls).toHaveLength(6); // 2 upserts + count antes + tombstone + count + unset
    expect(sql.calls[0][0]).toMatch(/on conflict \(id\) do update/);
  });

  it('aceita objeto com .games e campo ausente vira null', async () => {
    const sql = fakeSql([{ n: 2 }]);
    const out = await main({ sql, games: { games: [{ id: 1, title: 'A' }, { id: 2 }] } });
    const params = sql.calls[0][1];
    expect(out.chunks).toBe(1);
    expect(out.total).toBe(2);
    expect(params).toHaveLength(18); // 2 jogos × 9 colunas
    expect(params[0]).toBe(1);
    expect(params[2]).toBeNull(); // year ausente
  });

  it('tombstone: ids fora do JSON são removidos quando a lista é confiável', async () => {
    const sql = fakeSql([
      { n: 70 }, // upsert 1
      { n: 64 }, // upsert 2
      { n: 70 }, // count antes → 60 ≥ 35, remoção autorizada
      [{ id: 100 }, { id: 101 }], // delete RETURNING
      { n: 64 }, // count final
      { n: 5 }, // sem engine/platform
    ]);
    const out = await main({ sql, games: json60 });
    const del = sql.calls.find((c) => String(c[0]).includes('delete from games'));
    expect(del).toBeTruthy();
    expect(out.removed).toBe(2);
  });

  it('tombstone: JSON truncado (menos da metade da base) NÃO apaga nada', async () => {
    const sql = fakeSql([{ n: 364 }]);
    const out = await main({
      sql,
      games: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ],
    });
    expect(sql.calls.every((c) => !String(c[0]).includes('delete from games'))).toBe(true);
    expect(out.removed).toBe(0);
  });
});

describe('G1 — guarda contra renumeração de ids', () => {
  const titulosBanco = (pares) => pares.map(([id, title]) => ({ id, title }));

  it('5 ids com título trocado → rejeita e NENHUMA escrita (insert/delete)', async () => {
    const sql = fakeSql([{ n: 5 }, { n: 5 }], {
      titulos: titulosBanco([
        [1, 'velho um'],
        [2, 'velho dois'],
        [3, 'velho tres'],
        [4, 'velho quatro'],
        [5, 'velho cinco'],
      ]),
    });
    const jogos = [1, 2, 3, 4, 5].map((i) => ({ id: i, title: `novo ${i}` }));
    await expect(main({ sql, games: jogos })).rejects.toThrow(/G1|renumera/i);
    expect(escritas(sql)).toHaveLength(0);
  });

  it('3 ids com título trocado (correção de typo) → passa normalmente', async () => {
    const sql = fakeSql([{ n: 66 }, { n: 5 }, [], { n: 5 }, { n: 0 }], {
      titulos: titulosBanco([
        [1, 'velho um'],
        [2, 'velho dois'],
        [3, 'velho tres'],
      ]),
    });
    const jogos = [
      { id: 1, title: 'novo um' },
      { id: 2, title: 'novo dois' },
      { id: 3, title: 'novo tres' },
      { id: 4, title: 'Jogo 4' },
      { id: 5, title: 'Jogo 5' },
    ];
    const out = await main({ sql, games: jogos });
    expect(out.chunks).toBe(1);
    expect(escritas(sql).filter((c) => c.texto.includes('insert'))).toHaveLength(1);
    expect(out.removed).toBe(0);
  });
});

describe('G2 — tombstone não apaga jogo com rating/review', () => {
  const baseNotas = (linhas) =>
    fakeSql(
      [
        { n: 70 }, // upsert 1
        { n: 64 }, // upsert 2
        { n: 70 }, // count antes → tombstone autorizado pela regra da metade
        [{ id: 100 }, { id: 101 }], // delete RETURNING (caso a remoção ocorra)
        { n: 64 },
        { n: 5 },
      ],
      { notas: linhas }
    );

  it('delete removeria id com rating → não apaga, erro, upsert permanece', async () => {
    const sql = baseNotas([{ id: 65, rating: 5, review: null }]);
    await expect(main({ sql, games: json60 })).rejects.toThrow(/G2|rating\/review/i);
    expect(escritas(sql).filter((c) => c.texto.includes('delete'))).toHaveLength(0);
    expect(escritas(sql).filter((c) => c.texto.includes('insert')).length).toBeGreaterThan(0);
  });

  it('delete removeria id com review → idem', async () => {
    const sql = baseNotas([{ id: 66, rating: null, review: 'ótimo jogo' }]);
    await expect(main({ sql, games: json60 })).rejects.toThrow(/G2|rating\/review/i);
    expect(escritas(sql).filter((c) => c.texto.includes('delete'))).toHaveLength(0);
    expect(escritas(sql).filter((c) => c.texto.includes('insert')).length).toBeGreaterThan(0);
  });

  it('delete removeria só ids SEM nota → apaga como hoje', async () => {
    const sql = baseNotas([]); // nenhum id com rating/review fora do JSON
    const out = await main({ sql, games: json60 });
    const del = sql.all.find((c) => c.texto.includes('delete from games'));
    expect(del).toBeTruthy();
    expect(out.removed).toBe(2);
  });
});

describe('SYNC_FORCE=1 libera as guardas de propósito', () => {
  it('SYNC_FORCE=1 libera caso G1 (5 títulos trocados) e escreve', async () => {
    vi.stubEnv('SYNC_FORCE', '1');
    const sql = fakeSql([{ n: 66 }, { n: 5 }, { n: 0 }], {
      titulos: [
        { id: 1, title: 'velho um' },
        { id: 2, title: 'velho dois' },
        { id: 3, title: 'velho tres' },
        { id: 4, title: 'velho quatro' },
        { id: 5, title: 'velho cinco' },
      ],
    });
    const jogos = [1, 2, 3, 4, 5].map((i) => ({ id: i, title: `novo ${i}` }));
    const out = await main({ sql, games: jogos });
    expect(escritas(sql).filter((c) => c.texto.includes('insert'))).toHaveLength(1);
    expect(out.chunks).toBe(1);
  });

  it('SYNC_FORCE=1 libera caso G2 (id com rating) e o tombstone apaga', async () => {
    vi.stubEnv('SYNC_FORCE', '1');
    const sql = fakeSql(
      [
        { n: 70 }, // upsert 1
        { n: 64 }, // upsert 2
        { n: 70 }, // count antes
        [{ id: 100 }, { id: 101 }], // delete RETURNING
        { n: 64 },
        { n: 5 },
      ],
      { notas: [{ id: 65, rating: 5, review: null }] }
    );
    const out = await main({ sql, games: json60 });
    expect(out.removed).toBe(2); // delete correu mesmo com a nota no id 65
  });
});
