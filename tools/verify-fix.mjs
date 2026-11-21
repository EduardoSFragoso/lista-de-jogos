/* Confere os APPID_FIX do fetch-covers: nome/ano de cada appid segundo a Steam.
   Uso: node tools/verify-fix.mjs */
import fs from 'node:fs';

const src = fs.readFileSync('tools/fetch-covers.mjs', 'utf8');
const block = src.match(/const APPID_FIX = \{([\s\S]*?)\};/)[1];
const fixes = [...block.matchAll(/^\s*(\d+):\s*(\d+|null)/gm)].map((m) => [
  Number(m[1]),
  m[2] === 'null' ? null : Number(m[2]),
]);

const data = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const games = Array.isArray(data) ? data : data.games;

for (const [id, appid] of fixes) {
  const g = games.find((x) => x.id === id);
  if (appid === null) {
    console.log(`${id} ${g?.title} -> SEM STEAM (sem capa)`);
    continue;
  }
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`
    );
    const j = await res.json();
    const d = j[String(appid)]?.data;
    console.log(
      `${id} ${g?.title} (${g?.year}) -> ${d ? `${d.name} (${d.release_date?.date})` : `appid ${appid} FALHOU`}`
    );
  } catch (e) {
    console.log(`${id} ${g?.title} -> ERRO ${e.message}`);
  }
}
