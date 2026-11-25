/* ============================================================
   sync-db — sobe data/games.json pro Neon sem SQL Editor
   ------------------------------------------------------------
   Upsert idempotente (mesma lógica do seed.sql): cria/atualiza
   metadados, nunca mexe em rating/review.

   Uso (a partir de worker/):
     DATABASE_URL="postgresql://..." node sync-db.mjs
     (ou adicione DATABASE_URL ao ~/.bashrc / variáveis locais)

   Guardas de integridade (rating e review existem SÓ no Neon;
   games.json não os tem — a nota se perde ou muda de jogo se os ids mudarem):
     G1 — renumeração: se mais de 3 ids que existem dos dois lados
       mudaram de título (trim + minúsculas), não escreve nada e
       sai com erro: nota fica no id, título mudado com massa
       sugere ids renumerados.
     G2 — tombstone: se o delete removeria algum jogo com rating
       ou review, não apaga (o upsert já feito permanece) e sai
       com erro.
   As duas guardas podem ser liberadas DE PROPÓSITO com:
     SYNC_FORCE=1 DATABASE_URL="..." node sync-db.mjs

   O GitHub Actions chama este mesmo script em todo push que
   altera data/games.json (veja .github/workflows/sync-neon.yml).
   ============================================================ */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

const COLS = ['id', 'title', 'title_pt', 'year', 'platform', 'engine', 'company', 'genre', 'mode'];

/* Upsert em blocos de 50 jogos (450 parâmetros) */
const CHUNK = 50;

/* Limite de mudanças de título para ids existentes antes de suspeitar
   de renumeração (3 correções de typo cabem; 5 idem não). */
const MAX_MUDANCAS_TITULO = 3;

export async function main({ sql, games } = {}) {
  const url = process.env.DATABASE_URL;
  if (!sql && !url) {
    console.error(
      'DATABASE_URL ausente: rode com DATABASE_URL="postgresql://..." node sync-db.mjs'
    );
    process.exit(1);
  }
  const db = sql || neon(url);
  const data =
    games || JSON.parse(fs.readFileSync(new URL('../data/games.json', import.meta.url), 'utf8'));
  const list = Array.isArray(data) ? data : data.games;
  const forca = process.env.SYNC_FORCE === '1';
  const idNoJson = (g) => g.id !== null && g.id !== undefined;
  const normaliza = (t) =>
    String(t ?? '')
      .trim()
      .toLowerCase();

  /* G1 — guarda contra renumeração de ids: compara títulos de ids que
     existem na base E no JSON; mudança de título em massa sugere que a
     nota (rating/review, que mora no id) ficaria no jogo errado. */
  const banco = await db`select id, title from games`;
  const tituloDoJson = new Map(
    list
      .filter((g) => idNoJson(g) && g.title !== null && g.title !== undefined)
      .map((g) => [g.id, g.title])
  );
  const divergentes = (banco || []).flatMap((r) => {
    const novo = tituloDoJson.get(r.id);
    if (novo === undefined || r.title === null || r.title === undefined) return [];
    return normaliza(r.title) === normaliza(novo)
      ? []
      : [{ id: r.id, naBase: r.title, noJson: novo }];
  });
  if (divergentes.length > MAX_MUDANCAS_TITULO && !forca) {
    console.error(
      `G1 (renumeração?): ${divergentes.length} título(s) mudaram para ids que já existem` +
        ' na base — rating/review ficariam no jogo errado. NADA foi escrito (nem upsert, nem delete).'
    );
    for (const d of divergentes.slice(0, 3)) {
      console.error(`  id ${d.id}: na base "${d.naBase}" → no JSON "${d.noJson}"`);
    }
    console.error('Se a mudança for intencional, rode de novo com SYNC_FORCE=1.');
    throw new Error(
      `G1: ${divergentes.length} título(s) divergentes para ids existentes (suspeita de renumeração)`
    );
  }

  let done = 0;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const params = [];
    const valuesSql = chunk
      .map((g) => {
        const row = COLS.map((c) => {
          params.push(g[c] ?? null);
          return `$${params.length}`;
        });
        return `( ${row.join(', ')} )`;
      })
      .join(', ');

    /* Driver 1.x (≥1.2.1): chamada convencional db("SQL", params) foi
       descontinuada — usar a função .query("SQL", params). */
    await db.query(
      `insert into games (id, title, title_pt, year, platform, engine, company, genre, mode)
       values ${valuesSql}
       on conflict (id) do update set
         title = excluded.title, title_pt = excluded.title_pt, year = excluded.year,
         platform = excluded.platform, engine = excluded.engine, company = excluded.company,
         genre = excluded.genre, mode = excluded.mode`,
      params
    );
    done += chunk.length;
    console.log(`upsert: ${done}/${list.length}`);
  }

  /* Tombstone: jogos que saíram do JSON saem da base. Proteção contra
     JSON truncado acidental: se a lista caiu a menos da metade do que
     já existe na base (ou está vazia), pula a remoção e avisa. */
  const ids = list.map((g) => g.id).filter((v) => v !== null && v !== undefined);
  let removed = 0;
  const [before] = await db`select count(*)::int as n from games`;
  if (ids.length && ids.length >= Math.floor(before.n / 2)) {
    /* G2 — guarda do tombstone: rating/review não existem no JSON, então
       o JSON nunca "esquece" deles; um id a apagar com nota é suspeito. */
    const comNota = await db`select id, rating, review from games
        where not (id = any(${ids}))
          and (rating is not null or review is not null)`;
    const aApagar = comNota || [];
    if (aApagar.length && !forca) {
      const comRating = aApagar.filter((r) => r.rating !== null).length;
      const comReview = aApagar.filter((r) => r.review !== null).length;
      console.error(
        `G2 (tombstone): ${aApagar.length} jogo(s) seriam APAGADOS com dados de nota ` +
          `(${comRating} com rating, ${comReview} com review — ex. ids ${aApagar
            .slice(0, 5)
            .map((r) => r.id)
            .join(', ')}). O upsert deste sync permanece; nada foi apagado.`
      );
      console.error('Se a exclusão for intencional, rode de novo com SYNC_FORCE=1.');
      throw new Error(
        `G2: tombstone apagaria ${aApagar.length} jogo(s) com rating/review (ids: ${aApagar
          .slice(0, 5)
          .map((r) => r.id)
          .join(', ')})`
      );
    }
    const gone = await db`delete from games where not (id = any(${ids})) returning id`;
    removed = (gone || []).length;
    if (removed) console.log(`tombstone: ${removed} jogo(s) removido(s) da base`);
  } else {
    console.log(`tombstone: pulado (${ids.length} ids vs ${before.n} na base)`);
  }

  const [count] = await db`select count(*)::int as n from games`;
  const [unset] =
    await db`select count(*)::int as n from games where engine is null and platform is null`;
  console.log(
    `pronto — total na base: ${count.n} (tombstone: ${removed}) | sem engine e sem platform: ${unset.n}`
  );
  return { chunks: Math.ceil(list.length / CHUNK), total: count.n, removed };
}

/* executado direto? roda; importado (tests/vitest)? fica em standby.
   Guardas (G1/G2) falham com exceção — aqui viram exit 1. */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
