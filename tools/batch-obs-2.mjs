/* Lote 2 — respostas do usuário pros 57 _obs (lista na mesma ordem).
   Uso: node tools/batch-obs-2.mjs */
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
const arr = Array.isArray(data) ? data : data.games;
const byId = new Map(arr.map((g) => [g.id, g]));
let max = Math.max(...arr.map((x) => x.id));
const nextId = () => ++max;

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

/* 1-10 */
patch(81, { title: 'Dota Underlords' });
patch(154, { title: 'The Legend of Zelda' }); // 2: só o NES já passei
patch(162, { title: 'Amnesia: The Dark Descent' });
add({
  title: 'Amnesia: A Machine for Pigs',
  year: 2013,
  platform: 'PC',
  company: 'The Chinese Room',
  genre: 'Horror',
  mode: 'Single-player',
});
patch(173, { title: 'F.E.A.R.' });
add({
  title: 'F.E.A.R. 2: Project Origin',
  year: 2009,
  platform: 'PC / Console',
  company: 'Monolith Productions',
  genre: 'FPS / horror',
  mode: 'Single-player',
});
add({
  title: 'F.E.A.R. 3',
  year: 2011,
  platform: 'PC / Console',
  company: 'Day 1 Studios',
  genre: 'FPS / horror',
  mode: 'Single / Co-op',
});
patch(176, { title: 'Guacamelee! Super Turbo Championship Edition' });
patch(178, { title: 'Ghost Exorcism Inc' });
patch(182, { title: 'Hell Yeah! Wrath of the Dead Rabbit' });
patch(186, { title: 'Injustice: Gods Among Us' });
add({
  title: 'Injustice 2',
  year: 2017,
  platform: 'PC / Console',
  company: 'NetherRealm Studios',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});
patch(190, { title: 'Legends of IdleOn', platform: 'PC / Mobile' });
patch(193, { title: 'Minion Masters' });

/* 11-20 */
patch(197, { title: 'Ori and the Blind Forest: Definitive Edition' });
add({
  title: 'Quake III Arena',
  year: 1999,
  platform: 'PC',
  company: 'id Software',
  genre: 'FPS',
  mode: 'Multiplayer',
});
patch(201, { title: 'Quake' }); // 12: 1 + III Arena
patch(202, { title: 'PUBG: Battlegrounds', platform: 'PC', year: 2017 });
patch(204, {
  title: 'Red Dead Redemption 2',
  year: 2018,
  platform: 'PC / Console',
  engine: 'RAGE',
});
add({
  title: 'Red Dead Online',
  year: 2019,
  platform: 'PC / Console',
  engine: 'RAGE',
  company: 'Rockstar Games',
  genre: 'Mundo aberto / online',
  mode: 'Multiplayer',
});
patch(211, { title: 'Yu-Gi-Oh! Forbidden Memories', year: 1999, platform: 'PS1' });
add({
  title: 'Yu-Gi-Oh! Duel Links',
  year: 2016,
  platform: 'PC / Mobile',
  company: 'Konami',
  genre: 'Cartas',
  mode: 'Multiplayer',
});
add({
  title: 'Yu-Gi-Oh! Master Duel',
  year: 2022,
  platform: 'PC / Console / Mobile',
  company: 'Konami',
  genre: 'Cartas',
  mode: 'Multiplayer',
});
patch(212, { title: 'SOMA', platform: 'PC' }); // Epic Games
patch(215, { title: 'Gears of War 3', year: 2011, platform: 'Xbox 360' });

/* 21-30 */
patch(217, { title: 'Battlefield 3', year: 2011, platform: 'PC / Console', engine: 'Frostbite 2' });
add({
  title: 'Battlefield 1942',
  year: 2002,
  platform: 'PC',
  engine: 'Refractor 2',
  company: 'DICE',
  genre: 'FPS',
  mode: 'Multiplayer',
});
patch(218, { title: 'Call of Duty 4: Modern Warfare', year: 2007, platform: 'PC / Console' });
add({
  title: 'Call of Duty: Modern Warfare 2',
  year: 2009,
  platform: 'PC / Console',
  company: 'Infinity Ward',
  genre: 'FPS',
  mode: 'Single / Multiplayer',
});
add({
  title: 'Call of Duty: Black Ops',
  year: 2010,
  platform: 'PC / Console',
  company: 'Treyarch',
  genre: 'FPS',
  mode: 'Single / Multiplayer',
});
patch(219, { platform: 'PC / Console', title: "Assassin's Creed" }); // 23: AC1
patch(221, { title: 'Dead Space' });
add({
  title: 'Dead Space 2',
  year: 2011,
  platform: 'PC / Console',
  company: 'Visceral Games',
  genre: 'Survival horror',
  mode: 'Single-player',
});
add({
  title: 'Dead Space 3',
  year: 2013,
  platform: 'PC / Console',
  company: 'Visceral Games',
  genre: 'Survival horror',
  mode: 'Single / Co-op',
});
patch(222, { title: 'Dragon Age: Origins' });
patch(224, { title: 'Mass Effect' });
add({
  title: 'Mass Effect 2',
  year: 2010,
  platform: 'PC / Console',
  company: 'BioWare',
  genre: 'Action RPG',
  mode: 'Single-player',
});
patch(225, { title: 'Need for Speed: Underground', year: 2003, platform: 'PC / Console' });
add({
  title: 'Midnight Club: Los Angeles',
  year: 2008,
  platform: 'PS3 / Xbox 360',
  company: 'Rockstar San Diego',
  genre: 'Corrida (mundo aberto)',
  mode: 'Single / Multiplayer',
});
patch(226, { title: 'osu!', platform: 'PC' });
patch(227, { platform: 'PS1' }); // 29: Medal of Honor (1999, PS1)
patch(229, { title: 'Xenoblade Chronicles 3', year: 2022, platform: 'Switch' });
patch(231, { title: 'Corsairs Gold', year: 1999, platform: 'PC' });

