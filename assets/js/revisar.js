/* ============================================================
   Página de revisão — lista só os jogos com _obs (pergunta/suposição)
   ou com campos faltando, e monta um texto de respostas para
   colar no chat. Nada é salvo no repositório daqui.
   ============================================================ */

let GAMES = [];

const $ = (sel) => document.querySelector(sel);

const FIELD_LABELS = {
  year: 'ano',
  platform: 'plataforma',
  engine: 'engine',
  company: 'empresa',
  genre: 'gênero',
  mode: 'modo',
};

function needsReview(g) {
  return Boolean(g._obs);
}

function currentValues(g) {
  return Object.entries(FIELD_LABELS)
    .filter(([k]) => g[k] !== null)
    .map(([k, label]) => `${label}: ${g[k]}`);
}

function render(query = '') {
  const list = $('#review-list');
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  const toReview = GAMES.filter(needsReview).filter((g) => !q || g.title.toLowerCase().includes(q));

  list.innerHTML = '';
  if (toReview.length === 0 && !q) {
    const done = document.createElement('li');
    done.className = 'noscript';
    done.textContent = 'NADA PARA REVISAR — 100% OK, GG!';
    list.appendChild(done);
  }

  toReview.forEach((game) => {
    const li = document.createElement('li');
    li.className = 'game-item review-item';
    li.dataset.title = game.title;

    const wrap = document.createElement('div');
    wrap.className = 'review-body';

    const title = document.createElement('p');
    title.className = 'review-title';
    title.textContent = `${String(game.id).padStart(3, '0')} · ${game.title}`;
    wrap.appendChild(title);

    const vals = document.createElement('p');
    vals.className = 'review-values';
    vals.textContent = currentValues(game).join(' · ') || '(sem metadados)';
    wrap.appendChild(vals);

    const obs = document.createElement('p');
    obs.className = 'review-obs';
    obs.textContent = game._obs;
    wrap.appendChild(obs);

    const answer = document.createElement('textarea');
    answer.className = 'review-answer';
    answer.placeholder = 'Sua resposta (opcional): qual jogo, o que corrigir...';
    if (answers.has(game.title)) {
      answer.value = answers.get(game.title);
      li.classList.add('answered');
    }
    answer.addEventListener('input', () => saveAnswer(game.title, answer.value));
    wrap.appendChild(answer);

    li.appendChild(wrap);
    list.appendChild(li);
  });

  $('#copy').textContent = `COPIAR RESPOSTAS (${toReview.length})`;
}

function updateProgress() {
  const total = GAMES.filter(needsReview).length;
  $('#progress').textContent = answers.size
    ? `${answers.size} de ${total} respondido(s) — salvo no navegador`
    : '';
}

/* respostas ficam no navegador (localStorage) — não se perdem ao recarregar */
const STORAGE_KEY = 'revisar-respostas';
const answers = new Map(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

function persistAnswers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...answers]));
}

function saveAnswer(title, text) {
  if (text.trim()) answers.set(title, text.trim());
  else answers.delete(title);
  persistAnswers();
  updateProgress();
}

function copyAnswers() {
  const lines = GAMES.filter((g) => answers.has(g.title)).map(
    (g) => `${g.title}: ${answers.get(g.title)}`
  );
  const text = lines.length > 0 ? lines.join('\n') : '(nenhuma resposta preenchida)';
  navigator.clipboard.writeText(text).then(
    () => {
      $('#copy').textContent = 'COPIADO! ✓';
      setTimeout(() => render($('#search').value), 1200);
    },
    () => {
      /* fallback: mostra o texto para copiar à mão */
      prompt('Copie abaixo:', text);
    }
  );
}

$('#search').addEventListener('input', (e) => render(e.target.value));
$('#copy').addEventListener('click', copyAnswers);
$('#clear').addEventListener('click', () => {
  if (!answers.size || confirm('Apagar TODAS as respostas salvas no navegador?')) {
    answers.clear();
    persistAnswers();
    render($('#search').value);
    updateProgress();
  }
});

fetch('data/games.json')
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    GAMES = data.games || [];
    render();
    updateProgress();
  })
  .catch((err) => {
    console.error('[revisar] falha ao carregar games.json:', err);
    const li = document.createElement('li');
    li.className = 'noscript';
    li.textContent = 'erro ao carregar data/games.json';
    $('#review-list').appendChild(li);
  });
