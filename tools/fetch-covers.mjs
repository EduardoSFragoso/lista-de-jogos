/* Caçada de capas — preenche assets/covers/<id>.<ext>
   Fontes: Steam CDN (PC), Libretro Thumbnails e xero/boxart (consoles
   retrô), SteamGridDB, IGDB e TheGamesDB (genéricos).
   Uso: node tools/fetch-covers.mjs [--only=1,49] */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = 'assets/covers';
const REPORT = 'covers-report.txt';

/* Correções manuais de título por id (melhoram o match nas fontes). */
/* Appid correto do Steam quando a busca genérica erra (auditoria: tools/audit-covers.mjs).
   null = jogo não existe no Steam — não busca (evita pegar uma sequência/remake errado). */
const APPID_FIX = {
  30: null, // The Secret of Monkey Island (1990) — só a SE no Steam; você não jogou a SE
  34: null, // Age of Empires (1997) — só a DE no Steam; você não jogou a DE
  40: null, // Doom (1993) — no Steam só o pack "DOOM + DOOM II"
  54: null, // Dark Souls (2011) — original delistado; você não jogou o Remastered
  264: null, // Croc (PS1) — pega via Libretro, não via Steam
  164: 49520, // Borderlands 2 (você jogou o 2)
  170: 236110, // Dungeon Defenders II
  196: 582010, // Monster Hunter: World
  292: 20920, // The Witcher 2: Assassins of Kings
  293: 292030, // The Witcher 3: Wild Hunt
  294: 50620, // Darksiders (original)
  24: null, // Diablo (1996) — busca estava pegando Diablo IV
  47: null, // The Sims (2000) — pegava Sims 4
  51: null, // TERA (delistada) — pegava Teravit
  96: null, // Ragnarok Online — pegava RO2
  101: null, // Rayman (1995) — pegava Legends
  162: 57300, // Amnesia: The Dark Descent
  186: null, // Injustice: Gods Among Us — pegava Injustice 2
  192: 241930, // Middle-earth: Shadow of Mordor (jogo separado do Shadow of War, id 286)
  286: 356190, // Middle-earth: Shadow of War
  181: 434730, // Half Dead (1)
  287: 914260, // HALF DEAD 2
  288: 1520380, // HALF DEAD 3
  214: 1487390, // ANVIL
  246: 851850, // Dragon Ball Z: Kakarot
  197: 261570, // Ori and the Blind Forest
  210: 20900, // The Witcher: Enhanced Edition
  215: null, // Gears of War (2006) — pegava E-Day
  216: null, // Overwatch (2016) — pegava OW2
  218: null, // Call of Duty (2003) — pegava MW2 2022
  219: null, // Assassin's Creed (2007) — pegava Odyssey
  220: null, // Titanfall (2014) — pegava Titanfall 2
  222: 47810, // Dragon Age: Origins Ultimate
  225: null, // Need for Speed (1994) — pegava NFS 2020
  231: null, // Corsairs (1999) — pegava Corsairs Legacy
  243: null, // Maniac Mansion (1987) — versão de 2017 não oficial
  262: null, // Alone in the Dark (1992) — pegava o remake 2024
  277: null, // Commandos (1998) — pegava Origins
  279: null, // White Day (2001) — pegava o remake 2017
  283: null, // Perfect World (2006) — pegava versão 2024
  88: null, // Wolfenstein (2009) — busca no Steam pegava Youngblood; SGDB resolve
};

