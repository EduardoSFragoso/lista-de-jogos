/* ============================================================
   db.js — cliente da API (Cloudflare Worker + Neon/PostgreSQL)
   ------------------------------------------------------------
   O site funciona em dois modos:
   - com API configurada (⚙): GET/PATCH direto no Worker;
   - sem API: fallback local (data/games.json + localStorage).
   A URL da API e o token ficam no localStorage do navegador.
   ============================================================ */

const LS_API = 'api-url';
const LS_TOKEN = 'api-token';

export function getApiUrl() {
  return (localStorage.getItem(LS_API) || '').trim();
}

export function setApiUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(LS_API, clean);
  else localStorage.removeItem(LS_API);
}

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || '';
}

export function setToken(token) {
  if (token && token.trim()) localStorage.setItem(LS_TOKEN, token.trim());
  else localStorage.removeItem(LS_TOKEN);
}

/** true quando o site deve usar a API em vez do modo local. */
export function apiConfigured() {
  return Boolean(getApiUrl());
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('token ausente ou inválido (401)');
    if (res.status === 404) throw new Error(`não encontrado (404): ${detail.error || url}`);
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
 * Aplica um patch num jogo via API.
 * @param {number} id id do jogo
 * @param {object} patch campos permitidos (whitelist do Worker)
 * @returns {Promise<object>} jogo atualizado
 */
export async function patchGame(id, patch) {
  const api = getApiUrl();
  const apiToken = getToken();
  if (!api || !apiToken) throw new Error('API/token não configurados');
  const data = await request(`${api}/api/games/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify(patch),
  });
  return data.game;
}
