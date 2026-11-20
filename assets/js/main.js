/* ============================================================
   Lista de Jogos — render + i18n PT-BR/EN
   Os dados vivem em data/games.json (fácil de preencher na mão
   ou com script). Metadados null não aparecem no card.
   ============================================================ */

const I18N = {
  'pt-br': {
    pageTitle: 'Lista de Jogos',
    pageDescription: 'A lista de jogos que eu já joguei.',
    title: 'LISTA DE JOGOS',
    subtitle: 'os jogos que eu já joguei',
    search: 'Buscar jogo...',
    count: (n) => `${n} jogo${n === 1 ? '' : 's'} na lista`,
    noResults: 'nenhum jogador encontrado — G A M E  O V E R',
    footer: 'feito com muito tempo de tela',
    missing: 'a preencher',
    loading: 'CARREGANDO...',
  },
  en: {
    pageTitle: 'Games List',
    pageDescription: 'The list of games I have played.',
    title: 'GAMES LIST',
    subtitle: 'the games I have played',
    search: 'Search game...',
    count: (n) => `${n} game${n === 1 ? '' : 's'} on the list`,
    noResults: 'no player found — G A M E  O V E R',
    footer: 'made with lots of screen time',
    missing: 'to be filled',
    loading: 'LOADING...',
  },
};

let LANG = localStorage.getItem('lang') || 'pt-br';
let GAMES = [];

const $ = (sel) => document.querySelector(sel);

/* ---------- i18n ---------- */

function applyI18n() {
  const dict = I18N[LANG];
  document.documentElement.lang = LANG;
  document.title = dict.pageTitle;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (typeof dict[el.dataset.i18n] === 'string') el.textContent = dict[el.dataset.i18n];
  });
  document.querySelectorAll('[data-i18n-content]').forEach((el) => {
    const key = el.dataset.i18nContent;
    if (typeof dict[key] === 'string') el.setAttribute('content', dict[key]);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (typeof dict[key] === 'string') el.setAttribute('placeholder', dict[key]);
  });
  $('#lang-toggle').textContent = LANG === 'pt-br' ? 'EN' : 'PT-BR';
}

/* ---------- render ---------- */

function gameTitle(game) {
  // 'title' é o título ORIGINAL do jogo (em geral em inglês/lançamento).
  // 'title_pt' é opcional: título existente no Brasil, mostrado em pt-br.
  if (LANG === 'pt-br' && game.title_pt) return game.title_pt;
  return game.title;
}

function metaLine(game) {
  const parts = [];
  if (game.year) parts.push(game.year);
  if (game.platform) parts.push({ 'pt-br': game.platform, en: game.platform }[LANG]);
  return parts;
}

function renderList(query = '') {
  const dict = I18N[LANG];
  const list = $('#game-list');
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  const filtered = q ? GAMES.filter((g) => gameTitle(g).toLowerCase().includes(q)) : GAMES;

  list.innerHTML = '';

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'noscript';
    li.textContent = dict.noResults;
    list.appendChild(li);
  }

  filtered.forEach((game, i) => {
    const li = document.createElement('li');
    li.className = 'game-item';

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1).padStart(3, '0');
    li.appendChild(num);

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = gameTitle(game);
    li.appendChild(title);

    const meta = document.createElement('span');
    meta.className = 'meta';
    const parts = metaLine(game);
    if (parts.length) {
      const line = document.createElement('span');
      line.textContent = parts.join(' · ');
      meta.appendChild(line);
    }
    if (game.rating !== null) {
      const r = document.createElement('span');
      r.className = 'rating';
      r.textContent = '★'.repeat(game.rating);
      meta.appendChild(r);
    } else if (!parts.length) {
      const miss = document.createElement('span');
      miss.className = 'missing';
      miss.textContent = dict.missing;
      meta.appendChild(miss);
    }
    li.appendChild(meta);

    list.appendChild(li);
  });

  $('#count').textContent = dict.count(filtered.length);
}

/* ---------- boot ---------- */

async function loadGames() {
  try {
    const res = await fetch('data/games.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    GAMES = data.games || [];
  } catch (err) {
    console.error('[lista-de-jogos] falha ao carregar data/games.json:', err);
    $('#count').textContent = 'erro ao carregar data/games.json';
    return;
  }
  renderList($('#search').value);
}

$('#search').addEventListener('input', (e) => renderList(e.target.value));

$('#lang-toggle').addEventListener('click', () => {
  LANG = LANG === 'pt-br' ? 'en' : 'pt-br';
  localStorage.setItem('lang', LANG);
  applyI18n();
  renderList($('#search').value);
});

applyI18n();
renderList();
$('#count').textContent = I18N[LANG].loading;
loadGames();
