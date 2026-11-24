# Handoff — Lista de Jogos

Estado, comandos e contratos para quem continuar (pessoa ou agente).
Regras de desenvolvimento: [AGENTS.md](AGENTS.md). Checklist de
infraestrutura: [docs/auditoria-infra.md](docs/auditoria-infra.md).

## O que é

Site estático de lista de jogos (PT-BR/EN) no **GitHub Pages**, com API
opcional em **Cloudflare Worker** (`worker/`) e banco **Neon PostgreSQL**
(para rating/review persistidos). Capas versionadas em `assets/covers/`
com thumbs WebP em `assets/covers/thumbs/` (cards) — originais só no
modal (zoom sem perda).

- Site: `https://eduardosfragoso.github.io/lista-de-jogos/`
- API: `https://lista-api.eduardosfragoso.workers.dev` (`/api/ping`,
  `/api/games`, `/api/login`, ...)
- Dados: `data/games.json` (fonte da verdade para render) + Neon
  (sincronizado por `tools/sync-db.mjs` / workflow `sync-neon`).

## Estrutura

```text
assets/          frontend (css, js, covers, fonts)
data/            games.json + sql pontuais
worker/          Cloudflare Worker (src/index.js, schema.sql, seed.sql)
tools/           scripts vivos: audit-covers, ci-status, fetch-covers,
                 generate-seed, make-thumbs, sync-db, pr-status
test/            vitest (covers, sync-db, worker)
.github/         workflows (lint, deploy-worker, deploy-pages,
                 monitor-health, sync-neon)
docs/            checklists: auditoria de infraestrutura e
                 configuração do repositório
```

## Comandos

```bash
npm install        # setup (raiz); worker/ tem package próprio
npm run check      # prettier --check + eslint + stylelint + vitest
npm run thumbs     # gera thumbs WebP faltantes/atualizadas (sharp)
npm run sync-db    # aplica games.json no Neon (usa DATABASE_URL local)
npm test           # só os testes
```

Todos os comandos acima devem passar verde antes de qualquer commit.

## Contratos que não podem quebrar

- **Merge na main: apenas "Rebase and merge"** — configurado nas settings
  do repo e reforçado pelo ruleset "protege main" (PR obrigatório, check
  `ESLint + Stylelint + Prettier + testes`, linear history, block force
  pushes). Nada de squash/merge commit.
- Publicação do Pages: **workflow `.github/workflows/deploy-pages.yml`**
  empacota só o frontend (`index.html`, `assets/`, `data/games.json`);
  Nada mais (worker/, docs/, dumps) fica acessível por URL. Qualquer
  arquivo novo do frontend precisa entrar no passo "Monta o pacote" do
  workflow. Nenhum arquivo com segredo pode ser versionado mesmo assim
  (o histórico é público).
- O Worker deve responder `/api/ping` **sem** tocar no banco (rota antes
  do check de `DATABASE_URL`) — o monitor de saúde usa isso para o Neon
  poder dormir (scale-to-zero).
- `corsHeaders` deve exigir origem explícita para `allow-credentials` —
  nunca `*` com credenciais.
- Login (`/api/login`) tem rate limit em memória: 5 tentativas/min por
  IP → 429.
- Assunto do commit: até 70 caracteres; detalhe no corpo.

## Armadilhas conhecidas

- `grep -c` retorna exit 1 em contagem zero — cuidar em cadeias `&&`.
- Smart approve do Vibe bloqueia cadeias de push+`gh pr create` e
  `gh workflow run`: repetir/separar o comando, na 2ª tentativa costuma
  pedir confirmação ao usuário.
- O CI do `deploy-worker` dispara só em mudanças em `worker/*`.
- O monitor de saúde (cron `8,58 * * * *`) usa retry 5×20s para cobrir
  cold start do Neon e rede/redeploy; falha → e-mail automático do GitHub.
- Exceções de lint históricas: permissões de workflow são `contents: read`
  em todos os workflows; não afrouxar.
- `main.js` (~690 linhas) é um monolito deliberado (i18n + render +
  modais): não refatorar sem rede de segurança nova e pedido explícito.
- **Secrets no Cloudflare por dashboard criam versões pendentes** que
  desafinam do deploy (`wrangler secret put` falha com "latest version
  ... isn't currently deployed"). Caminho confiável, sem clipboard:
  `wrangler versions secret put <NOME>` + `wrangler versions deploy
--version-id <id> --percentage 100 -y`.
- **Configuration-only settings do dashboard (ex.: Observability) podem
  ser sobrescritas pelo próximo deploy**: manter o `wrangler.toml` do
  repo espelhado (fecho do banner "Update your Wrangler configuration").
- **500 "erro interno do Worker" com banco** normalmente é autenticação
  (veja `wrangler tail`) — password velha na string, role errada; o log
  do Events do dashboard costuma truncar a causa.

## Banco: roles e recuperação

- Worker e sync-neon conectam com a role **`lista_app`** (privilégio
  mínimo: SELECT/INSERT/UPDATE/DELETE em `games`); a role dona (
  `neondb_owner`) é só para DDL manual no SQL Editor (schema, grants).
- Após **DROP/recriação da tabela**, refazer os `grant` da `lista_app` —
  privilégios morrem com a tabela. Reconstrução completa: `schema.sql`
  - `seed.sql` no SQL Editor (perde apenas rating/review).

## Política de assinatura e autoria de commits

- Commits são feitos pelo Vibe com o trailer `Co-Authored-By: Mistral Vibe
<vibe@mistral.ai>`; **não há assinatura criptográfica exigida** hoje.
- A ruleset **não** exige _Require signed commits_ — segundo
  `docs/configuracao-repositorio.md`, a exigência deve ser testada num PR
  descartável antes de ligada (armadilha do rebase/squash de commits do
  agente).
- Push direto na `main` é bloqueado pela ruleset; todo trabalho entra por
  PR com merge **rebase only**.

## Pendências

- ~142 jogos sem `engine` preenchida (aguardando lista).
- 4 capas custom por screenshot (ids 14, 15, 49, 152).
- Rotação de `ADMIN_PASSWORD`/`SESSION_SECRET`: **sem força de pendência**
  (decisão do dono: projeto pessoal, sem dados sensíveis no banco). É só
  pedir em qualquer sessão que o fluxo do wrangler é guiado.
- **Settings do GitHub a aplicar pelo dono** (auditoria de 2026-11-23):
  Dependabot security updates ligado ✅; Dependabot alerts ✅; malware
  alerts ligado ✅; "conversas resolvidas" na ruleset ✅; private
  vulnerability reporting ✅; CodeQL com set-up default ligado ✅
  (primeiro scan em 2026-11-23: **0 alertas**; virar check obrigatório
  na ruleset só após ~2 semanas observando o ruído); **trocar o Source
  do Pages para "GitHub Actions"** (Settings → Pages) depois do merge
  do workflow `deploy-pages.yml` — até lá a publicação antiga (raiz da
  main via `pages-build-deployment`) continua valendo.
- Hook local de pre-commit com gitleaks (comando no
  `docs/configuracao-repositorio.md`); o histórico já foi varrido
  (70 commits, limpo) e `npm audit` está zerado.
- Rate limit do login é best effort em memória de isolate; se virar
  problema real, migrar para Cloudflare KV/DO (hoje seria YAGNI).
- Restore point-in-time do Neon (plano free tem janela limitada): usar
  apenas quando o banco tiver dados reais/valiosos; hoje o seed do repo
  reconstrói tudo menos rating/review.
