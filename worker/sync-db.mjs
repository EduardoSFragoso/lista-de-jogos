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
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL ausente: rode com DATABASE_URL="postgresql://..." node sync-db.mjs');
  process.exit(1);
}
const sql = neon(url);

const data = JSON.parse(fs.readFileSync(new URL('../data/games.json', import.meta.url), 'utf8'));
const games = Array.isArray(data) ? data : data.games;

const COLS = ['id', 'title', 'title_pt', 'year', 'platform', 'engine', 'company', 'genre', 'mode'];

/* Upsert em blocos de 50 jogos (450 parâmetros) */
const CHUNK = 50;
let done = 0;
for (let i = 0; i < games.length; i += CHUNK) {
  const chunk = games.slice(i, i + CHUNK);
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

  await sql(
    `insert into games (id, title, title_pt, year, platform, engine, company, genre, mode)
     values ${valuesSql}
     on conflict (id) do update set
       title = excluded.title, title_pt = excluded.title_pt, year = excluded.year,
       platform = excluded.platform, engine = excluded.engine, company = excluded.company,
       genre = excluded.genre, mode = excluded.mode`,
    params
  );
  done += chunk.length;
  console.log(`upsert: ${done}/${games.length}`);
}

const [count] = await sql`select count(*)::int as n from games`;
const [unset] =
  await sql`select count(*)::int as n from games where engine is null and platform is null`;
console.log(`pronto — total na base: ${count.n} | sem engine e sem platform: ${unset.n}`);
