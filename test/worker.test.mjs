/* Testes do Worker — rotas que falham antes de tocar o banco
   (auth, CORS). Rodar: npm test (vitest run). */
import { describe, expect, it } from 'vitest';

const worker = (await import('../worker/src/index.js')).default;

const ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  ADMIN_PASSWORD: 'senha-de-teste',
  SESSION_SECRET: 'segredo-de-teste',
  ALLOWED_ORIGIN: 'http://localhost:8080',
};

describe('GET/OPTIONS (públicas)', () => {
  it('OPTIONS responde 204 com headers CORS', async () => {
    const res = await worker.fetch(
      new Request('http://x.test/api/games', { method: 'OPTIONS' }),
      ENV
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ENV.ALLOWED_ORIGIN);
  });

  it('sem DATABASE_URL responde 500 explicativo', async () => {
    const res = await worker.fetch(new Request('http://x.test/api/health'), {
      ALLOWED_ORIGIN: '*',
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/DATABASE_URL/);
  });

  it('/api/ping responde ok mesmo sem DATABASE_URL (não toca no banco)', async () => {
    const res = await worker.fetch(new Request('http://x.test/api/ping'), {
      ALLOWED_ORIGIN: '*',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, worker: 'up' });
  });
});

describe('autenticação das rotas de escrita', () => {
  it('PATCH sem Authorization → 401', async () => {
    const req = new Request('http://x.test/api/games/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ENV.ALLOWED_ORIGIN },
      body: JSON.stringify({ rating: 5 }),
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(401);
  });

  it('PATCH com Bearer errado → 401', async () => {
    const req = new Request('http://x.test/api/games/1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: ENV.ALLOWED_ORIGIN,
        authorization: 'Bearer senha-errada',
      },
      body: JSON.stringify({ rating: 5 }),
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(401);
  });

  it('POST /api/login com senha errada → 401', async () => {
    const req = new Request('http://x.test/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ENV.ALLOWED_ORIGIN },
      body: JSON.stringify({ password: 'nah' }),
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(401);
  });
});
