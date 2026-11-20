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
    reviewLink: 'revisar a lista',
    missing: 'a preencher',
    loading: 'CARREGANDO...',
    labelYear: 'Ano de Lançamento',
    labelPlatform: 'Plataforma',
    labelEngine: 'Engine',
    labelRating: 'Avaliação Pessoal',
    labelCompany: 'Empresa',
    labelGenre: 'Gênero',
    labelMode: 'Modo de Jogo',
    labelReview: 'Meu review',
    ratingHint: 'clique nas estrelas para dar sua nota',
    reviewPlaceholder: 'escreva o que você pensou do jogo...',
    save: 'SALVAR',
    saved: 'SALVO ✓',
    copyNotes: 'COPIAR NOTAS SALVAS',
    copied: 'COPIADO ✓',
    close: 'Fechar (Esc)',
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
    reviewLink: 'review the list',
    missing: 'to be filled',
    loading: 'LOADING...',
    labelYear: 'Release year',
    labelPlatform: 'Platform',
    labelEngine: 'Engine',
    labelRating: 'Personal rating',
    labelCompany: 'Developer',
    labelGenre: 'Genre',
    labelMode: 'Mode',
    labelReview: 'My review',
    ratingHint: 'click the stars to rate',
    reviewPlaceholder: 'write what you thought of the game...',
    save: 'SAVE',
    saved: 'SAVED ✓',
    copyNotes: 'COPY SAVED NOTES',
    copied: 'COPIED ✓',
    close: 'Close (Esc)',
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

/* linha secundária: gênero · empresa · engine · modo (com tooltip da legenda) */
const SUB_SEGMENTS = ['Genre', 'Company', 'Engine', 'Mode'];

function renderSubLine(body, game) {
  const dict = I18N[LANG];
  const subLine = document.createElement('span');
  subLine.className = 'sub';
  let first = true;
  SUB_SEGMENTS.forEach((seg) => {
    const key = seg.toLowerCase();
    if (!game[key]) return;
    if (!first) subLine.append(' · ');
    first = false;
    const segSpan = document.createElement('span');
    segSpan.title = dict[`label${seg}`];
    segSpan.textContent = game[key];
    subLine.appendChild(segSpan);
  });
  if (first) return null;
  body.appendChild(subLine);
  return subLine;
}

/* ---------- notas do usuário (rating + review) no navegador ---------- */

const NOTAS_KEY = 'notas-jogos';
const NOTAS = new Map(JSON.parse(localStorage.getItem(NOTAS_KEY) || '[]'));

function notaOf(game) {
  return NOTAS.get(game.title) || {};
}

function getRating(game) {
  return notaOf(game).rating ?? game.rating ?? null;
}

function getReview(game) {
  return notaOf(game).review ?? game.review ?? '';
}

function persistNotas() {
  localStorage.setItem(NOTAS_KEY, JSON.stringify([...NOTAS]));
}

/* ---------- modal de detalhes do jogo ---------- */

function fieldRow(dict, labelKey, value) {
  if (value === null || value === undefined || value === '') return null;
  const row = document.createElement('div');
  row.className = 'modal-field';
  const label = document.createElement('span');
  label.className = 'modal-label';
  label.textContent = dict[labelKey];
  const val = document.createElement('span');
  val.className = 'modal-value';
  val.textContent = value;
  row.append(label, val);
  return row;
}

