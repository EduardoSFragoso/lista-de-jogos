/* Lote 2026-11-20: correções de jogos errados, capas erradas e entradas novas.
   Uso: node tools/batch-2026-11-20.mjs */
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const arr = Array.isArray(data) ? data : data.games;
const byId = new Map(arr.map((g) => [g.id, g]));
let max = Math.max(...arr.map((x) => x.id));
const nextId = () => ++max;

/* patch(fields) renomeia/atualiza; add(fields) cria entrada nova */
function patch(id, fields) {
  Object.assign(byId.get(id), fields);
  delete byId.get(id)._obs;
}
function add(fields) {
  const g = { id: nextId(), rating: null, title_pt: null, ...fields };
  arr.push(g);
  byId.set(g.id, g);
  return g.id;
}
const NINTENDO = 'Proprietária (Nintendo)';

/* --- jogos errados: renomear p/ o que você jogou --- */
patch(259, {
  title: 'Super Bomberman 3',
  year: 1995,
  platform: 'SNES',
  company: 'Hudson Soft',
  genre: 'Ação / maze',
  mode: 'Single / Multiplayer',
});
add({
  title: 'Super Bomberman 4',
  year: 1996,
  platform: 'SNES',
  company: 'Hudson Soft',
  genre: 'Ação / maze',
  mode: 'Single / Multiplayer',
});
patch(248, {
  title: 'Mega Man X5',
  year: 2000,
  platform: 'PS1',
  company: 'Capcom',
  genre: 'Ação / plataformas',
  mode: 'Single-player',
});
add({
  title: 'Mega Man X6',
  year: 2001,
  platform: 'PS1',
  company: 'Capcom',
  genre: 'Ação / plataformas',
  mode: 'Single-player',
});
patch(235, {
  title: 'Super Smash Bros. Melee',
  year: 2001,
  platform: 'GameCube',
  company: 'Nintendo / HAL Laboratory',
  genre: 'Luta (crossover)',
  mode: 'Single / Multiplayer',
});
add({
  title: 'Super Smash Bros. Ultimate',
  year: 2018,
  platform: 'Switch',
  company: 'Nintendo / Sora Ltd.',
  genre: 'Luta (crossover)',
  mode: 'Single / Multiplayer',
});
patch(164, {
  title: 'Borderlands 2',
  year: 2012,
  platform: 'PC / Console',
  engine: 'Unreal Engine 3',
  company: 'Gearbox Software',
  genre: 'FPS (looter)',
  mode: 'Single / Co-op',
});
patch(105, {
  title: 'Driver 2',
  year: 2000,
  platform: 'PS1',
  company: 'Reflections Interactive',
  genre: 'Ação / direção',
  mode: 'Single-player',
});
patch(170, {
  title: 'Dungeon Defenders II',
  year: 2017,
  platform: 'PC',
  engine: 'Unreal Engine 3',
  company: 'Chromatic Games',
  genre: 'Tower defense / ARPG',
  mode: 'Single / Co-op',
});
patch(196, {
  title: 'Monster Hunter: World',
  year: 2018,
  platform: 'PC / Console',
  engine: 'MT Framework',
  company: 'Capcom',
  genre: 'Action RPG (caça)',
  mode: 'Single / Co-op',
});
patch(255, {
  title: 'Strider 2',
  year: 2000,
  platform: 'PS1',
  company: 'Capcom',
  genre: 'Ação / plataformas',
  mode: 'Single-player',
});
patch(276, {
  title: 'Tekken 3',
  year: 1998,
  platform: 'PS1',
  company: 'Namco',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});