/* 31-40 */
patch(233, {
  title: 'Kingdom Hearts III',
  year: 2019,
  platform: 'PC / Console',
  engine: 'Unreal Engine 4',
});
patch(234, { title: 'Sonic Chaos', year: 1993, platform: 'Master System' });
patch(236, { title: 'Spyro the Dragon', year: 1998, platform: 'PS1' });
patch(242, { title: 'Disgaea: Hour of Darkness' });
patch(245, { title: "Devil May Cry 3: Dante's Awakening", year: 2005, platform: 'PS2' });
add({
  title: 'DmC: Devil May Cry',
  year: 2013,
  platform: 'PC / Console',
  engine: 'Unreal Engine 3',
  company: 'Ninja Theory',
  genre: 'Hack and slash',
  mode: 'Single-player',
});
patch(247, {
  title: 'The Lord of the Rings: The Return of the King',
  year: 2003,
  platform: 'PS2 / PC',
  company: 'EA Redwood Shores',
  genre: 'Hack and slash',
  mode: 'Single / Co-op',
});
patch(250, {
  title: 'Deus Ex: Human Revolution',
  year: 2011,
  platform: 'PS3 / PC',
  engine: 'Crimson Engine',
  company: 'Eidos-Montréal',
});
add({
  title: 'Deus Ex: Mankind Divided',
  year: 2016,
  platform: 'PS4 / PC',
  engine: 'Dawn Engine',
  company: 'Eidos-Montréal',
  genre: 'FPS / RPG (imersivo)',
  mode: 'Single-player',
});
patch(263); // 40: confirmado, Apocalypse do Bruce Willis

/* 41-50 */
patch(252, { title: 'Metal Gear Solid' });
add({
  title: 'Metal Gear Solid 4: Guns of the Patriots',
  year: 2008,
  platform: 'PS3',
  company: 'Kojima Productions',
  genre: 'Stealth',
  mode: 'Single-player',
});
patch(253, {
  title: 'Marvel vs. Capcom: Clash of Super Heroes',
  year: 1998,
  platform: 'Arcade / PS1',
});
add({
  title: 'Marvel vs. Capcom 3: Fate of Two Worlds',
  year: 2011,
  platform: 'PS3 / Xbox 360',
  company: 'Capcom',
  genre: 'Luta (crossover)',
  mode: 'Single / Multiplayer',
});
add({
  title: 'Marvel vs. Capcom: Infinite',
  year: 2017,
  platform: 'PC / Console',
  company: 'Capcom',
  genre: 'Luta (crossover)',
  mode: 'Single / Multiplayer',
});
patch(256, { title: 'NieR' });
add({
  title: 'NieR: Automata',
  year: 2017,
  platform: 'PC / Console',
  company: 'PlatinumGames',
  genre: 'Action RPG',
  mode: 'Single-player',
});
patch(262, { title: 'Alone in the Dark: The New Nightmare', year: 2001, platform: 'PS1 / PC' });
patch(266, { title: "The King of Fighters '95", year: 1995, platform: 'Arcade / Neo Geo / PS1' });
add({
  title: "The King of Fighters '96",
  year: 1996,
  platform: 'Arcade / Neo Geo / PS1',
  company: 'SNK',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});
add({
  title: "The King of Fighters '97",
  year: 1997,
  platform: 'Arcade / Neo Geo / PS1',
  company: 'SNK',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});
add({
  title: "The King of Fighters '98",
  year: 1998,
  platform: 'Arcade / Neo Geo / PS1',
  company: 'SNK',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});
add({
  title: "The King of Fighters '99",
  year: 1999,
  platform: 'Arcade / Neo Geo',
  company: 'SNK',
  genre: 'Luta',
  mode: 'Single / Multiplayer',
});
patch(267, { title: 'MediEvil' });
patch(271, { title: 'Rival Schools: United by Fate' });
patch(272, { platform: 'PS1', year: 1995 });

/* 51-57 */
patch(275, { title: 'Spider-Man', year: 2000, platform: 'PS1' });
add({
  title: 'Spider-Man 2: Enter: Electro',
  year: 2001,
  platform: 'PS1',
  company: 'Vicarious Visions',
  genre: 'Ação (super-herói)',
  mode: 'Single-player',
});
patch(277, { title: 'Commandos: Behind Enemy Lines' });
add({
  title: 'Commandos: Beyond the Call of Duty',
  year: 1999,
  platform: 'PC',
  company: 'Pyro Studios',
  genre: 'Tática em tempo real',
  mode: 'Single-player',
});
patch(278, { title: 'Valdis Story: Abyssal City' });
add({
  title: 'White Day: A Labyrinth Named School',
  year: 2017,
  platform: 'PC / Console / Mobile',
  company: 'Sonnori',
  genre: 'Horror',
  mode: 'Single-player',
});
patch(280, { title: 'SCP - Containment Breach' });
add({
  title: 'Worms 2',
  year: 1996,
  platform: 'PC',
  company: 'Team17',
  genre: 'Estratégia / humor',
  mode: 'Hot-seat / Online',
});
add({
  title: 'Worms Armageddon',
  year: 1999,
  platform: 'PC',
  company: 'Team17',
  genre: 'Estratégia / humor',
  mode: 'Hot-seat / Online',
});
patch(283, { title: 'Perfect World International', year: 2008 });

if (!Array.isArray(data)) data.games = arr;
fs.writeFileSync('data/games.json', JSON.stringify(data, null, 2) + '\n');
console.log('total:', arr.length, '| max id:', max);
