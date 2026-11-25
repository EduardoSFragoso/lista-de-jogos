/* Testes estruturais dos workflows de CI — regex sobre os YAML,
   sem dependências novas. Contratos:
   (a) toda action de terceiros é fixada por SHA completo de 40
       caracteres (proteção de supply-chain); a tag de referência
       fica em comentário na mesma linha, ex.: # v7.0.1;
   (b) todo job de todos os workflows tem timeout-minutes;
   (c) todo workflow declara permissions no topo e nenhum usa
       write-all. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../', import.meta.url);
const arquivos = [
  'deploy-pages.yml',
  'deploy-worker.yml',
  'lint.yml',
  'monitor-health.yml',
  'sync-neon.yml',
].map((nome) => ({
  nome,
  texto: readFileSync(new URL(`.github/workflows/${nome}`, raiz), 'utf8'),
}));

/* Todos os valores de `uses:` (aceita o "- " de item de lista YAML). */
const todasUsesModule = (texto) => [...texto.matchAll(/^\s*-\s+uses:\s*(\S+)/gm)].map((m) => m[1]);

/* Jobs do YAML: chaves com EXATAMENTE 2 espaços de indentação dentro
   da seção jobs: (chaves de job têm filhos a partir de 4 espaços). */
const jobsDe = (texto, nomeArq) => {
  const linhas = texto.split(/\r?\n/);
  const iJobs = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  expect(iJobs, `${nomeArq} — seção jobs do YAML`).toBeGreaterThanOrEqual(0);
  const inicios = [];
  for (let i = iJobs + 1; i < linhas.length; i++) {
    const m = linhas[i].match(/^  ([\w-]+):\s*$/);
    if (m) inicios.push({ nome: m[1], linha: i });
  }
  expect(inicios.length, `${nomeArq} — ao menos um job`).toBeGreaterThan(0);
  return inicios.map(({ nome, linha }, k) => ({
    nome,
    corpo: linhas.slice(linha + 1, inicios[k + 1]?.linha ?? linhas.length).join('\n'),
  }));
};

describe('workflows: actions fixadas por SHA de 40 caracteres', () => {
  for (const { nome, texto } of arquivos) {
    const usados = todasUsesModule(texto);
    if (usados.length === 0) continue; // ex. monitor-health: só `run:`, sem action
    it(`${nome}: todo uses: termina em @<40 hex> (tag só em comentário)`, () => {
      for (const uses of usados) {
        expect(uses, `uses: ${uses} em ${nome}`).toMatch(/^[^@]+@[0-9a-f]{40}$/);
      }
    });
  }
});

describe('workflows: todo job tem timeout-minutes', () => {
  for (const { nome, texto } of arquivos) {
    for (const job of jobsDe(texto, nome)) {
      it(`${nome} — job ${job.nome}: timeout-minutes presente`, () => {
        expect(job.corpo, `job ${job.nome} em ${nome}`).toMatch(/^    timeout-minutes:/m);
      });
    }
  }
});

describe('workflows: permissions no topo, nunca write-all', () => {
  for (const { nome, texto } of arquivos) {
    it(`${nome}: declara permissions: no nível raiz`, () => {
      expect(texto, nome).toMatch(/^permissions:\r?$/m);
    });
    it(`${nome}: nenhum write-all`, () => {
      expect(texto, nome).not.toMatch(/write-all/);
    });
  }
});

/* (d) SYNC_FORCE — guardas G1/G2 do sync-db. A única atribuição
   aceitável é a expressão que amarra o valor ao input booleano
   `force` do workflow_dispatch (em push fica vazio). Um
   `SYNC_FORCE: '1'` fixo desligaria as guardas em todo push
   (rating/review sem proteção); apagar a linha também é regressão. */
const SYNC_FORCE_EXATO = "SYNC_FORCE: ${{ inputs.force && '1' || '' }}";

describe('workflows: SYNC_FORCE só no sync-neon e exatamente controlado', () => {
  for (const { nome, texto } of arquivos) {
    const atribuicoes = texto
      .split(/\r?\n/)
      .filter((l) => /SYNC_FORCE\s*:/.test(l))
      .map((l) => l.trim());
    if (nome === 'sync-neon.yml') {
      it(`${nome}: SYNC_FORCE presente e exatamente via input force`, () => {
        expect(atribuicoes, 'apagou ou reescreveu o SYNC_FORCE?').toEqual([SYNC_FORCE_EXATO]);
      });
    } else {
      it(`${nome}: nenhum SYNC_FORCE`, () => {
        expect(atribuicoes).toEqual([]);
      });
    }
  }
});
