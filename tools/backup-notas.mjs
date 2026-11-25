/* ============================================================
   backup-notas — cópia semanal de rating/review fora do Neon
   ------------------------------------------------------------
   rating e review existem SÓ no Neon (games.json tem 0) e o
   plano Free guarda 6 h de point-in-time e nenhum snapshot.
   Este script baixa GET {API}/api/games (público), valida,
   extrai as notas e grava notas.json na branch backup-notas
   (via workflow .github/workflows/backup-notas.yml).

   Guardas, no mesmo espírito do SYNC_FORCE do sync-db:
   - tudo validado ANTES de gravar: falha = exit 1 e nada é
     escrito no disco;
   - guarda de perda: se o backup anterior tinha N notas e o
     novo tem mais de 3 a menos, NÃO sobrescreve e sai com
     erro — a perda pode ser liberada de propósito com
     BACKUP_ACEITAR_PERDA=1 (workflow: input `aceitar_perda`).

   O arquivo NÃO tem timestamp: conteúdo idêntico gera
   "sem alteração" e nenhum commit à toa. A restauração dessas
   notas no banco é o PR 8 (ainda não existe).
   ============================================================ */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Baixa GET {url} com até 3 tentativas e 20 s de espera entre elas
 * (cold start do Neon pode dar timeout/500 nas primeiras).
 * @param {string} url - ex. https://worker.example/api/games
 * @param {typeof fetch} fetcher - injetável para testes
 * @returns {Promise<unknown>} JSON da resposta (200)
 */
export async function fetchJogos(url, fetcher = fetch, { tentativas = 3, esperaMs = 20000 } = {}) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetcher(url);
      if (res.status !== 200) {
        throw new Error(`GET /api/games devolveu HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      if (i === tentativas) throw e;
      console.warn(
        `GET ${url} falhou (tentativa ${i}/${tentativas}): ${e.message}; repetindo em ${esperaMs / 1000}s`
      );
      await dormir(esperaMs);
    }
  }
}

/**
 * Valida a resposta antes de qualquer escrita: HTTP 200 já foi checado;
   JSON com `games` array, ≥ 300 jogos, id inteiro e rating null ou
   inteiro 1..5.
 * @returns {true} ou lança Error (o chamador faz exit 1)
 */
export function valida(dados) {
  if (!dados || typeof dados !== 'object' || !Array.isArray(dados.games)) {
    throw new Error('GET /api/games não devolveu games como array');
  }
  if (dados.games.length < 300) {
    throw new Error(`esperava ao menos 300 jogos, veio ${dados.games.length}`);
  }
  for (const j of dados.games) {
    if (!Number.isInteger(j.id)) {
      throw new Error(`id não inteiro: ${JSON.stringify(j.id)}`);
    }
    if (j.rating !== null && (!Number.isInteger(j.rating) || j.rating < 1 || j.rating > 5)) {
      throw new Error(`rating inválido no id ${j.id}: ${JSON.stringify(j.rating)}`);
    }
  }
  return true;
}

/**
 * Extrai, ordenado por id, só os jogos com rating OU review não nulos
 * (undefined conta como null).
 * @returns {{ id: number, title: unknown, rating: number|null, review: string|null }[]}
 */
export function extraiNotas(dados) {
  const temNota = (v) => v !== null && v !== undefined;
  return dados.games
    .filter((j) => temNota(j.rating) || temNota(j.review))
    .sort((a, b) => a.id - b.id)
    .map(({ id, title, rating, review }) => ({
      id,
      title,
      rating: rating ?? null,
      review: review ?? null,
    }));
}

/**
 * Guarda de perda: novo com mais de 3 notas a menos que o anterior
 * não passa — a menos que a perda seja aceita de propósito.
 * @param {number|null} nAnterior - null quando não há backup anterior
 * @param {number} nNovo
 * @param {{ aceitarPerda?: boolean }} [opts]
 * @returns {true} ou lança Error
 */
export function conferePerda(nAnterior, nNovo, { aceitarPerda = false } = {}) {
  if (nAnterior === null || aceitarPerda) return true;
  if (nNovo < nAnterior - 3) {
    throw new Error(
      `o backup anterior tinha ${nAnterior} notas e o novo tem ${nNovo} — perderia ${nAnterior - nNovo}. ` +
        'Se a perda é de propósito, rode com BACKUP_ACEITAR_PERDA=1 (workflow: input `aceitar_perda`)'
    );
  }
  return true;
}

/**
 * Monta o conteúdo estável do notas.json (ordenado por id — extraiNotas
 * já garante —, indentação 2, sem timestamp).
 * @param {{ id: number, title: unknown, rating: number|null, review: string|null }[]} notas
 * @returns {string}
 */
export function montaArquivo(notas) {
  return JSON.stringify({ total: notas.length, jogos: notas }, null, 2) + '\n';
}

/**
 * Fluxo principal, parametrizável para teste. Retorna 'ok' quando
 * gravou, 'sem alteração' quando o conteúdo novo é igual ao anterior.
 * Qualquer problema (validação, guarda de perda, rede) lança Error.
 * @param {{ url?: string, api?: string, destino?: string, anterior?: string,
 *          aceitarPerda?: boolean, fetcher?: typeof fetch, log?: (m: string) => void }} [opts]
 */
export async function main(opts = {}) {
  const {
    url,
    api = process.env.API,
    destino = 'notas.json',
    anterior = process.env.BACKUP_ANTERIOR,
    aceitarPerda = process.env.BACKUP_ACEITAR_PERDA === '1',
    fetcher = fetch,
    log = console.log,
  } = opts;
  if (!url && !api) throw new Error('sem API — informe a env API (URL do Worker)');
  const urlJogos = url ?? `${api}/api/games`;

  const dados = await fetchJogos(urlJogos, fetcher);
  valida(dados);
  const notas = extraiNotas(dados);

  let nAnterior = null;
  let conteudoAnterior = null;
  if (anterior && existsSync(anterior)) {
    conteudoAnterior = readFileSync(anterior, 'utf8');
    const prev = JSON.parse(conteudoAnterior);
    nAnterior = Array.isArray(prev.jogos) ? prev.jogos.length : 0;
  }
  conferePerda(nAnterior, notas.length, { aceitarPerda });

  const conteudo = montaArquivo(notas);
  if (conteudoAnterior !== null && conteudo === conteudoAnterior) {
    log('sem alteração');
    return 'sem alteração';
  }
  writeFileSync(destino, conteudo);
  log(`${notas.length} notas gravadas em ${destino}`);
  return 'ok';
}

/* CLI: `node tools/backup-notas.mjs` — usa env API, BACKUP_ANTERIOR
   e BACKUP_ACEITAR_PERDA; erro → exit 1. Importado pelos testes, não
   roda nada. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((r) => process.stdout.write(`${r}\n`))
    .catch((e) => {
      process.stderr.write(`backup-notas: ${e.message}\n`);
      process.exit(1);
    });
}
