/* ============================================================
   gh.js — gravação de data/games.json direto no repositório
   via API de conteúdo do GitHub. Requer um Personal Access Token
   (fine-grained) com permissão "Contents: Read and write" APENAS
   neste repositório. O token fica no localStorage do navegador.
   ============================================================ */

const LS_TOKEN = 'gh-pat';
const LS_REPO = 'gh-repo';
const JSON_PATH = 'data/games.json';
const DEFAULT_REPO = 'EduardoSFragoso/lista-de-jogos';

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || '';
}

export function getRepo() {
  return localStorage.getItem(LS_REPO) || DEFAULT_REPO;
}

export function setToken(token) {
  if (token) localStorage.setItem(LS_TOKEN, token.trim());
  else localStorage.removeItem(LS_TOKEN);
}

export function setRepo(repo) {
  if (repo && repo.trim()) localStorage.setItem(LS_REPO, repo.trim());
  else localStorage.removeItem(LS_REPO);
}

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('token invalido ou expirado (401)');
    if (res.status === 403)
      throw new Error('acesso negado (403) — o token precisa de Contents: Read and write');
    if (res.status === 404) throw new Error('arquivo ou repo nao encontrado (404)');
    throw new Error(detail.message || `erro ${res.status}`);
  }
  return res.json();
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* aplica as edições locais (EDITS) sobre a copy nova do array */
export function mergeEdits(games, edits) {
  return games.map((g) => {
    const ed = edits.get(g.title);
    if (!ed) return g;
    const merged = { ...g, ...ed };
    if (typeof merged.year === 'string' && /^\d{4}$/.test(merged.year)) {
      merged.year = Number(merged.year);
    }
    return merged;
  });
}

/**
 * Publica o games.json inteiro (com edições aplicadas) num commit.
 * @returns {string} URL da página do commit
 */
export async function publishGames(games, edits, message = 'Notas e reviews pelo site') {
  if (!getToken()) {
    throw new Error('sem token — configure em ⚙ (PAT do GitHub)');
  }
  const file = await gh(`/repos/${getRepo()}/contents/${JSON_PATH}?ref=main`);

  const merged = mergeEdits(games, edits);
  const content = JSON.stringify({ games: merged }, null, 2) + '\n';

  const res = await gh(`/repos/${getRepo()}/contents/${JSON_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(content),
      sha: file.sha,
      branch: 'main',
    }),
  });
  return res.commit?.html_url || '';
}
