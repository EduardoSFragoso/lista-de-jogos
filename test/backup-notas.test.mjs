/* Testes do backup de notas (tools/backup-notas.mjs) — sem rede e
   sem dependências novas: o fetch é injetado (fetcher fake) e os
   arquivos vão para temporários do próprio teste.

   Contrato do módulo:
   - baixa GET {API}/api/games com até 3 tentativas e 20 s de espera
     (cold start do Neon);
   - valida: HTTP 200, `games` array, ≥ 300 jogos, id inteiro,
     rating null ou inteiro 1..5 — qualquer falha = erro e NADA
     é gravado;
   - notas.json estável (ordenado por id, indentação 2), { total,
     jogos: [{ id, title, rating, review }] }, só jogos com rating OU
     review não nulos, sem timestamp (não gerar commit à toa);
   - guarda de perda: anterior N notas e novo N-4 ou menos → NÃO
     sobrescreve e sai com erro; liberável com BACKUP_ACEITAR_PERDA=1;
   - sem mudança → indica "sem alteração" e não regrava. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  conferePerda,
  extraiNotas,
  fetchJogos,
  main,
  montaArquivo,
  valida,
} from '../tools/backup-notas.mjs';

let tmp;
const tempDir = () => (tmp ??= mkdtempSync(join(tmpdir(), 'backup-notas-')));
afterEach(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

/* Base com 300 jogos válidos (mínimo do valida); o id 300... não tem
   nota — casos de nota entram por cima dos primeiros ids. */
const jogo = (id, extra = {}) => ({
  id,
  title: `Jogo ${id}`,
  rating: null,
  review: null,
  updated_at: 'agora',
  ...extra,
});
const jogosBase = (n = 300) => Array.from({ length: n }, (_, i) => jogo(i + 1));

const resposta = (status, corpo) => ({
  status,
  json: async () => JSON.parse(corpo),
});

describe('fetchJogos: 3 tentativas e HTTP 200', () => {
  it('devolve o JSON em caso de sucesso', async () => {
    const dados = jogosBase();
    const fetcher = async () => resposta(200, JSON.stringify(dados));
    await expect(fetchJogos('http://x/api/games', fetcher)).resolves.toEqual(dados);
  });

  it('retry: falha 2 vezes e acerta na 3ª', async () => {
    const dados = jogosBase();
    let chamadas = 0;
    const fetcher = async () => {
      chamadas++;
      return chamadas < 3 ? resposta(500, '{"erro":true}') : resposta(200, JSON.stringify(dados));
    };
    await expect(fetchJogos('http://x/api/games', fetcher, { esperaMs: 0 })).resolves.toEqual(
      dados
    );
    expect(chamadas).toBe(3);
  });

  it('HTTP != 200 nas 3 tentativas → erro', async () => {
    let chamadas = 0;
    const fetcher = async () => {
      chamadas++;
      return resposta(503, '{"erro":true}');
    };
    await expect(fetchJogos('http://x/api/games', fetcher, { esperaMs: 0 })).rejects.toThrow(/503/);
    expect(chamadas).toBe(3);
  });
});

describe('valida: formato e limites', () => {
  it('aceita a base válida (300 jogos)', () => {
    expect(valida({ games: jogosBase() })).toBe(true);
  });

  it('JSON sem `games` array → erro', () => {
    expect(() => valida({})).toThrow(/games/);
    expect(() => valida({ games: 'não' })).toThrow(/games/);
    expect(() => valida(null)).toThrow(/games/);
  });

  it('menos de 300 jogos → erro', () => {
    expect(() => valida({ games: jogosBase().slice(0, 299) })).toThrow(/300/);
  });

  it('id não inteiro → erro', () => {
    const games = jogosBase();
    games[7] = { ...games[7], id: '8' };
    expect(() => valida({ games })).toThrow(/id não inteiro/);
    const games2 = jogosBase();
    games2[7] = { ...games2[7], id: 8.5 };
    expect(() => valida({ games: games2 })).toThrow(/id não inteiro/);
  });

  it('rating 0, 6, "5" e 4.5 → erro; 1 e 5 e null passam', () => {
    for (const rating of [0, 6, '5', 4.5]) {
      const games = jogosBase();
      games[0] = { ...games[0], rating };
      expect(() => valida({ games }), `rating ${rating}`).toThrow(/rating/);
    }
    const games = jogosBase();
    games[0] = { ...games[0], rating: 1 };
    games[1] = { ...games[1], rating: 5 };
    expect(valida({ games })).toBe(true);
  });
});

describe('extraiNotas + montaArquivo: estável, ordenado e sem timestamp', () => {
  const dados = () => {
    const games = jogosBase();
    games[299] = { ...games[299], title: 'Z', rating: 5 }; // id 300
    games[9] = { ...games[9], title: 'B', review: 'Muito bom' }; // id 10, rating null
    games[4] = { ...games[4], title: 'C', rating: 4, review: null }; // id 5
    games[5] = { ...games[5], title: 'A', rating: null }; // id 6, sem nota
    return { games };
  };

  it('gera só jogos com nota/review e ordena por id', () => {
    const notas = extraiNotas(dados());
    expect(notas.map((n) => n.id)).toEqual([5, 10, 300]);
    expect(notas[0]).toEqual({ id: 5, title: 'C', rating: 4, review: null });
    expect(notas[1]).toEqual({ id: 10, title: 'B', rating: null, review: 'Muito bom' });
    expect(notas[2]).toEqual({ id: 300, title: 'Z', rating: 5, review: null });
  });

  it('arquivo estável: duas execuções idênticas e sem "timestamp" dentro', () => {
    const um = montaArquivo(extraiNotas(dados()));
    const outro = montaArquivo(extraiNotas(dados()));
    expect(outro).toBe(um);
    expect(um).toBe(
      JSON.stringify(
        {
          total: 3,
          jogos: [
            { id: 5, title: 'C', rating: 4, review: null },
            { id: 10, title: 'B', rating: null, review: 'Muito bom' },
            { id: 300, title: 'Z', rating: 5, review: null },
          ],
        },
        null,
        2
      ) + '\n'
    );
  });
});