const TITLE_FIX = {
  1: 'Final Fantasy',
  154: 'The Legend of Zelda',
  249: 'Shadow of the Colossus',
  101: 'Rayman',
  248: 'Mega Man X5',
  290: 'Mega Man X6',
  234: 'Sonic the Hedgehog',
  315: 'Legend of Zelda, The - Ocarina of Time',
  42: 'Final DOOM', // Evilution
  43: 'Final DOOM', // Plutonia Experiment
  45: 'DOOM', // (2016)
  79: 'God of War', // (2018) — ano resolve contra o 2005
  88: 'Wolfenstein', // (2009)
  89: 'Counter-Strike', // 1.6
  119: "Freddy Fazbear's Pizzeria Simulator", // Five Nights at Freddy's: PS é o nome no Steam/SGDB
  152: 'Final Fantasy Record Keeper', // mobile; SGDB tem sob o nome exato
  190: 'IdleOn: The Idle RPG', // Steam/SGDB não usam o "Legends of"
  316: 'Legend of Zelda, The - A Link to the Past',
  317: 'Legend of Zelda, The - Majoras Mask',
  318: 'Legend of Zelda, The - Breath of the Wild',
  326: 'Pokemon White Version 2',
  126: 'Pokemon Red Version',
  127: 'Pokemon Gold Version',
  128: 'Pokemon Ruby Version',
  129: 'Pokemon Emerald Version',
  130: 'Pokemon FireRed Version',
  131: 'Pokemon Diamond Version',
  132: 'Pokemon Platinum Version',
  133: 'Pokemon HeartGold Version',
  134: 'Pokemon Black Version',
  135: 'Pokemon Black Version 2',
  136: 'Pokemon X',
  137: 'Pokemon Omega Ruby',
  138: 'Pokemon Sun',
  139: 'Pokemon Ultra Sun',
  140: "Pokemon Let's Go Pikachu",
  141: 'Pokemon Sword',
  142: 'Pokemon Brilliant Diamond',
  143: 'Pokemon Legends: Arceus',
  144: 'Pokemon Scarlet',
  145: 'Pokemon Legends Z-A',
};

const SYSLIB = {
  NES: 'Nintendo - Nintendo Entertainment System',
  SNES: 'Nintendo - Super Nintendo Entertainment System',
  PS1: 'Sony - PlayStation',
  PS2: 'Sony - PlayStation 2',
  PS3: 'Sony - PlayStation 3',
  PS4: 'Sony - PlayStation 4',
  'Sega Genesis': 'Sega - Mega Drive - Genesis',
  'Mega Drive': 'Sega - Mega Drive - Genesis',
  'Game Boy': 'Nintendo - Game Boy',
  'Game Boy Advance': 'Nintendo - Game Boy Advance',
  'Game Boy Color': 'Nintendo - Game Boy Color',
  N64: 'Nintendo - Nintendo 64',
  'Nintendo DS': 'Nintendo - Nintendo DS',
  'Nintendo 3DS': 'Nintendo - Nintendo 3DS',
  GameCube: 'Nintendo - GameCube',
  Wii: 'Nintendo - Wii',
  'Wii U': 'Nintendo - Wii U',
  PSP: 'Sony - PlayStation Portable',
  Arcade: 'FBNeo - Arcade Games',
};

/* ---------------- xero/boxart (fonte extra retro, coleção no GitHub) ----------------
   Pastas por sistema com nomes No-Intro (mesmo esquema do Libretro):
   NES, SNES, MD, MS, SEGACD, GB, GBC, GBA, GG, PSX, ARCADE, NEOGEO…
   Sem pastas para N64/GameCube/Wii/DS — esses só existem no Libretro. */
const BOXART = {
  NES: 'NES',
  SNES: 'SNES',
  PS1: 'PSX',
  'Sega Genesis': 'MD',
  'Mega Drive': 'MD',
  'Master System': 'MS',
  'Sega CD': 'SEGACD',
  'Game Boy': 'GB',
  'Game Boy Color': 'GBC',
  'Game Boy Advance': 'GBA',
  'Game Gear': 'GG',
  Arcade: 'ARCADE',
  'Neo Geo': 'NEOGEO',
  'Atari 2600': 'ATARI2600',
  'Atari ST': 'ATARIST',
  'PC Engine': 'PCE',
  'Sega 32X': 'THIRTYTWOX',
  'Virtual Boy': 'VB',
};

function boxartFolders(platform) {
  const p = platform || '';
  const out = new Set();
  if (/\bnes\b/i.test(p)) out.add(BOXART.NES); /* \b evita 'geNESis' */
  if (/snes/i.test(p)) out.add(BOXART.SNES);
  if (/ps1/i.test(p)) out.add(BOXART.PS1);
  if (/(mega drive|genesis)/i.test(p)) out.add(BOXART['Sega Genesis']);
  if (/master system/i.test(p)) out.add(BOXART['Master System']);
  if (/(sega cd|mega-?cd)/i.test(p)) out.add(BOXART['Sega CD']);
  if (/game boy advance/i.test(p)) out.add(BOXART['Game Boy Advance']);
  else if (/game boy color/i.test(p)) out.add(BOXART['Game Boy Color']);
  else if (/game boy/i.test(p)) out.add(BOXART['Game Boy']);
  if (/game gear/i.test(p)) out.add(BOXART['Game Gear']);
  if (/arcade/i.test(p)) out.add(BOXART.Arcade);
  if (/neo-?geo/i.test(p)) out.add(BOXART['Neo Geo']);
  if (/atari 2600/i.test(p)) out.add(BOXART['Atari 2600']);
  if (/atari st/i.test(p)) out.add(BOXART['Atari ST']);
  if (/pc engine/i.test(p)) out.add(BOXART['PC Engine']);
  if (/32x/i.test(p)) out.add(BOXART['Sega 32X']);
  if (/virtual boy/i.test(p)) out.add(BOXART['Virtual Boy']);
  return [...out];
}

