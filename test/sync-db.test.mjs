/* Testes do sync-db — upsert em blocos com sql mockado (nada toca no banco).
   Rodar: npm test (vitest run). */
import { describe, expect, it } from 'vitest';

const { main } = await import('../worker/sync-db.mjs');

/* sql fake: aceita chamada tagged-template e db(query, params) e registra tudo */
function fakeSql(responses = [{ n: 7 }]) {
  const calls = [];
  let i = 0;
  const fn = (...args) => {
    calls.push(args);
    return Promise.resolve([responses[i++ % responses.length]]);
  };
  fn.calls = calls;
  return fn;
}

describe('sync-db main()', () => {
  it('upsert em 2 blocos para 60 jogos e retorna totais', async () => {
    const games = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, title: `Jogo ${i + 1}` }));
    const sql = fakeSql([{ n: 365 }, { n: 40 }]);
    const out = await main({ sql, games });
    expect(out).toEqual({ chunks: 2, total: 365 });
    expect(sql.calls).toHaveLength(4); // 2 upserts + count + unset
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
});
