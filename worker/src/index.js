/* ============================================================
   lista-api — Cloudflare Worker + Neon (PostgreSQL)
   ------------------------------------------------------------
   API REST da Lista de Jogos:
     GET    /api/health      → status do serviço (público)
     GET    /api/games       → lista completa de jogos (público)
     PATCH  /api/games/:id   → atualiza campos de um jogo (token)
     POST   /api/games       → cria um jogo novo (token)

   Autenticação: header `Authorization: Bearer <ADMIN_TOKEN>`
   apenas nas rotas de escrita. O ADMIN_TOKEN é um secret do
   Worker (`npx wrangler secret put ADMIN_TOKEN`).

   Banco: driver serverless do Neon via HTTP/fetch — não usa
   Hyperdrive (veja comentário no wrangler.toml).
   ============================================================ */

import { neon } from '@neondatabase/serverless';

/** Campos permitidos em PATCH/POST (whitelist). */
const EDITABLE_TEXT = ['title', 'title_pt', 'platform', 'engine', 'company', 'genre', 'mode'];
const EDITABLE_INT = ['year', 'rating'];
const MAX_TEXT = 200;
const MAX_REVIEW = 4000;

/* ---------------- helpers de resposta/CORS ---------------- */

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
  };
}

function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(env),
    },
  });
}

function fail(env, status, message) {
  return json(env, { error: message }, status);
}

/** 401 se o token não bater com o secret ADMIN_TOKEN. */
function authorized(req, env) {
  const header = req.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && header === `Bearer ${env.ADMIN_TOKEN}`;
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

/** Monta SET de um UPDATE dinâmico (colunas ≤ whitelist, safe). */
function buildSet(sql, fields) {
  const sets = Object.keys(fields).map((col) => sql`${sql.identifier(col)} = ${fields[col]}`);
  sets.push(sql`updated_at = now()`);
  return sql.join(sets, sql`, `);
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

      /* -------- POST /api/games (novo jogo) -------- */
      if (req.method === 'POST' && pathname === '/api/games') {
        if (!authorized(req, env)) return fail(env, 401, 'token ausente ou inválido');
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
        if (!authorized(req, env)) return fail(env, 401, 'token ausente ou inválido');
        const id = Number(patchMatch[1]);
        const body = await req.json().catch(() => null);
        const check = validate(body, { partial: true });
        if (!check.ok) return fail(env, 400, check.error);
        if (Object.keys(check.fields).length === 0) {
          return fail(env, 400, 'nenhum campo válido enviado');
        }
        const [game] = await sql`
          update games set ${buildSet(sql, check.fields)}
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