/* plataformas tolerantes: cada nome pode ter N sistemas libretro. */
function libretroSystems(platform) {
  const p = platform || '';
  const sys = new Set();
  const add = (name) => SYSLIB[name] && sys.add(SYSLIB[name]);
  if (p.includes('NES')) add('NES');
  if (p.includes('SNES')) add('SNES');
  if (/PS1/i.test(p)) add('PS1');
  if (/PS2/i.test(p)) add('PS2');
  if (/PS3/i.test(p)) add('PS3');
  if (/PS4|PS5/i.test(p)) add('PS4');
  if (/PSP/i.test(p)) add('PSP');
  if (/(Mega Drive|Genesis)/i.test(p)) add('Sega Genesis');
  if (p === 'Game Boy') add('Game Boy');
  if (/Game Boy Advance/i.test(p)) add('Game Boy Advance');
  if (/Game Boy Color/i.test(p)) add('Game Boy Color');
  if (/N64/i.test(p)) add('N64');
  if (/Nintendo DS/i.test(p) && !/3DS/i.test(p)) add('Nintendo DS');
  if (/3DS/i.test(p)) add('Nintendo 3DS');
  if (/GameCube/i.test(p)) add('GameCube');
  if (/Wii U/i.test(p)) add('Wii U');
  else if (/Wii/i.test(p)) add('Wii');
  if (/Arcade/i.test(p)) add('Arcade');
  return [...sys];
}

const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const UA = 'lista-jogos-covers/1.0 (página pessoal; contato: github.com/EduardoSFragoso)';