/* --- novos: Steam (PC) --- */
add({
  title: 'The Witcher 2: Assassins of Kings',
  year: 2011,
  platform: 'PC',
  engine: 'REDengine 2',
  company: 'CD Projekt RED',
  genre: 'RPG',
  mode: 'Single-player',
});
add({
  title: 'The Witcher 3: Wild Hunt',
  year: 2015,
  platform: 'PC / Console',
  engine: 'REDengine 3',
  company: 'CD Projekt RED',
  genre: 'RPG (mundo aberto)',
  mode: 'Single-player',
});
add({
  title: 'Darksiders',
  year: 2010,
  platform: 'PC / Console',
  company: 'Vigil Games',
  genre: 'Hack and slash',
  mode: 'Single-player',
});
add({
  title: 'ELDEN RING NIGHTREIGN',
  year: 2025,
  platform: 'PC / Console',
  company: 'FromSoftware',
  genre: 'Souls-like / co-op',
  mode: 'Single / Co-op',
});
add({
  title: 'Palworld',
  year: 2024,
  platform: 'PC / Console',
  engine: 'Unreal Engine 5',
  company: 'Pocketpair',
  genre: 'Sobrevivência / monster collection',
  mode: 'Single / Co-op',
});
add({
  title: 'Enshrouded',
  year: 2024,
  platform: 'PC',
  company: 'Keen Games',
  genre: 'Sobrevivência / RPG',
  mode: 'Single / Co-op',
});
add({
  title: 'Guacamelee! 2',
  year: 2018,
  platform: 'PC / Console',
  company: 'Drinkbox Studios',
  genre: 'Metroidvania',
  mode: 'Single / Co-op',
});
add({
  title: 'SMITE 2',
  year: 2024,
  platform: 'PC',
  engine: 'Unreal Engine 5',
  company: 'Hi-Rez Studios',
  genre: 'MOBA',
  mode: 'Multiplayer',
});
add({
  title: 'We Were Here Too',
  year: 2018,
  platform: 'PC',
  company: 'Total Mayhem Games',
  genre: 'Puzzle cooperativo',
  mode: 'Co-op',
});
add({
  title: 'We Were Here Together',
  year: 2019,
  platform: 'PC',
  company: 'Total Mayhem Games',
  genre: 'Puzzle cooperativo',
  mode: 'Co-op',
});
add({
  title: 'We Were Here Forever',
  year: 2022,
  platform: 'PC',
  company: 'Total Mayhem Games',
  genre: 'Puzzle cooperativo',
  mode: 'Co-op',
});

/* --- novos: console --- */
add({
  title: 'Metal Slug',
  year: 1997,
  platform: 'PS1',
  company: 'SNK',
  genre: 'Run and gun',
  mode: 'Single / Co-op',
});
add({
  title: 'Nightmare Creatures II',
  year: 2000,
  platform: 'PS1',
  company: 'Konami',
  genre: 'Horror',
  mode: 'Single-player',
});
add({
  title: 'Pandemonium 2',
  year: 1997,
  platform: 'PS1',
  company: 'Crystal Dynamics',
  genre: 'Plataformas',
  mode: 'Single-player',
});
add({
  title: 'Parasite Eve II',
  year: 1999,
  platform: 'PS1',
  company: 'Squaresoft',
  genre: 'RPG / horror',
  mode: 'Single-player',
});
add({
  title: 'Resident Evil 2',
  year: 1998,
  platform: 'PS1',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'Resident Evil 3',
  year: 1999,
  platform: 'PS1',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'Resident Evil 4',
  year: 2005,
  platform: 'PC / Console',
  engine: 'MT Framework',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'Resident Evil 5',
  year: 2009,
  platform: 'PC / Console',
  engine: 'MT Framework',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single / Co-op',
});
add({
  title: 'Resident Evil 6',
  year: 2012,
  platform: 'PC / Console',
  engine: 'MT Framework',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single / Co-op',
});
add({
  title: 'Resident Evil 7',
  year: 2017,
  platform: 'PC / Console',
  engine: 'RE Engine',
  company: 'Capcom',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'Silent Hill 2',
  year: 2001,
  platform: 'PS2',
  company: 'Konami',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'White Knight Chronicles',
  year: 2008,
  platform: 'PS3',
  company: 'Level-5',
  genre: 'RPG',
  mode: 'Single / Multiplayer',
});
add({
  title: 'The Legend of Zelda: Ocarina of Time',
  year: 1998,
  platform: 'N64',
  engine: NINTENDO,
  company: 'Nintendo',
  genre: 'Action-adventure',
  mode: 'Single-player',
});
add({
  title: 'The Legend of Zelda: A Link to the Past',
  year: 1992,
  platform: 'SNES',
  engine: NINTENDO,
  company: 'Nintendo',
  genre: 'Action-adventure',
  mode: 'Single-player',
});
add({
  title: "The Legend of Zelda: Majora's Mask",
  year: 2000,
  platform: 'N64',
  engine: NINTENDO,
  company: 'Nintendo',
  genre: 'Action-adventure',
  mode: 'Single-player',
});
add({
  title: 'The Legend of Zelda: Breath of the Wild',
  year: 2017,
  platform: 'Switch',
  engine: NINTENDO,
  company: 'Nintendo',
  genre: 'Action-adventure (mundo aberto)',
  mode: 'Single-player',
});

