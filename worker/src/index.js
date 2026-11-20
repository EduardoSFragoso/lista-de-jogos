/* ============================================================
   lista-api — Cloudflare Worker + Neon (PostgreSQL)
   ------------------------------------------------------------
   API REST da Lista de Jogos:
     GET    /api/health      → status do serviço (público)
     GET    /api/games       → lista completa de jogos (público)
     PATCH  /api/games/:id   → atualiza campos de um jogo (auth)
     POST   /api/games       → cria um jogo novo (auth)
     POST   /api/login       → abre sessão (cookie HttpOnly)
     POST   /api/logout      → encerra sessão

   Autenticação nas rotas de escrita, de duas formas:
   1. Site: POST /api/login valida a senha (secret ADMIN_PASSWORD,
      comparada em tempo constante) e devolve um cookie de sessão
      HttpOnly + Secure — HMAC-SHA256 do payload "iat.jti.exp"
      assinado com SESSION_SECRET (7 dias, sem estado). O JS do
      site NÃO consegue ler esse cookie. Trocar SESSION_SECRET
      revoga todas as sessões abertas.
   2. Terminal/scripts: header `Authorization: Bearer <senha>`.

   Em ambas, toda escrita também exige Origin igual a ALLOWED_ORIGIN
   (via navegador) — isso bloqueia CSRF de outros sites.

   Banco: driver serverless do Neon via HTTP/fetch — não usa
   Hyperdrive (veja comentário no wrangler.toml).
   ============================================================ */

import { neon } from '@neondatabase/serverless';

/** Campos permitidos em PATCH/POST (whitelist). */
const EDITABLE_TEXT = [
  'title',
  'title_pt',
  'platform',
  'engine',
  'company',
  'genre',
  'mode',
  'review',
];
const EDITABLE_INT = ['year', 'rating'];
const MAX_TEXT = 200;
const MAX_REVIEW = 4000;

const COOKIE = 'lista_session';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 dias, em segundos

/* ---------------- helpers de resposta/CORS ---------------- */

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(env, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(env),
      ...extraHeaders,
    },
  });
}

function fail(env, status, message) {
  return json(env, { error: message }, status);
}

/* ---------------- sessão (HMAC-SHA256 com SESSION_SECRET) ---------------- */

/**
 * Comparação de strings em tempo constante (UTF-8).
 * Evita vazamento de informação por variação de tempo em `===`
 * quando um dos lados é segredo.
 */
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cookie de sessão: "<iat>.<jti>.<exp>.<hmac do payload>".
 * Sem estado; iat = emissão (epoch s), jti = id aleatório da
 * sessão, exp = expiração (epoch s). Assinado com SESSION_SECRET
 * — trocar esse secret revoga todas as sessões.
 */
async function createSessionCookie(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = [now, crypto.randomUUID(), now + SESSION_TTL].join('.');
  const sig = await hmacHex(env.SESSION_SECRET, payload);
  return {
    value: `${payload}.${sig}`,
    setCookie: `${COOKIE}=${payload}.${sig}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL}`,
  };
}

function readSessionCookie(req) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

async function sessionValid(req, env) {
  if (!env.SESSION_SECRET) return false;
  const raw = readSessionCookie(req);
  if (!raw) return false;
  const parts = raw.split('.');
  if (parts.length !== 4) return false;
  const [iatStr, jti, expStr, sig] = parts;
  const exp = Number(expStr);
  const iat = Number(iatStr);
  if (
    !Number.isInteger(exp) ||
    !Number.isInteger(iat) ||
    iat > exp ||
    exp < Math.floor(Date.now() / 1000) ||
    !/^[0-9a-f-]{36}$/.test(jti) ||
    !sig
  ) {
    return false;
  }
  const expected = await hmacHex(env.SESSION_SECRET, [iatStr, jti, expStr].join('.'));
  return safeEqual(sig, expected);
}

/** Escritas: cookie de sessão (site) OU bearer password (terminal). */
async function authorized(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Bearer ') && safeEqual(header.slice(7), env.ADMIN_PASSWORD)) {
    return true;
  }
  return sessionValid(req, env);
}

/** Em rotas de escrita autenticadas por cookie, exige Origin confiável. */
function originAllowed(req, env) {
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return true; // dev/teste
  return req.headers.get('origin') === env.ALLOWED_ORIGIN;
}

/* ---------------- validação ---------------- */

/**
 * Valida e normaliza o corpo de PATCH/POST.
 * @returns {{ ok: true, fields: object } | { ok: false, error: string }}
 */
function validate(body, { partial }) {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'corpo precisa ser um objeto JSON' };
  }
  const fields = {};
  for (const key of EDITABLE_TEXT) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null) {
      fields[key] = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      const limit = key === 'review' ? MAX_REVIEW : MAX_TEXT;
      if (trimmed.length > limit) {
        return { ok: false, error: `${key} excede ${limit} caracteres` };
      }
      fields[key] = trimmed || null;
    } else {
      return { ok: false, error: `${key} precisa ser string ou null` };
    }
  }
  for (const key of EDITABLE_INT) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null) {
      fields[key] = null;
    } else if (Number.isInteger(v)) {
      if (key === 'rating' && (v < 1 || v > 5)) {
        return { ok: false, error: 'rating precisa estar entre 1 e 5' };
      }
      if (key === 'year' && (v < 1950 || v > 2100)) {
        return { ok: false, error: 'year precisa ser um ano válido' };
      }
      fields[key] = v;
    } else {
      return { ok: false, error: `${key} precisa ser inteiro ou null` };
    }
  }
  if (!partial && !fields.title) {
    return { ok: false, error: 'title é obrigatório' };
  }
  if (!partial && Object.keys(fields).length === 0) {
    return { ok: false, error: 'nenhum campo válido enviado' };
  }
  return { ok: true, fields };
}