async function fetchBin(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/') || type.includes('svg') || buf.length < 2000) return null;
    return { buf, ext: type.includes('png') ? 'png' : 'jpg', size: buf.length };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function steamSearch(title) {
  const url = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(title)}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return null;
    const hit =
      list.find((x) => norm(x.name) === norm(title)) ||
      list.find((x) => norm(x.name).startsWith(norm(title)));
    return hit ? hit.appid : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* Variantes de título para o match (dois-pontos → traço, artigo pro fim). */
function titleBases(title) {
  const bases = new Set([
    title,
    title.replace(/:\s*/g, ' - '),
    title.endsWith('.') ? title.slice(0, -1) : title,
  ]);
  if (title.startsWith('The ')) bases.add(`${title.slice(4)}, The`);
  if (title.startsWith('Pokemon ')) bases.add(title.replace(/^Pokemon /, 'Pokemon - '));
  return bases;
}

/* Match por nome em 3 estágios: 1) exato por nome normalizado;
   2) prefixo (pegando o mais curto — tende a ser o jogo em vez de
   hack/remake); 3) prefixo com espaço (jogo VS edição, ex. 'Mario
   Kart 8' em 'Mario Kart 8 Deluxe'). Serve p/ Libretro e xero/boxart,
   cujos arquivos usam o mesmo padrão No-Intro. */
function matchNamed(map, bases) {
  for (const base of bases) {
    const n = norm(base);
    if (map.has(n)) return map.get(n);
  }
  for (const base of bases) {
    const n = norm(base);
    let best = null;
    for (const key of map.keys()) {
      if (key.startsWith(n) && (best === null || key.length < best.length)) best = key;
    }
    if (best) return map.get(best);
  }
  for (const base of bases) {
    const n = norm(base);
    for (const key of map.keys()) {
      if (key.startsWith(`${n} `)) return map.get(key);
    }
  }
  return null;
}

async function coverFromLibretro(systems, title, maps) {
  for (const sys of systems) {
    const map = maps.get(sys);
    if (!map) continue;
    const hit = matchNamed(map, titleBases(title));
    if (hit) return { ...hit, via: `libretro/${sys}` };
  }
  return null;
}

async function coverFromBoxart(folders, title, maps) {
  for (const folder of folders) {
    const map = maps.get(folder);
    if (!map) continue;
    const hit = matchNamed(map, titleBases(title));
    if (hit) return { ...hit, via: `boxart/${folder}` };
  }
  return null;
}

async function coverFromSteam(title, id) {
  if (APPID_FIX[id] === null) return null;
  const appid = APPID_FIX[id] || (await steamSearch(title));
  if (!appid) return null;
  for (const img of ['library_600x900.jpg', 'header.jpg']) {
    const got = await fetchBin(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${img}`);
    if (got) return { ...got, via: `steam/${appid}` };
  }
  return null;
}

/* Throttle compartilhado das fontes (SGDB/IGDB: 250ms entre downloads). */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------------- SteamGridDB (arte vertical comunitária) ----------------
   Precisa da API key (gratuita): steamgriddb.com → Preferences → API.
   Lê de SGDB_API_KEY no ambiente ou do arquivo tools/.sgdb-key (gitignored). */
/* Normaliza p/ comparar nomes cross-fonte: minusculas, sem acentos nem nao-alfanumericos. */
const normKey = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

function sgdbKey() {
  if (process.env.SGDB_API_KEY) return process.env.SGDB_API_KEY;
  const keyPath = new URL('./.sgdb-key', import.meta.url);
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
  return null;
}

/* ---------------- IGDB (cobertura ampla, capas 2:3 de alta qualidade) ----------------
   Credenciais do Twitch em tools/.igdb.json ou env IGDB_CLIENT_ID/IGDB_CLIENT_SECRET. */
function igdbCreds() {
  if (process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) {
    return { id: process.env.IGDB_CLIENT_ID, secret: process.env.IGDB_CLIENT_SECRET };
  }
  const p = new URL('./.igdb.json', import.meta.url);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

let igdbToken = null;
async function getIgdbToken() {
  if (igdbToken) return igdbToken;
  const tokenPath = new URL('./.igdb-token.json', import.meta.url);
  if (fs.existsSync(tokenPath)) {
    const cached = safeParse(fs.readFileSync(tokenPath, 'utf8'));
    if (cached?.token && cached.expires > Date.now()) return (igdbToken = cached.token);
  }
  const creds = igdbCreds();
  if (!creds) return null;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${creds.id}&client_secret=${creds.secret}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const j = await safeParse(await res.text());
  if (!j?.access_token) return null;
  igdbToken = j.access_token;
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({ token: igdbToken, expires: Date.now() + (j.expires_in - 3600) * 1000 })
  );
  return igdbToken;
}

async function coverFromIGDB(title, year) {
  const token = await getIgdbToken().catch(() => null);
  if (!token) return null;
  const target = normKey(title);
  const h = { 'Client-ID': igdbCreds().id, Authorization: `Bearer ${token}` };
  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: h,
      body: `f name,cover.image_id,first_release_date; l 10; w name ~ "${title.replace(/"/g, '')}" & version_title = null;`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const hits = await safeParse(await res.text());
    if (!Array.isArray(hits)) return null;
    const withCover = hits.filter((g) => g.cover?.image_id && g.name);
    const exact = withCover.filter((g) => normKey(g.name) === target);
    const pool = exact.length ? exact : withCover;
    if (!pool.length) return null;
    let best = pool[0];
    if (year) {
      const y = year;
      best = pool.sort((a, b) => {
        const ya = a.first_release_date
          ? new Date(a.first_release_date * 1000).getUTCFullYear()
          : 9999;
        const yb = b.first_release_date
          ? new Date(b.first_release_date * 1000).getUTCFullYear()
          : 9999;
        return Math.abs(ya - y) - Math.abs(yb - y);
      })[0];
    }
    /* t_720p: até 720px de altura, proporção 2:3 preservada */
    const url = `https://images.igdb.com/igdb/image/upload/t_720p/${best.cover.image_id}.jpg`;
    await sleep(250);
    const img = await fetchBin(url, 20000);
    if (img && img.size >= 6000) return { ...img, via: `igdb/${best.id}` };
    return null;
  } catch {
    return null;
  }
}

