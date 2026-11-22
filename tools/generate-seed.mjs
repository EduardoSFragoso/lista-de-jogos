/* ============================================================
   generate-seed.mjs — regenera worker/seed.sql a partir de
   data/games.json (285 jogos). Uso:
     node tools/generate-seed.mjs
   O seed é idempotente: pode rodar no Neon quantas vezes
   quiser — ele insere OU atualiza cada jogo pelo id.
   Campos pessoais (rating, review) nunca são sobrescritos.
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const games = JSON.parse(readFileSync(join(root, 'data/games.json'), 'utf8')).games;

/** SQL literal: NULL, número ou string escapada ('' para aspas). */
function lit(v) {
  if (v === null || v === undefined || v === '') return 'null';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const META = ['title', 'title_pt', 'year', 'platform', 'engine', 'company', 'genre', 'mode'];

const out = [
  '-- ============================================================',
  '-- Lista de Jogos — seed inicial (gerado por tools/generate-seed.mjs)',
  '-- Rode no SQL Editor do Neon DEPOIS do schema.sql.',
  '-- Idempotente: rating/review pessoais nunca são sobrescritos.',
  '-- ============================================================',
  '',
  'begin;',
  '',
];

for (const g of games) {
  const values = ['id', ...META].map((c) => lit(g[c])).join(', ');
  const set = META.map((c) => `${c} = excluded.${c}`).join(', ');
  out.push(
    `insert into games (id, ${META.join(', ')}) values (${values})`,
    `  on conflict (id) do update set ${set};`
  );
}

out.push('', 'commit;', '');
writeFileSync(join(root, 'worker/seed.sql'), out.join('\n'));

console.log(`seed.sql gerado: ${games.length} jogos`);