/* ---------------- handler ---------------- */

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (!env.DATABASE_URL) {
      return fail(env, 500, 'DATABASE_URL não configurada no Worker');
    }
    const sql = neon(env.DATABASE_URL);
    const url = new URL(req.url);
    const { pathname } = url;

    try {
      /* -------- GET /api/health -------- */
      if (req.method === 'GET' && pathname === '/api/health') {
        const [row] = await sql`select count(*)::int as total from games`;
        return json(env, { ok: true, total: row.total });
      }

      /* -------- GET /api/games -------- */
      if (req.method === 'GET' && pathname === '/api/games') {
        const games = await sql`
          select id, title, title_pt, year, platform, engine,
                 rating, company, genre, mode, review, updated_at
          from games
          order by title`;
        return json(env, { games });
      }

      /* -------- POST /api/login (abre sessão) -------- */
      if (req.method === 'POST' && pathname === '/api/login') {
        if (!env.ADMIN_PASSWORD) {
          return fail(env, 500, 'ADMIN_PASSWORD não configurada no Worker');
        }
        if (!originAllowed(req, env)) {
          return fail(env, 403, 'origem não permitida');
        }
        const body = await req.json().catch(() => null);
        if (!env.SESSION_SECRET) {
          return fail(env, 500, 'SESSION_SECRET não configurado no Worker');
        }
        if (
          !body ||
          typeof body.password !== 'string' ||
          !safeEqual(body.password, env.ADMIN_PASSWORD)
        ) {
          return fail(env, 401, 'senha incorreta');
        }
        const session = await createSessionCookie(env);
        return json(env, { ok: true }, 200, { 'set-cookie': session.setCookie });
      }

      /* -------- POST /api/logout -------- */
      if (req.method === 'POST' && pathname === '/api/logout') {
        const clearCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
        return json(env, { ok: true }, 200, { 'set-cookie': clearCookie });
      }

      /* -------- POST /api/games (novo jogo) -------- */
      if (req.method === 'POST' && pathname === '/api/games') {
        if (!(await authorized(req, env))) {
          return fail(env, 401, 'não autenticado — faça login ou use Bearer');
        }
        if (!originAllowed(req, env)) {
          return fail(env, 403, 'origem não permitida');
        }
        const body = await req.json().catch(() => null);
        const check = validate(body, { partial: false });
        if (!check.ok) return fail(env, 400, check.error);
        const f = check.fields;
        const [game] = await sql`
          insert into games (id, title, title_pt, year, platform, engine,
                             rating, company, genre, mode, review)
          values ((select coalesce(max(id), 0) + 1 from games),
                  ${f.title}, ${f.title_pt}, ${f.year}, ${f.platform},
                  ${f.engine}, ${f.rating}, ${f.company}, ${f.genre},
                  ${f.mode}, ${f.review})
          returning id, title, title_pt, year, platform, engine,
                    rating, company, genre, mode, review, updated_at`;
        return json(env, { game }, 201);
      }

      /* -------- PATCH /api/games/:id -------- */
      const patchMatch = pathname.match(/^\/api\/games\/(\d+)$/);
      if (req.method === 'PATCH' && patchMatch) {
        if (!(await authorized(req, env))) {
          return fail(env, 401, 'não autenticado — faça login ou use Bearer');
        }
        if (!originAllowed(req, env)) {
          return fail(env, 403, 'origem não permitida');
        }
        const id = Number(patchMatch[1]);
        const body = await req.json().catch(() => null);
        const check = validate(body, { partial: true });
        if (!check.ok) return fail(env, 400, check.error);
        if (Object.keys(check.fields).length === 0) {
          return fail(env, 400, 'nenhum campo válido enviado');
        }
        /* O driver HTTP do Neon não tem helpers (sql.identifier/query).
           Workaround: UPDATE com ATUALIZAÇÕES de colunas 100% fixas no
           template, uma flag "enviado?" por coluna. Flag 0 mantém o valor
           atual; flag 1 aplica (inclui zerar com null). As colunas vêm só
           da whitelist (validate), então nada dinâmico entra no SQL. */
        const flag = (col) => (col in check.fields ? 1 : 0);
        const val = (col) => (col in check.fields ? check.fields[col] : null);
        const [game] = await sql`
          update games set
            title      = case when ${flag('title')} = 1 then ${val('title')} else title end,
            title_pt   = case when ${flag('title_pt')} = 1 then ${val('title_pt')} else title_pt end,
            platform   = case when ${flag('platform')} = 1 then ${val('platform')} else platform end,
            engine     = case when ${flag('engine')} = 1 then ${val('engine')} else engine end,
            company    = case when ${flag('company')} = 1 then ${val('company')} else company end,
            genre      = case when ${flag('genre')} = 1 then ${val('genre')} else genre end,
            mode       = case when ${flag('mode')} = 1 then ${val('mode')} else mode end,
            review     = case when ${flag('review')} = 1 then ${val('review')} else review end,
            year       = case when ${flag('year')} = 1 then ${val('year')} else year end,
            rating     = case when ${flag('rating')} = 1 then ${val('rating')} else rating end,
            updated_at = now()
          where id = ${id}
          returning id, title, title_pt, year, platform, engine,
                    rating, company, genre, mode, review, updated_at`;
        if (!game) return fail(env, 404, `jogo ${id} não encontrado`);
        return json(env, { game });
      }

      return fail(env, 404, 'rota não encontrada');
    } catch (err) {
      console.error('worker error:', err);
      return fail(env, 500, 'erro interno do Worker');
    }
  },
};
