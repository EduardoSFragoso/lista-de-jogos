/* ============================================================
   restore-notas — caminho de volta do backup de notas
   ------------------------------------------------------------
   O backup semanal (tools/backup-notas.mjs → branch backup-notas)
   grava notas.json com { total, jogos: [{id, title, rating, review}] }
   só de jogos com rating ou review. Este script restaura essas notas
   no Neon: é o PR 8 da pendência de restauração.

   Uso (a partir da raiz):
     DATABASE_URL="postgresql://..." node tools/restore-notas.mjs \
       --arquivo notas.json                          (DRY-RUN, padrão)
     DATABASE_URL="postgresql://..." node tools/restore-notas.mjs \
       --arquivo notas.json --aplicar --confirmo-host <rótulo-do-host>
     [--sobrescrever] grava também onde o banco já tem outro valor

   DATABASE_URL SÓ por variável de ambiente. A URL, a senha e o host
   completo NUNCA são impressos — só o primeiro rótulo do host
   (ex.: ep-xxxx), para o dono conferir o alvo.

   Regras:
   - O arquivo é validado ANTES de qualquer consulta (qualquer
     problema → erro, exit 1, zero escritas).
   - DRY-RUN por padrão: lê o banco e imprime contagens; NENHUMA escrita.
   - --aplicar exige --confirmo-host igual ao primeiro rótulo do host
     da DATABASE_URL (evita restaurar na base errada).
   - Por padrão SÓ preenche linhas em que rating E review estão vazios
     no banco; conflitos são pulados e listados (só ids). Com
     --sobrescrever, conflitos também são gravados.
   - Tudo em UMA única atualização "update ... from (values ...)":
     atomicidade do Postgres garante o tudo-ou-nada, sem depender de
     BEGIN/COMMIT (o driver 1.x serverless não faz multi-statement).
   - updated_at é atualizado junto.

   IMPORTANTE (lição do PR 26): o driver @neondatabase/serverless 1.x
   NÃO aceita db("SQL", params) — só tagged template ou db.query(...).
   Aqui tudo vai por db.query(), que aceita SQL + array de parâmetros.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

/* Máximo de parâmetros de uma consulta Postgres: 65535. Cada linha da
   restauração usa 3 (id, rating, review) — um backup de ~20 mil jogos
   caberia; o projeto tem ~500, então MUITO longe do limite. */
const PARAMS_POR_LINHA = 3;
const LIMITE_PARAMS = 60000;

/* Primeiro rótulo do host da URL (ex.: ep-xxxx): bastante para o dono
   conferir o alvo, pequeno demais para expor o host inteiro. */
export function primRotulo(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'host-inválido';
  }
}

/* Valida o arquivo do backup (formato { jogos: [...] }) ANTES de tocar
   no banco. Reúne TODOS os problemas em um único erro. */
export function valida(dados) {
  const problemas = [];
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !Array.isArray(dados.jogos)) {
    problemas.push('o JSON precisa ter "jogos" como array');
  } else {
    const vistos = new Set();
    for (const [i, j] of dados.jogos.entries()) {
      if (!j || typeof j !== 'object' || Array.isArray(j)) {
        problemas.push(`jogo ${i}: não é objeto`);
        continue;
      }
      if (!Number.isInteger(j.id)) {
        problemas.push(`jogo ${i}: id não é inteiro`);
      } else if (vistos.has(j.id)) {
        problemas.push(`id ${j.id} duplicado`);
      } else {
        vistos.add(j.id);
      }
      if (j.rating !== null && (!Number.isInteger(j.rating) || j.rating < 1 || j.rating > 5)) {
        problemas.push(`id ${j.id}: rating só pode ser null ou inteiro 1..5`);
      }
      if (j.review !== null && j.review !== undefined && typeof j.review !== 'string') {
        problemas.push(`id ${j.id}: review só pode ser string ou null`);
      }
    }
  }
  if (problemas.length) {
    throw new Error(
      `notas.json inválido (NADA foi consultado no banco):\n- ${problemas.join('\n- ')}`
    );
  }
  return true;
}

/* Lê e valida o arquivo; normaliza review ausente para null. */
export function carregaNotas(caminho) {
  let dados;
  try {
    dados = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    throw new Error(`não consegui ler/parsear o arquivo ${caminho}: ${e.message}`);
  }
  valida(dados);
  return {
    total: dados.total ?? dados.jogos.length,
    jogos: dados.jogos.map((j) => ({
      id: j.id,
      rating: j.rating ?? null,
      review: j.review ?? null,
    })),
  };
}

/* Lê o estado atual do banco para os ids do backup e classifica:
   faltantes (id não existe mais), idênticos (mesmo valor), aRestaurar
   (banco vazio nos dois campos e backup tem algo) e conflitos (banco
   tem valor diferente do backup). */
export async function planejar(db, notas) {
  const ids = notas.jogos.map((j) => j.id);
  const marcadores = ids.map((_, i) => `$${i + 1}`).join(', ');
  const res = await db.query(
    `select id, rating, review from games where id in (${marcadores})`,
    ids
  );
  /* fullResults do driver dá { rows }; clientes alternativos (ex.: PGlite
     na prova com Postgres real) também dão { rows }; array puro é aceito
     por robustez. */
  const rows = Array.isArray(res) ? res : res.rows;
  const noBanco = new Map(rows.map((r) => [r.id, r]));
  const vazioNoBanco = (r) => (r.rating ?? null) === null && (r.review ?? null) === null;
  const temNota = (j) => j.rating !== null || j.review !== null;
  const plano = { faltantes: [], identicos: [], aRestaurar: [], conflitos: [] };
  for (const j of notas.jogos) {
    const r = noBanco.get(j.id);
    if (!r) {
      plano.faltantes.push(j.id);
    } else if ((r.rating ?? null) === j.rating && (r.review ?? null) === j.review) {
      plano.identicos.push(j.id);
    } else if (vazioNoBanco(r) && temNota(j)) {
      plano.aRestaurar.push(j);
    } else {
      plano.conflitos.push(j);
    }
  }
  return plano;
}

