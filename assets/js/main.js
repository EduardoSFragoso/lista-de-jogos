/* ============================================================
   Lista de Jogos — render + i18n PT-BR/EN
   Os dados vêm da API (Worker + Neon/PostgreSQL) quando serve
   de ⚙, com fallback local: data/games.json + 'edits-jogos'
   no localStorage. Com API configurada, cada SALVA vai direto
   no banco (db.js); sem API, fica pendente em local.
   ============================================================ */

import { apiConfigured, fetchGames, getApiUrl, login, logout, patchGame, setApiUrl } from './db.js';

/** Limite do review — igual ao whitelist do Worker (worker/src/index.js). */
const MAX_REVIEW = 4000;

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
    readOnly: 'modo local (somente leitura) — edite com ⚙',
    apiMode: 'API conectada — salvas vão direto no banco',
    saveFailed: '✖ falhou na API — salvo local',
    apiTitle: 'Configuração da API',
    apiHint:
      'URL do Worker (ex.: https://lista-api.seu-usuario.workers.dev) e a senha de admin (ADMIN_PASSWORD do deploy). A senha não é salva: ela abre uma sessão com cookie HttpOnly, válida por 7 dias. Sem API, o site roda em modo local.',
    apiLabelUrl: 'URL da API',
    apiLabelPassword: 'Senha de admin',
    apiSave: 'ENTRAR',
    apiConnected: 'CONECTADO ✓',
    connectFailed: '✖ falha ao conectar',
    apiClear: 'Sair e limpar URL',
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
    readOnly: 'local mode (read-only) — edit via ⚙',
    apiMode: 'API connected — saves go straight to the database',
    saveFailed: '✖ API failed — saved locally',
    apiTitle: 'API configuration',
    apiHint:
      'Worker URL (e.g. https://lista-api.your-user.workers.dev) and the admin password (ADMIN_PASSWORD set at deploy). The password is never stored: it opens an HttpOnly session cookie, valid for 7 days. Without an API, the site runs in local mode.',
    apiLabelUrl: 'API URL',
    apiLabelPassword: 'Admin password',
    apiSave: 'SIGN IN',
    apiConnected: 'CONNECTED ✓',
    connectFailed: '✖ failed to connect',
    apiClear: 'Sign out and clear URL',
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

/* ---------- edições locais (nota, review, correções) ---------- */

const EDITS_KEY = 'edits-jogos';
/* migra do formato antigo (notas-jogos) se existir */
const EDITS = new Map(
  JSON.parse(localStorage.getItem(EDITS_KEY) || localStorage.getItem('notas-jogos') || '[]')
);

function persistEdits() {
  localStorage.setItem(EDITS_KEY, JSON.stringify([...EDITS]));
}

function effGame(game) {
  const ed = EDITS.get(game.title);
  return ed ? { ...game, ...ed } : game;
}

function hasEdits(game) {
  return EDITS.has(game.title);
}

/* ---------- i18n helpers de render ---------- */

function gameTitle(game) {
  // 'title' é o título ORIGINAL do jogo (em geral em inglês/lançamento).
  // 'title_pt' é opcional: título existente no Brasil, mostrado em pt-br.
  if (LANG === 'pt-br' && game.title_pt) return game.title_pt;
  return game.title;
}

function metaLine(game) {
  const parts = [];
  if (game.year) parts.push(game.year);
  if (game.platform) parts.push(game.platform);
  return parts;
}

/* linha secundária: gênero · empresa · engine · modo (com tooltip da legenda) */
const SUB_SEGMENTS = ['Genre', 'Company', 'Engine', 'Mode'];

