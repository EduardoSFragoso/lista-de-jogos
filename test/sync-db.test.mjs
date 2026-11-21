/* Testes do sync-db — upsert em blocos com sql mockado (nada toca no banco).
   Rodar: npm test (vitest run). */
import { describe, expect, it } from 'vitest';

const { main } = await import('../worker/sync-db.mjs');

/* sql fake: aceita chamada tagged-template e db(query, params) e registra tudo.
   Responde em ordem à lista `responses` (cíclico). */
function fakeSql(responses) {
  const calls = [];
  let i = 0;
  const fn = (...args) => {
    calls.push(args);
    const r = responses[i++ % responses.length];
    return Promise.resolve(Array.isArray(r) ? r : [r]);
  };
  fn.calls = calls;
  return fn;
}

const game = (n) => ({ id: n + 1, title: `Jogo ${n + 1}` });

describe('sync-db main()', () => {
  it('upsert em 2 blocos para 60 jogos e retorna totais', async () => {
    const games = Array.from({ length: 60 }, (_, i) => game(i));
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
    const games = Array.from({ length: 60 }, (_, i) => game(i));
    const sql = fakeSql([
      { n: 70 }, // upsert 1
      { n: 64 }, // upsert 2
      { n: 70 }, // count antes → 60 ≥ 35, remoção autorizada
      [{ id: 100 }, { id: 101 }], // delete RETURNING
      { n: 64 }, // count final
      { n: 5 }, // sem engine/platform
    ]);
    const out = await main({ sql, games });
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