/* Grava TODAS as linhas numa única consulta atômica (tudo ou nada pelo
   Postgres, sem BEGIN/COMMIT — ver cabeçalho). Atualiza updated_at. */
export async function aplicar(db, linhas) {
  if (linhas.length === 0) return 0;
  if (linhas.length * PARAMS_POR_LINHA > LIMITE_PARAMS) {
    throw new Error(
      `${linhas.length} linhas × ${PARAMS_POR_LINHA} passam do limite de parâmetros do Postgres`
    );
  }
  const valores = linhas
    .map((_, i) => {
      const b = i * PARAMS_POR_LINHA;
      return `($${b + 1}::int, $${b + 2}::smallint, $${b + 3}::text)`;
    })
    .join(', ');
  const texto =
    'update games as g set rating = v.rating, review = v.review, updated_at = now() ' +
    `from (values ${valores}) as v(id, rating, review) where g.id = v.id`;
  const params = linhas.flatMap((l) => [l.id, l.rating, l.review]);
  const res = await db.query(texto, params);
  /* rowCount do driver com fullResults; affectedRows é o nome equivalente
     no PGlite (prova com Postgres real). */
  return res.rowCount ?? res.affectedRows ?? 0;
}

export function parseArgs(argv) {
  const opcoes = { arquivo: null, aplicar: false, confirmoHost: null, sobrescrever: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--arquivo':
        opcoes.arquivo = argv[++i] ?? null;
        break;
      case '--aplicar':
        opcoes.aplicar = true;
        break;
      case '--confirmo-host':
        opcoes.confirmoHost = argv[++i] ?? null;
        break;
      case '--sobrescrever':
        opcoes.sobrescrever = true;
        break;
      default:
        throw new Error(`argumento desconhecido: ${argv[i]}`);
    }
  }
  return opcoes;
}

/* Cliente http do Neon — mesmo caminho de conexão do main() e dos
   testes com o driver real. fullResults é OBRIGATÓRIO: sem ele, o
   driver 1.x devolve de db.query() um ARRAY de linhas (sem .rows nem
   .rowCount) e rowCount se perde; com ele, { rows, rowCount, fields }. */
export function criaCliente(url) {
  return neon(url, { fullResults: true });
}

/* main: retorna um resumo e imprime pelo canal `print` (injetável nos
   testes). Erros são lançados — o bloco CLI converte em exit 1. */
export async function main({
  arquivo,
  aplicar: aplicarFlag = false,
  confirmoHost = null,
  sobrescrever = false,
  env = process.env,
  sql = null,
  print = (l) => console.log(l),
} = {}) {
  if (!arquivo) {
    throw new Error(
      'uso: node tools/restore-notas.mjs --arquivo <notas.json> [--aplicar --confirmo-host <rótulo-do-host>] [--sobrescrever]'
    );
  }
  const url = env.DATABASE_URL;
  if (!sql && !url) {
    throw new Error('DATABASE_URL ausente — rode com DATABASE_URL="postgresql://..." (só por env)');
  }
  const rotulo = url ? primRotulo(url) : '(sql injetado)';
  /* A validação veio sempre antes de qualquer consulta ao banco. */
  const notas = carregaNotas(arquivo);
  /* Backup sem nota nenhuma: nada a fazer (e um `where id in ()`
     seria erro de sintaxe). Curto-circuito ANTES de qualquer consulta. */
  if (notas.jogos.length === 0) {
    print('nada a restaurar — o arquivo não tem jogos com nota/review');
    return {
      plano: { faltantes: [], identicos: [], aRestaurar: [], conflitos: [] },
      restaurados: 0,
      pulados: [],
    };
  }
  const db = sql || criaCliente(url);
  print(`alvo do banco: ${rotulo} (primeiro rótulo do host)`);
  print(`backup: ${notas.jogos.length} jogo(s) com nota/review`);
  const plano = await planejar(db, notas);
  print(`faltando no banco (id não existe mais?): ${plano.faltantes.length}`);
  print(`idênticos (nada a fazer): ${plano.identicos.length}`);
  print(`a restaurar (vazios no banco): ${plano.aRestaurar.length}`);
  print(`em conflito (banco tem outro valor): ${plano.conflitos.length}`);
  if (!aplicarFlag) {
    print('DRY-RUN: nenhuma escrita foi feita.');
    return { plano, restaurados: 0, pulados: [] };
  }
  if (!confirmoHost) {
    throw new Error(
      '--aplicar exige --confirmo-host <primeiro-rótulo-do-host> (alvo errado = perda de notas)'
    );
  }
  if (confirmoHost !== rotulo) {
    throw new Error(
      `--confirmo-host "${confirmoHost}" não bate com o alvo (${rotulo}) — nada escrito`
    );
  }
  const alvo = sobrescrever ? [...plano.aRestaurar, ...plano.conflitos] : plano.aRestaurar;
  const pulados = sobrescrever ? [] : plano.conflitos.map((j) => j.id);
  const restaurados = await aplicar(db, alvo);
  if (pulados.length) {
    print(`pulados por conflito (só ids; use --sobrescrever para forçar): ${pulados.join(', ')}`);
  }
  print(`restaurados: ${restaurados} (uma única atualização atômica, updated_at incluso)`);
  return { plano, restaurados, pulados };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main(parseArgs(process.argv.slice(2)));
  } catch (e) {
    console.error('[restore-notas] ' + e.message);
    process.exit(1);
  }
}