function renderSubLine(body, game, pre) {
  const dict = I18N[LANG];
  const subLine = document.createElement('span');
  subLine.className = 'sub';
  let first = true;
  if (pre && pre.length) {
    const preSpan = document.createElement('span');
    preSpan.className = 'sub-meta';
    preSpan.textContent = pre.join(' · ');
    subLine.appendChild(preSpan);
    first = false;
  }
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

/* ---------- seções por letra + índice A-Z ---------- */

function sectionLetter(title) {
  const c = (title || '?').trim().charAt(0).normalize('NFD')[0].toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : '#';
}

function renderLetterNav() {
  const dict = I18N[LANG];
  const nav = $('#letter-nav');
  nav.innerHTML = '';
  const letters = [...new Set(GAMES.map((g) => sectionLetter(gameTitle(g))))].sort();
  for (const code of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    if (letters.includes(code)) {
      const a = document.createElement('a');
      a.href = `#sec-${code.toLowerCase()}`;
      a.textContent = code;
      nav.appendChild(a);
    } else {
      const s = document.createElement('span');
      s.textContent = code;
      s.className = 'off';
      nav.appendChild(s);
    }
  }
  nav.setAttribute('aria-label', dict.title);
}

/* ---------- modal (detalhes + edição + config GitHub) ---------- */

function closeModals() {
  document.getElementById('game-modal')?.remove();
  document.getElementById('config-modal')?.remove();
}

function modalShell(titleText, modalId) {
  const dict = I18N[LANG];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = modalId;

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.type = 'button';
  closeBtn.title = dict.close;
  closeBtn.setAttribute('aria-label', dict.close);
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeModals);
  panel.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.textContent = titleText;
  panel.appendChild(h2);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModals();
  });
  document.body.appendChild(overlay);
  return panel;
}

function fieldRowEditable(dict, labelKey, value, onInput) {
  const row = document.createElement('div');
  row.className = 'modal-field';
  const label = document.createElement('span');
  label.className = 'modal-label';
  label.textContent = dict[labelKey];
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.value = value ?? '';
  input.placeholder = '—';
  input.addEventListener('input', () => onInput(input.value.trim()));
  row.append(label, input);
  return row;
}

/** Metadados vêm do banco/repo — exibidos somente-leitura no modal. */
function fieldRowStatic(dict, labelKey, value) {
  const row = fieldRowEditable(dict, labelKey, value, () => {});
  const input = row.querySelector('.modal-input');
  input.readOnly = true;
  input.removeAttribute('placeholder');
  input.tabIndex = -1;
  return row;
}

function openConfig() {
  const dict = I18N[LANG];
  closeModals();
  const panel = modalShell(dict.apiTitle, 'config-modal');

  const tgt = document.createElement('p');
  tgt.className = 'modal-label modal-hint';
  tgt.textContent = dict.apiHint;
  panel.appendChild(tgt);

  const rowUrl = document.createElement('div');
  rowUrl.className = 'modal-field';
  const l1 = document.createElement('span');
  l1.className = 'modal-label';
  l1.textContent = dict.apiLabelUrl;
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'modal-input';
  urlInput.placeholder = 'https://lista-api.seu-usuario.workers.dev';
  urlInput.value = getApiUrl();
  rowUrl.append(l1, urlInput);
  panel.appendChild(rowUrl);

  const rowToken = document.createElement('div');
  rowToken.className = 'modal-field';
  const l2 = document.createElement('span');
  l2.className = 'modal-label';
  l2.textContent = dict.apiLabelPassword;
  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.className = 'modal-input';
  passInput.placeholder = '—';
  rowToken.append(l2, passInput);
  panel.appendChild(rowToken);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-neon';
  saveBtn.textContent = dict.apiSave;
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await login(urlInput.value, passInput.value);
      passInput.value = '';
      saveBtn.textContent = dict.apiConnected;
      updateStatus();
      setTimeout(() => {
        closeModals();
        loadGames(); /* recarrega os dados do banco */
      }, 800);
    } catch (err) {
      console.error('[lista-de-jogos] login:', err);
      saveBtn.textContent = dict.connectFailed;
      setTimeout(() => {
        saveBtn.textContent = dict.apiSave;
        saveBtn.disabled = false;
      }, 1800);
    }
  });
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn-ghost';
  clearBtn.textContent = dict.apiClear;
  clearBtn.addEventListener('click', async () => {
    await logout().catch(() => {});
    setApiUrl('');
    urlInput.value = '';
    passInput.value = '';
    updateStatus();
    loadGames();
  });
  actions.append(saveBtn, clearBtn);
  panel.appendChild(actions);

  urlInput.focus({ preventScroll: true });
}

/** Linha de status no hero: modo local x API conectada. */
function updateStatus() {
  const status = $('#status-line');
  if (status) status.textContent = apiConfigured() ? I18N[LANG].apiMode : I18N[LANG].readOnly;
}