async function coverFromSGDB(title, year) {
  const key = sgdbKey();
  if (!key) return null;
  const target = normKey(title);
  const h = { Authorization: `Bearer ${key}`, 'User-Agent': 'listajogos/1.0' };
  try {
    const res = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
      { headers: h, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const j = await safeParse(await res.text());
    const hits = j?.data || [];
    if (!hits.length) return null;
    const relYear = (r) =>
      r.release_date ? new Date(r.release_date * 1000).getUTCFullYear() : null;
    const exact = hits.filter((r) => normKey(r.name) === target);
    const byYear = year ? exact.filter((r) => Math.abs((relYear(r) ?? 9999) - year) <= 1) : [];
    const best =
      byYear[0] || exact[0] || hits.find((r) => normKey(r.name).startsWith(target)) || null;
    if (!best) return null;
    await sleep(250);
    const gRes = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${best.id}`, {
      headers: h,
      signal: AbortSignal.timeout(12000),
    });
    if (!gRes.ok) return null;
    const gj = await safeParse(await gRes.text());
    const grids = (gj?.data || [])
      .filter((r) => r.width && r.height && r.height > r.width) /* só verticais */
      .sort(
        (a, b) =>
          Math.abs(a.width - 600) +
          Math.abs(a.height - 900) -
          (Math.abs(b.width - 600) + Math.abs(b.height - 900))
      );
    if (!grids.length) return null;
    const img = await fetchBin(grids[0].url, 20000);
    if (img && img.size >= 6000) return { ...img, via: `steamgriddb/${best.id}` };
    return null;
  } catch {
    return null;
  }
}

/* ---------------- TheGamesDB (último recurso — limite de 1000 req/mês) ----------------
   Chave em tools/.tgdb-key ou env TGDB_API_KEY. 1 request por jogo (busca já traz boxart). */
function tgdbKey() {
  if (process.env.TGDB_API_KEY) return process.env.TGDB_API_KEY;
  const keyPath = new URL('./.tgdb-key', import.meta.url);
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
  return null;
}

async function coverFromTGDB(title, year) {
  const key = tgdbKey();
  if (!key) return null;
  const target = normKey(title);
  try {
    const res = await fetch(
      `https://api.thegamesdb.net/v1/Games/ByGameName?apikey=${key}&name=${encodeURIComponent(title)}&include=boxart`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return null;
    const j = await safeParse(await res.text());
    const games = j?.data?.games || [];
    if (!games.length) return null;
    const boxart = j.include?.boxart || {};
    const base = boxart.base_url || {};
    const relYear = (g) => (g.released ? new Date(g.released).getUTCFullYear() : null);
    const scored = games
      .map((g) => {
        const nk = normKey(g.game_title || '');
        let score = 99;
        if (nk === target) score = 0;
        else if (nk.startsWith(target)) score = 1;
        else if (target.startsWith(nk)) score = 2;
        if (year && relYear(g) !== null)
          score = Math.min(score, Math.abs(relYear(g) - year) <= 1 ? 0 : 5);
        return { g, score };
      })
      .sort((a, b) => a.score - b.score);
    for (const { g } of scored) {
      const arts = Object.values(boxart.data || {}).filter(
        (a) => a.game === g.id && a.type === 'front' && a.width < a.height
      );
      if (!arts.length) continue;
      for (const a of arts) {
        for (const root of [base.original, base.small]) {
          if (!root) continue;
          await sleep(250);
          const img = await fetchBin(root + a.filename, 20000);
          if (img && img.size >= 6000) return { ...img, via: `thegamesdb/${g.id}` };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='));
  const onlySet = only ? new Set(only.slice(7).split(',').map(Number)) : null;
  const data = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
  const games = Array.isArray(data) ? data : data.games;
  fs.mkdirSync(OUT, { recursive: true });

  /* listagens dos sistemas (1 request do GitHub API por sistema) */
  const needed = new Set();
  for (const g of games) for (const s of libretroSystems(g.platform)) needed.add(s);
  const libmaps = new Map();
  for (const sys of needed) {
    const repo = sys.replaceAll(' ', '_');
    const slug = `${repo}.json`;
    let map = null;
    let entries = null;
    if (fs.existsSync(slug)) {
      entries = JSON.parse(fs.readFileSync(slug, 'utf8'));
      console.log(`lista (cache) ${sys}: ${entries.length} arquivos`);
    } else {
      try {
        const r = await fetch(
          `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master:Named_Boxarts`
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        entries = (j.tree || []).filter((f) => f.path.endsWith('.png'));
        fs.writeFileSync(slug, JSON.stringify(entries));
        console.log(`lista ${sys}: ${entries.length} capas`);
      } catch (e) {
        console.log(`sem lista ${sys}: ${e.message}`);
        continue;
      }
    }
    map = new Map();
    for (const f of entries) {
      const normName = norm(f.path.replace(/\.png$/, ''));
      if (!map.has(normName) || f.path.length < map.get(normName).path.length) {
        map.set(normName, {
          path: f.path,
          get() {
            return fetchBin(
              `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts/${encodeURIComponent(f.path)}`
            );
          },
        });
      }
    }
    libmaps.set(sys, map);
  }

  /* listagens das pastas do xero/boxart (1 request por pasta, cache json) */
  const bxneeded = new Set();
  for (const g of games) for (const f of boxartFolders(g.platform)) bxneeded.add(f);
  const bxmaps = new Map();
  for (const folder of bxneeded) {
    let entries = null;
    if (fs.existsSync(`${folder}.json`)) {
      entries = JSON.parse(fs.readFileSync(`${folder}.json`, 'utf8'));
      console.log(`boxart lista (cache) ${folder}: ${entries.length} arquivos`);
    } else {
      try {
        const r = await fetch(`https://api.github.com/repos/xero/boxart/git/trees/main:${folder}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        entries = (j.tree || []).filter((f) => f.path.endsWith('.png'));
        fs.writeFileSync(`${folder}.json`, JSON.stringify(entries));
        console.log(`boxart lista ${folder}: ${entries.length} capas`);
      } catch (e) {
        console.log(`boxart sem lista ${folder}: ${e.message}`);
        continue;
      }
    }
    const map = new Map();
    for (const f of entries) {
      const normName = norm(f.path.replace(/\.png$/, ''));
      if (!map.has(normName) || f.path.length < map.get(normName).path.length) {
        map.set(normName, {
          path: f.path,
          get() {
            return fetchBin(
              `https://raw.githubusercontent.com/xero/boxart/main/${folder}/${encodeURIComponent(f.path)}`
            );
          },
        });
      }
    }
    bxmaps.set(folder, map);
  }

  const missing = [];
  let done = 0;
  const queue = games.filter(
    (g) =>
      (!onlySet || onlySet.has(g.id)) && !fs.readdirSync(OUT).some((f) => f.startsWith(`${g.id}.`))
  );
  const worker = async (g) => {
    const title = TITLE_FIX[g.id] || g.title;
    let got = null;
    const plats = g.platform || '';
    const isMapMod = /warcraft iii|mapa custom/i.test(plats);
    if (plats.includes('PC') && !isMapMod) got = await coverFromSteam(title, g.id);
    if (!got) got = await coverFromLibretro(libretroSystems(plats), title, libmaps);
    if (!got) got = await coverFromBoxart(boxartFolders(plats), title, bxmaps);
    if (!got) got = await coverFromSGDB(title, g.year);
    if (!got) got = await coverFromIGDB(title, g.year);
    if (!got) got = await coverFromTGDB(title, g.year);
    if (got) {
      if (got.buf) {
        /* veio pronto (Steam) */
        fs.writeFileSync(`${OUT}/${g.id}.${got.ext}`, got.buf);
        console.log(`OK   ${g.id} ${g.title} <- ${got.via} (${got.buf.length}b)`);
      } else {
        /* veio da lista do libretro: baixa o PNG de verdade */
        const img = typeof got.get === 'function' ? await got.get() : null;
        if (img) {
          fs.writeFileSync(`${OUT}/${g.id}.${img.ext}`, img.buf);
          console.log(`OK   ${g.id} ${g.title} <- ${got.via} (${img.buf.length}b)`);
        } else {
          missing.push(`${g.id} | ${g.title} (${plats || '—'})`);
          console.log(`MISS ${g.id} ${g.title}`);
        }
      }
    } else {
      missing.push(`${g.id} | ${g.title} (${plats || '—'})`);
      console.log(`MISS ${g.id} ${g.title}`);
    }
    done++;
    if (done % 25 === 0) console.log(`--- ${done}/${queue.length}`);
  };
  for (const g of queue) await worker(g); /* sequencial deixa o Steam de boa */
  fs.writeFileSync(
    REPORT,
    `${queue.length - missing.length} capas baixadas\n\nSEM CAPA (${missing.length}):\n${missing.join('\n')}\n`
  );
  console.log(`FIM: ${queue.length - missing.length} capas, ${missing.length} sem capa.`);
}

/* exportado para os testes (vitest) — vars puras, sem rede */
export { norm, normKey, libretroSystems, boxartFolders, titleBases, matchNamed };

/* executado direto? roda; importado (tests/vitest)? fica em standby */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