/* --- Pokémon: separar os 16 pares em 2 entradas cada --- */
const pokes = [
  [126, 'Pokemon Red', 'Pokemon Blue', 1998, 'Game Boy'],
  [127, 'Pokemon Gold', 'Pokemon Silver', 2000, 'Game Boy Color'],
  [128, 'Pokemon Ruby', 'Pokemon Sapphire', 2003, 'Game Boy Advance'],
  [130, 'Pokemon FireRed', 'Pokemon LeafGreen', 2004, 'Game Boy Advance'],
  [131, 'Pokemon Diamond', 'Pokemon Pearl', 2007, 'Nintendo DS'],
  [133, 'Pokemon HeartGold', 'Pokemon SoulSilver', 2010, 'Nintendo DS'],
  [134, 'Pokemon Black', 'Pokemon White', 2011, 'Nintendo DS'],
  [135, 'Pokemon Black 2', 'Pokemon White 2', 2012, 'Nintendo DS'],
  [136, 'Pokemon X', 'Pokemon Y', 2013, 'Nintendo 3DS'],
  [137, 'Pokemon Omega Ruby', 'Pokemon Alpha Sapphire', 2014, 'Nintendo 3DS'],
  [138, 'Pokemon Sun', 'Pokemon Moon', 2016, 'Nintendo 3DS'],
  [139, 'Pokemon Ultra Sun', 'Pokemon Ultra Moon', 2017, 'Nintendo 3DS'],
  [140, "Pokemon Let's Go, Pikachu!", "Pokemon Let's Go, Eevee!", 2018, 'Switch'],
  [141, 'Pokemon Sword', 'Pokemon Shield', 2019, 'Switch'],
  [142, 'Pokemon Brilliant Diamond', 'Pokemon Shining Pearl', 2021, 'Switch'],
  [144, 'Pokemon Scarlet', 'Pokemon Violet', 2022, 'Switch'],
];
for (const [id, a, b, year, platform] of pokes) {
  patch(id, { title: a, year, platform, engine: NINTENDO });
  const sibling = byId.get(id);
  add({
    title: b,
    year,
    platform,
    engine: NINTENDO,
    company: sibling.company,
    genre: sibling.genre,
    mode: sibling.mode,
  });
}
/* singles: engine também */
for (const id of [129, 132, 143, 145, 146]) {
  if (byId.get(id).id !== 146 && !byId.get(id).engine) byId.get(id).engine = NINTENDO;
}

/* --- nome errado --- */
patch(133, {}); // placeholder no-op p/ clareza
const solasta = arr.find((g) => /solasta/i.test(g.title));
if (solasta) solasta.title = 'Solasta: Crown of the Magister';

if (!Array.isArray(data)) data.games = arr;
fs.writeFileSync('data/games.json', JSON.stringify(data, null, 2) + '\n');
console.log('total de jogos:', arr.length);
console.log('solasta:', solasta ? solasta.id + ' ' + solasta.title : 'NAO ACHEI');
