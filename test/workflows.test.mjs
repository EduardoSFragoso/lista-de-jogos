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
  'backup-notas.yml',
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

/* (d) SYNC_FORCE e BACKUP_ACEITAR_PERDA em QUALQUER forma. Critério
   antigo só enxergava a forma YAML `SYNC_FORCE:` — um
   `run: SYNC_FORCE=1 node sync-db.mjs` (shell) passava batido e
   desligaria as guardas G1/G2 do sync-db em todo push. Novo critério,
   em TODOS os workflows: toda linha NÃO comentária que contenha o
   nome da variável deve ser exatamente a atribuição que amarra o
   valor ao input booleano do workflow_dispatch — e só no workflow
   certo (sync-neon.yml / backup-notas.yml, que precisam tê-la).
   Linhas de comentário (#) são ignoradas; linhas `description:` de
   input também (metadados que citam a env por documentação — uma
   description nunca atribui valor). */
const SYNC_FORCE_EXATO = "SYNC_FORCE: ${{ inputs.force && '1' || '' }}";
const BACKUP_PERDA_EXATO = "BACKUP_ACEITAR_PERDA: ${{ inputs.aceitar_perda && '1' || '' }}";

const linhasComAtribuicao = (texto, nomeVar) =>
  texto
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.includes(nomeVar) && !l.trim().startsWith('#') && !l.trim().startsWith('description:')
    )
    .map((l) => l.trim());

describe('workflows: SYNC_FORCE e BACKUP_ACEITAR_PERDA só na forma exata e só no lugar certo', () => {
  for (const { nome, texto } of arquivos) {
    const sync = linhasComAtribuicao(texto, 'SYNC_FORCE');
    const perda = linhasComAtribuicao(texto, 'BACKUP_ACEITAR_PERDA');
    const esperadoSync = nome === 'sync-neon.yml' ? [SYNC_FORCE_EXATO] : [];
    const esperadoPerda = nome === 'backup-notas.yml' ? [BACKUP_PERDA_EXATO] : [];
    it(`${nome}: SYNC_FORCE ${nome === 'sync-neon.yml' ? 'presente e exatamente via input force' : 'ausente'}`, () => {
      expect(sync, 'forma shell SYNC_FORCE=1 ou valor fixo desligaria as guardas G1/G2').toEqual(
        esperadoSync
      );
    });
    it(`${nome}: BACKUP_ACEITAR_PERDA ${nome === 'backup-notas.yml' ? 'presente e exatamente via input aceitar_perda' : 'ausente'}`, () => {
      expect(perda, 'forma shell ou valor fixo desligaria a guarda de perda do backup').toEqual(
        esperadoPerda
      );
    });
  }
  it('backup-notas.yml: a atribuição está no passo que roda o script', () => {
    const bnf = arquivos.find(({ nome }) => nome === 'backup-notas.yml').texto;
    const linhas = bnf.split(/\r?\n/);
    const inicio = linhas.findIndex((l) => /^      - name: Roda o backup/.test(l));
    expect(inicio, 'passo "Roda o backup" não encontrado').toBeGreaterThanOrEqual(0);
    const fim = linhas.findIndex((l, i) => i > inicio && /^      - (name|uses):/.test(l));
    const passo = linhas.slice(inicio, fim === -1 ? linhas.length : fim).join('\n');
    expect(passo).toContain(BACKUP_PERDA_EXATO);
  });
});

describe('workflows: deploy-pages roda quando o próprio workflow muda', () => {
  it('push.paths inclui .github/workflows/deploy-pages.yml', () => {
    const dp = arquivos.find(({ nome }) => nome === 'deploy-pages.yml').texto;
    const linhas = dp.split(/\r?\n/);
    const iPaths = linhas.findIndex((l) => /^\s*paths:\s*$/.test(l));
    expect(iPaths, 'gatilho push.paths não encontrado').toBeGreaterThanOrEqual(0);
    const bloco = [];
    for (let i = iPaths + 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (l.trim() === '' || l.trim().startsWith('#')) continue; // comentários não encerram a lista
      if (!/^\s+- /.test(l)) break;
      bloco.push(l.replace(/^\s+-\s*/, ''));
    }
    expect(bloco).toContain('.github/workflows/deploy-pages.yml');
  });
});

/* (e) Autenticação do push do backup: o commit é feito num clone
   SEPARADO (/tmp/publicar), onde a credencial que o actions/checkout
   grava no git config do checkout NÃO vale — sem token, o push falha
   ("could not read Username"). O passo de publicação precisa do
   GH_TOKEN do Actions, injetado como http extraheader por comando
   (nunca persistido em .git/config) e nunca na URL (x-access-token@
   vazaria o token em logs e na lista de processos). */
const passoPublicaDe = (texto) => {
  const linhas = texto.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => /^      - name: Publica o backup/.test(l));
  expect(inicio, 'passo "Publica o backup" não encontrado').toBeGreaterThanOrEqual(0);
  const fim = linhas.findIndex((l, i) => i > inicio && /^      - (name|uses):/.test(l));
  return linhas.slice(inicio, fim === -1 ? linhas.length : fim).join('\n');
};

describe('workflows: backup-notas autentica o push com GH_TOKEN, sem persistir credencial', () => {
  const bnf = arquivos.find(({ nome }) => nome === 'backup-notas.yml').texto;
  const publica = passoPublicaDe(bnf);
  it('passo "Publica o backup" define GH_TOKEN: ${{ github.token }}', () => {
    expect(publica).toMatch(/GH_TOKEN: \$\{\{ github\.token \}\}/);
  });
  it('não persiste credenciais nem passa token na URL', () => {
    expect(bnf, 'persist-credentials guarda token no .git/config do checkout').not.toMatch(
      /persist-credentials/
    );
    expect(bnf, 'token na URL vaza em logs e processos').not.toMatch(/x-access-token:[^@\s]*@/i);
    expect(bnf, 'senha/credentials embutidas em URL').not.toMatch(/https:\/\/[^/\s:@]+:[^@\s/]+@/);
  });
});
