/* Auditoria das capas vindas do Steam.
   Lê covers-run.log (linhas "OK <id> ... <- steam/<appid>"), consulta o
   appdetails da Steam pra cada appid e compara nome/ano com data/games.json.
   Saída: covers-audit.txt (+ console).
   Uso: node tools/audit-covers.mjs */
import fs from 'node:fs';

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const logText = fs.readFileSync('covers-run.log', 'utf8');
const steamMap = new Map(); // id -> appid
for (const m of logText.matchAll(/^OK\s+(\d+)\s+.*<- steam\/(\d+)/gm)) {
  steamMap.set(Number(m[1]), Number(m[2]));
}

const data = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const games = Array.isArray(data) ? data : data.games;
const byId = new Map(games.map((g) => [g.id, g]));

const bad = [];
const ok = [];
for (const [id, appid] of steamMap) {
  const g = byId.get(id);
  if (!g) continue;
  let name = null;
  let syear = null;
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`
    );
    const j = await res.json();
    const app = j[String(appid)];
    if (app && app.success) {
      name = app.data.name;
      const d = app.data.release_date?.date || '';
      const y = d.match(/(\d{4})/);
      if (y) syear = Number(y[1]);
    }
  } catch {
    /* rede: deixa como desconhecido */
  }
  const t = norm(g.title);
  const n = name ? norm(name) : '';
  const nameOk = n === t || n.startsWith(t) || t.startsWith(n) || n.includes(t) || t.includes(n);
  const yearOk = syear === null || Math.abs(syear - (g.year || 0)) <= 1;
  (nameOk && yearOk ? ok : bad).push({
    ...g,
    sname: name,
    syear,
    appid,
    why: nameOk ? 'ano' : 'nome',
  });
}

let out = `AUDITORIA DE CAPAS DO STEAM — ${steamMap.size} capas via Steam\n\n`;
out += `incertas: ${bad.length} | batem: ${ok.length}\n\nINCONSISTENTES:\n`;
for (const b of bad) {
  out += `  ${b.id} [${b.why}] nosso: "${b.title}" (${b.year ?? '—'}) | steam: "${b.sname}" (${b.syear ?? '—'}) appid=${b.appid}\n`;
}
fs.writeFileSync('covers-audit.txt', out);
console.log(out);