function openModal(game) {
  const dict = I18N[LANG];
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'game-modal';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.type = 'button';
  closeBtn.title = dict.close;
  closeBtn.setAttribute('aria-label', dict.close);
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeModal);
  panel.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.textContent = gameTitle(game);
  panel.appendChild(h2);

  const fields = document.createElement('div');
  fields.className = 'modal-fields';
  [
    ['labelYear', game.year],
    ['labelPlatform', game.platform],
    ['labelEngine', game.engine],
    ['labelCompany', game.company],
    ['labelGenre', game.genre],
    ['labelMode', game.mode],
  ].forEach(([key, value]) => {
    const row = fieldRow(dict, key, value);
    if (row) fields.appendChild(row);
  });
  panel.appendChild(fields);

  const ratingLabel = document.createElement('p');
  ratingLabel.className = 'modal-label modal-rating-label';
  ratingLabel.textContent = `${dict.labelRating} (${dict.ratingHint})`;
  panel.appendChild(ratingLabel);

  const stars = document.createElement('div');
  stars.className = 'modal-stars';
  let rating = getRating(game);
  const starBtns = [];
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star';
    star.textContent = '★';
    star.addEventListener('click', () => {
      rating = rating === i ? null : i; // clicar de novo apaga a nota
      paintStars();
    });
    starBtns.push(star);
    stars.appendChild(star);
  }
  function paintStars() {
    starBtns.forEach((star, j) => star.classList.toggle('lit', j < (rating || 0)));
  }
  paintStars();
  panel.appendChild(stars);

  const reviewLabel = document.createElement('p');
  reviewLabel.className = 'modal-label modal-rating-label';
  reviewLabel.textContent = dict.labelReview;
  panel.appendChild(reviewLabel);

  const textarea = document.createElement('textarea');
  textarea.className = 'review-answer modal-answer';
  textarea.placeholder = dict.reviewPlaceholder;
  textarea.value = getReview(game);
  panel.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-neon';
  saveBtn.textContent = dict.save;
  saveBtn.addEventListener('click', () => {
    const nota = {};
    if (rating) nota.rating = rating;
    if (textarea.value.trim()) nota.review = textarea.value.trim();
    if (Object.keys(nota).length) NOTAS.set(game.title, nota);
    else NOTAS.delete(game.title);
    persistNotas();
    saveBtn.textContent = dict.saved;
    setTimeout(() => (saveBtn.textContent = dict.save), 1200);
    renderList($('#search').value);
  });
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-neon';
  copyBtn.textContent = dict.copyNotes;
  copyBtn.addEventListener('click', () => {
    const lines = GAMES.filter((g) => NOTAS.has(g.title)).map((g) => {
      const n = NOTAS.get(g.title);
      const bits = [];
      if (n.rating) bits.push(`nota: ${n.rating} estrela(s)`);
      if (n.review) bits.push(`review: ${n.review}`);
      return `${g.title} — ${bits.join(' — ')}`;
    });
    const text = lines.length ? lines.join('\n\n') : '(nenhuma nota salva)';
    navigator.clipboard.writeText(text).then(
      () => {
        copyBtn.textContent = dict.copied;
        setTimeout(() => (copyBtn.textContent = dict.copyNotes), 1200);
      },
      () => prompt('Copie abaixo:', text)
    );
  });
  actions.append(saveBtn, copyBtn);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  textarea.focus({ preventScroll: true });
}

function closeModal() {
  document.getElementById('game-modal')?.remove();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ---------- render ---------- */

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
    li.className = 'game-item clickable';
    li.tabIndex = 0;
    const open = () => openModal(game);
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1).padStart(3, '0');
    li.appendChild(num);

    const body = document.createElement('div');
    body.className = 'game-body';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = gameTitle(game);
    body.appendChild(title);

    const sub = renderSubLine(body, game);
    li.appendChild(body);

    if (getReview(game)) {
      li.classList.add('has-review');
      li.title = '✎ ' + dict.labelReview;
    }

    const meta = document.createElement('span');
    meta.className = 'meta';
    const parts = metaLine(game);
    if (parts.length) {
      const line = document.createElement('span');
      line.textContent = parts.join(' · ');
      meta.appendChild(line);
    }
    const rating = getRating(game);
    if (rating) {
      const r = document.createElement('span');
      r.className = 'rating';
      r.textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      meta.appendChild(r);
    } else if (!parts.length && !sub) {
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