function openModal(game) {
  const dict = I18N[LANG];
  closeModals();
  const eff = effGame(game);
  const panel = modalShell(gameTitle(eff), 'game-modal');

  /* metadados: somente-leitura (a avaliação pessoal é o que se edita) */
  const fields = document.createElement('div');
  fields.className = 'modal-fields';
  [
    ['labelYear', 'year', eff.year],
    ['labelPlatform', 'platform', eff.platform],
    ['labelEngine', 'engine', eff.engine],
    ['labelCompany', 'company', eff.company],
    ['labelGenre', 'genre', eff.genre],
    ['labelMode', 'mode', eff.mode],
  ].forEach(([labelKey, , value]) => {
    fields.appendChild(fieldRowStatic(dict, labelKey, value));
  });
  panel.appendChild(fields);

  /* nota por estrelas */
  const ratingLabel = document.createElement('p');
  ratingLabel.className = 'modal-label modal-rating-label';
  ratingLabel.textContent = `${dict.labelRating} (${dict.ratingHint})`;
  panel.appendChild(ratingLabel);

  const stars = document.createElement('div');
  stars.className = 'modal-stars';
  let rating = eff.rating ?? null;
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

  /* review */
  const reviewLabel = document.createElement('p');
  reviewLabel.className = 'modal-label modal-rating-label';
  reviewLabel.textContent = dict.labelReview;
  panel.appendChild(reviewLabel);

  const textarea = document.createElement('textarea');
  textarea.className = 'review-answer modal-answer review-detail';
  textarea.placeholder = dict.reviewPlaceholder;
  textarea.maxLength = MAX_REVIEW;
  textarea.value = eff.review || '';
  panel.appendChild(textarea);

  /* contador de caracteres do review */
  const counter = document.createElement('span');
  counter.className = 'review-count';
  const updateCount = () => {
    counter.textContent = `${textarea.value.length}/${MAX_REVIEW}`;
    counter.classList.toggle('limit', textarea.value.length > MAX_REVIEW - 250);
  };
  textarea.addEventListener('input', updateCount);
  updateCount();
  panel.appendChild(counter);

  /* ações */
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-neon';
  saveBtn.textContent = dict.save;
  saveBtn.addEventListener('click', async () => {
    const ed = {};
    if (apiConfigured()) {
      /* na API, manda rating/review mesmo para LIMPAR (null) */
      if (game.rating !== rating) ed.rating = rating;
      const review = textarea.value.trim();
      if ((game.review || '') !== review) ed.review = review || null;
    } else {
      if (rating) ed.rating = rating;
      if (textarea.value.trim()) ed.review = textarea.value.trim();
    }
    const flash = (txt) => {
      saveBtn.textContent = txt;
      setTimeout(() => (saveBtn.textContent = dict.save), 1200);
    };
    if (apiConfigured() && Object.keys(ed).length) {
      saveBtn.disabled = true;
      try {
        const updated = await patchGame(game.id, ed);
        Object.assign(game, updated);
        EDITS.delete(game.title); /* já está no banco */
      } catch (err) {
        console.error('[lista-de-jogos] falha na API:', err);
        EDITS.set(game.title, { ...EDITS.get(game.title), ...ed });
        saveBtn.disabled = false;
        saveBtn.textContent = dict.saveFailed;
        const status = $('#status-line');
        if (status) status.textContent = `✖ ${err.message}`;
        setTimeout(() => (saveBtn.textContent = dict.save), 1800);
        renderList($('#search').value);
        return;
      }
      persistEdits();
      saveBtn.disabled = false;
      flash(dict.saved);
    } else {
      if (Object.keys(ed).length) EDITS.set(game.title, ed);
      else EDITS.delete(game.title);
      persistEdits();
      flash(dict.saved);
    }
    renderList($('#search').value);
  });
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-ghost';
  copyBtn.textContent = dict.copyNotes;
  copyBtn.addEventListener('click', () => {
    const lines = GAMES.filter(hasEdits).map((g) => {
      const e = EDITS.get(g.title);
      const bits = [];
      if (e.rating) bits.push(`nota: ${e.rating} estrela(s)`);
      if (e.review) bits.push(`review: ${e.review}`);
      const fixes = Object.entries(e)
        .filter(([k]) => !['rating', 'review'].includes(k))
        .map(([k, v]) => `${k}: ${v}`);
      if (fixes.length) bits.push(`campos: ${fixes.join('; ')}`);
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

  textarea.focus({ preventScroll: true });
}

/* ---------- render ---------- */

function renderList(query = '') {
  const dict = I18N[LANG];
  const list = $('#game-list');
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  const filtered = q ? GAMES.filter((g) => gameTitle(g).toLowerCase().includes(q)) : GAMES;

  list.innerHTML = '';
  renderLetterNav();

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'noscript';
    li.textContent = dict.noResults;
    list.appendChild(li);
    $('#count').textContent = dict.count(0);
    return;
  }

  /* agrupa por letra inicial, em ordem alfabética dentro de cada seção */
  const sections = new Map();
  for (const game of filtered) {
    const letter = sectionLetter(gameTitle(game));
    if (!sections.has(letter)) sections.set(letter, []);
    sections.get(letter).push(game);
  }
  for (const group of sections.values()) {
    group.sort((a, b) => gameTitle(a).localeCompare(gameTitle(b), 'pt-br'));
  }

  let seq = 0;
  for (const [letter, games] of [...sections.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const header = document.createElement('li');
    header.className = 'section-header';
    header.id = `sec-${letter.toLowerCase()}`;
    header.textContent = letter;
    list.appendChild(header);

    for (const game of games) {
      seq++;
      const eff = effGame(game);
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

      /* vertical: num → título → estrelas → resto */
      const body = document.createElement('div');
      body.className = 'game-body';

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(seq).padStart(3, '0');
      body.appendChild(num);

      /* Capa do jogo: arquivo estático assets/covers/<id>.jpg|.png|.webp.
         Sem capa, o onerror tenta a próxima extensão e por fim remove. */
      {
        const cover = document.createElement('img');
        cover.className = 'cover';
        cover.loading = 'lazy';
        cover.alt = '';
        const tryCover = (exts) => {
          if (!exts.length) {
            cover.remove();
            return;
          }
          cover.src = `assets/covers/${eff.id}.${exts[0]}`;
          cover.onerror = () => tryCover(exts.slice(1));
        };
        tryCover(['jpg', 'png', 'webp']);
        li.appendChild(cover);
      }

      const metaParts = metaLine(eff);

      /* título + estrelas empilhados (layout vertical) */
      const titleRow = document.createElement('span');
      titleRow.className = 'title-row';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = gameTitle(eff);
      titleRow.appendChild(title);

      if (eff.rating) {
        const r = document.createElement('span');
        r.className = 'rating';
        r.textContent = '★'.repeat(eff.rating) + '☆'.repeat(5 - eff.rating);
        titleRow.appendChild(r);
      }
      body.appendChild(titleRow);

      const sub = renderSubLine(body, eff, metaParts);
      li.appendChild(body);

      if (eff.review) li.classList.add('has-review');

      if (!eff.rating && !metaParts.length && !sub && !hasEdits(game)) {
        const miss = document.createElement('span');
        miss.className = 'missing';
        miss.textContent = dict.missing;
        titleRow.appendChild(miss);
      }

      if (hasEdits(game)) li.classList.add('edited');
      list.appendChild(li);
    }
  }

  $('#count').textContent = dict.count(filtered.length);
}

/* ---------- boot ---------- */

async function loadGames() {
  try {
    if (apiConfigured()) {
      /* API (Worker + Neon): dados sempre frescos do banco */
      GAMES = await fetchGames();
    } else {
      /* modo local: JSON estático + edições do localStorage */
      const res = await fetch('data/games.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      GAMES = data.games || [];
    }
  } catch (err) {
    console.error('[lista-de-jogos] falha ao carregar jogos:', err);
    /* API falhou? tenta o JSON estático como fallback */
    try {
      const res = await fetch('data/games.json');
      const data = await res.json();
      GAMES = data.games || [];
      $('#status-line').textContent = `✖ ${err.message}`;
    } catch (fallbackErr) {
      $('#count').textContent = 'erro ao carregar os jogos';
      console.error('[lista-de-jogos] fallback local também falhou:', fallbackErr);
      return;
    }
  }
  updateStatus();
  renderList($('#search').value);
}

$('#search').addEventListener('input', (e) => renderList(e.target.value));
$('#config-btn').addEventListener('click', openConfig);

$('#lang-toggle').addEventListener('click', () => {
  LANG = LANG === 'pt-br' ? 'en' : 'pt-br';
  localStorage.setItem('lang', LANG);
  applyI18n();
  updateStatus();
  renderList($('#search').value);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

applyI18n();
renderList();
$('#count').textContent = I18N[LANG].loading;
loadGames();
