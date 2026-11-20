/* ============================================================
   db.js — cliente da API (Cloudflare Worker + Neon/PostgreSQL)
   ------------------------------------------------------------
   O site funciona em dois modos:
   - com API configurada (⚙): GET no Worker e PATCH com sessão;
   - sem API: fallback local (data/games.json + localStorage).

   Segurança: só a URL da API fica no localStorage. A senha NÃO é
   salva — ela vai uma vez ao POST /api/login e volta como cookie
   HttpOnly (invisível para o JavaScript deste site), válido 7 dias.
   ============================================================ */

const LS_API = 'api-url';

export function getApiUrl() {
  return (localStorage.getItem(LS_API) || '').trim();
}

export function setApiUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(LS_API, clean);
  else localStorage.removeItem(LS_API);
}

/** true quando o site deve usar a API em vez do modo local. */
export function apiConfigured() {
  return Boolean(getApiUrl());
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('não autenticado — faça login em ⚙ (senha expirou?)');
    }
    if (res.status === 403) {
      throw new Error('origem não permitida pelo Worker (ALLOWED_ORIGIN)');
    }
    if (res.status === 404) {
      throw new Error(`não encontrado (404): ${detail.error || url}`);
    }
    throw new Error(detail.error || `erro ${res.status} na API`);
  }
  return res.json();
}

/** Busca todos os jogos na API. @returns {Promise<Array>} */
export async function fetchGames() {
  const api = getApiUrl();
  if (!api) throw new Error('API não configurada');
  const data = await request(`${api}/api/games`);
  return data.games || [];
}

/**
 * Envia a senha ao Worker e abre a sessão (cookie HttpOnly, 7 dias).
 * @param {string} url URL base da API (sem barra final)
 * @returns {Promise<void>}
 */
export async function login(url, password) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  await request(`${clean}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  setApiUrl(clean); /* só persiste a URL depois do login OK */
}

/** Encerra a sessão no Worker (melhor esforço). */
export async function logout() {
  const api = getApiUrl();
  if (api) await request(`${api}/api/logout`, { method: 'POST' }).catch(() => {});
}

/**
 * Aplica um patch num jogo via API (requer sessão aberta).
 * @param {number} id id do jogo
 * @param {object} patch campos permitidos (whitelist do Worker)
 * @returns {Promise<object>} jogo atualizado
 */
export async function patchGame(id, patch) {
  const api = getApiUrl();
  if (!api) throw new Error('API não configurada');
  const data = await request(`${api}/api/games/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.game;
}
