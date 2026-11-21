/* Caçada de capas — preenche assets/covers/<id>.<ext>
   Fontes: Steam CDN (jogos de PC) e Libretro Thumbnails (consoles retrô).
   Uso: node tools/fetch-covers.mjs [--only=1,49] */
import fs from 'node:fs';

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

/* nome libretro: variantes de região + troca do artigo. */
function libretroNames(title) {
  const bases = [title, title.replace(/:\s*/g, ' - ')];
  if (title.startsWith('Pokemon ')) bases.push(title.replace(/^Pokemon /, 'Pokemon - '));
  if (title.startsWith('The ')) bases.push(`${title.slice(4)}, The`);
  const suffixes = [
    ' (USA, Europe)',
    ' (USA)',
    ' (Europe)',
    ' (World)',
    ' (Japan, USA)',
    ' (Japan)',
    ' (En,Ja,Fr,De,Es,It)',
    ' (En,Fr,De,Es,It)',
    ' (EU)',
    ' (US)',
    '',
  ];
  const out = new Set();
  for (const b of bases) for (const s of suffixes) out.add(b + s);
  return [...out];
}

async function coverFromLibretro(systems, title, maps) {
  for (const sys of systems) {
    const map = maps.get(sys);
    if (!map) continue;
    const bases = new Set([
      title,
      title.replace(/:\s*/g, ' - '),
      title.endsWith('.') ? title.slice(0, -1) : title,
    ]);
    if (title.startsWith('The ')) bases.add(`${title.slice(4)}, The`);
    if (title.startsWith('Pokemon ')) bases.add(title.replace(/^Pokemon /, 'Pokemon - '));
    /* 1) match exato por nome normalizado; 2) prefixo (pegando o mais
       curto, que tende a ser o jogo em vez de hack/remake); 3) prefixo
       com espaço (jogo VS edição, ex. 'Mario Kart 8' em 'Mario Kart 8
       Deluxe'). */
    for (const base of bases) {
      const n = norm(base);
      if (map.has(n)) return { ...map.get(n), via: `libretro/${sys}` };
    }
    for (const base of bases) {
      const n = norm(base);
      let best = null;
      for (const key of map.keys()) {
        if (key.startsWith(n) && (best === null || key.length < best.length)) best = key;
      }
      if (best) return { ...map.get(best), via: `libretro/${sys}` };
    }
    for (const base of bases) {
      const n = norm(base);
      for (const key of map.keys()) {
        if (key.startsWith(`${n} `)) return { ...map.get(key), via: `libretro/${sys}` };
      }
    }
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

/* Capa da infobox da Wikipédia (PageImages, original = alta resolução).
   Último recurso pra clássicos fora do Steam (Diablo, AoE, Monkey Island...).
   Throttle de 400ms + retry no 429: a API da Wikipédia corta cliente veloz. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function wikiSearchUrl(t, wantThumb) {
  const piprop = wantThumb ? 'thumbnail&pithumbsize=640' : 'original';
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1' +
    '&prop=pageimages&piprop=' +
    piprop +
    '&titles=' +
    encodeURIComponent(t);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
      const j = safeParse(await res.text());
      const page = Object.values(j?.query?.pages || {})[0];
      return page?.original?.source || page?.thumbnail?.source || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function coverFromWikipedia(title, year) {
  const candidates = [title];
  if (!/\(video game\)/i.test(title)) candidates.push(`${title} (video game)`);
  if (year) candidates.push(`${title} (${year} video game)`);
  for (const t of candidates) {
    await sleep(800);
    const src = await wikiSearchUrl(t, false);
    if (!src) continue;
    const img = await fetchBin(src, 20000);
    /* cover de verdade costuma ter dezenas de KB; < 8KB eh logo/icone */
    if (img && img.size >= 8000) return { ...img, via: `wikipedia/${t}` };
  }
  /* segunda passada: thumbnail 640px (quando o artigo só tem pageimage pequena) */
  for (const t of candidates) {
    await sleep(800);
    const src = await wikiSearchUrl(t, true);
    if (!src) continue;
    const img = await fetchBin(src, 20000);
    if (img && img.size >= 6000) return { ...img, via: `wikipedia-thumb/${t}` };
  }
  return null;
}

async function main() {
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
    if (!got) got = await coverFromWikipedia(title, g.year);
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

main();
