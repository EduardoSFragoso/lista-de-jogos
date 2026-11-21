/* ============================================================
   sync-db — sobe data/games.json pro Neon sem SQL Editor
   ------------------------------------------------------------
   Upsert idempotente (mesma lógica do seed.sql): cria/atualiza
   metadados, nunca mexe em rating/review.

   Uso (a partir de worker/):
     DATABASE_URL="postgresql://..." node sync-db.mjs
     (ou adicione DATABASE_URL ao ~/.bashrc / variáveis locais)

   O GitHub Actions chama este mesmo script em todo push que
   altera data/games.json (veja .github/workflows/sync-neon.yml).
   ============================================================ */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

const COLS = ['id', 'title', 'title_pt', 'year', 'platform', 'engine', 'company', 'genre', 'mode'];

/* Upsert em blocos de 50 jogos (450 parâmetros) */
const CHUNK = 50;

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

    await db(
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

/* executado direto? roda; importado (tests/vitest)? fica em standby */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