describe('conferePerda: guarda de perda de notas', () => {
  it('anterior 10, novo 5 → erro e nada gravado (a perda é 5, > 3)', () => {
    expect(() => conferePerda(10, 5)).toThrow(/perderia 5/);
  });

  it('aceitável com BACKUP_ACEITAR_PERDA=1', () => {
    expect(conferePerda(10, 5, { aceitarPerda: true })).toBe(true);
  });

  it('novo 8 de 10 → aceito (perda de 2 ≤ 3)', () => {
    expect(conferePerda(10, 8)).toBe(true);
  });

  it('sem backup anterior (null) → tudo aceito', () => {
    expect(conferePerda(null, 0)).toBe(true);
    expect(conferePerda(null, 0, {})).toBe(true);
  });
});

describe('main: válido, estável, guarda de perda e "sem alteração"', () => {
  const dadosComNotas = (n) => {
    const games = jogosBase(Math.max(n, 300));
    for (let i = 0; i < n; i++) games[i] = { ...games[i], rating: 3 };
    return { games };
  };
  const fetcherOk = (dados) => async () => resposta(200, JSON.stringify(dados));
  const quiet = () => {};

  it('grava notas.json e na 2ª execução idêntica indica "sem alteração"', async () => {
    const dir = tempDir();
    const destino = join(dir, 'notas.json');
    const anterior = join(dir, 'anterior.json');
    const opts = {
      url: 'http://x/api/games',
      destino,
      anterior,
      fetcher: fetcherOk(dadosComNotas(400)),
      log: quiet,
    };
    // sem arquivo anterior: grava
    writeFileSync(anterior, '{}');
    await expect(main(opts)).resolves.toBe('ok');
    const gravado = readFileSync(destino, 'utf8');
    expect(JSON.parse(gravado).total).toBe(400);
    expect(gravado.endsWith('\n')).toBe(true);
    // próximo backup idêntico ao anterior (anterior := gravado) → "sem alteração"
    const gravado2 = readFileSync(destino, 'utf8');
    writeFileSync(anterior, gravado2);
    const antes = readFileSync(destino, 'utf8');
    await expect(main(opts)).resolves.toBe('sem alteração');
    expect(readFileSync(destino, 'utf8')).toBe(antes);
  });

  it('guarda de perda: anterior com 10 notas, novo com 5 → erro e NÃO sobrescreve', async () => {
    const dir = tempDir();
    const destino = join(dir, 'notas.json');
    const anterior = join(dir, 'anterior.json');
    // anterior real: 10 notas
    const diezNotas = JSON.stringify(
      { total: 10, jogos: extraiNotas(dadosComNotas(400)).slice(0, 10) },
      null,
      2
    );
    writeFileSync(anterior, diezNotas);
    writeFileSync(destino, diezNotas);
    // novo backup: 300 jogos válidos (mínimo), só os 5 primeiros com nota
    const cinco = {
      games: jogosBase().map((g, i) => (i < 5 ? { ...g, rating: 3 } : g)),
    };
    await expect(
      main({
        url: 'http://x/api/games',
        destino,
        anterior,
        fetcher: fetcherOk(cinco),
        log: quiet,
      })
    ).rejects.toThrow(/perderia 5/);
    expect(readFileSync(destino, 'utf8')).toBe(diezNotas); // intocado
  });

  it('aceitarPerda invocado via BACKUP_ACEITAR_PERDA=1 grava', async () => {
    const dir = tempDir();
    const destino = join(dir, 'notas.json');
    const anterior = join(dir, 'anterior.json');
    writeFileSync(anterior, montaArquivo(extraiNotas(dadosComNotas(10))));
    const five = {
      games: jogosBase()
        .slice(0, 300)
        .map((g, i) => (i < 5 ? { ...g, rating: 2 } : g)),
    };
    await expect(
      main({
        url: 'http://x/api/games',
        destino,
        anterior,
        aceitarPerda: true,
        fetcher: fetcherOk(five),
        log: quiet,
      })
    ).resolves.toBe('ok');
    expect(JSON.parse(readFileSync(destino, 'utf8')).total).toBe(5);
  });

  it('por env: BACKUP_ACEITAR_PERDA=1 no ambiente aceita a perda', async () => {
    const dir = tempDir();
    const destino = join(dir, 'notas.json');
    const anterior = join(dir, 'anterior.json');
    writeFileSync(anterior, montaArquivo(extraiNotas(dadosComNotas(10))));
    const five = {
      games: jogosBase().map((g, i) => (i < 5 ? { ...g, rating: 2 } : g)),
    };
    vi.stubEnv('BACKUP_ACEITAR_PERDA', '1');
    try {
      await expect(
        main({
          url: 'http://x/api/games',
          destino,
          anterior,
          fetcher: fetcherOk(five),
          log: quiet,
        })
      ).resolves.toBe('ok');
      expect(JSON.parse(readFileSync(destino, 'utf8')).total).toBe(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
