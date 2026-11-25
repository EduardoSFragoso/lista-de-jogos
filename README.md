# 🎮 Lista de Jogos

**PT-BR** · página estática com a lista de jogos que já joguei, em tema dark/neon, bilíngue (PT-BR / EN). Front no [GitHub Pages](https://pages.github.com/), API no Cloudflare Workers e dados num PostgreSQL no [Neon](https://neon.tech).

🌐 **English version:** [README.en.md](README.en.md)

## 🏗 Arquitetura

| Peça                  | O que faz no projeto                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **GitHub + Pages**    | guarda o código e publica o front (HTML, CSS, JS) — estático, sem backend                                        |
| **Cloudflare Worker** | roda a API REST (`/api/games`), valida requests, aplica CORS e devolve JSON                                      |
| **Neon**              | hospeda o PostgreSQL: tabela `games`, metadados, ratings e reviews                                               |
| **Hyperdrive**        | opcional — só se usar driver TCP (node-postgres). Com o driver serverless do Neon (usado aqui), não é necessário |

Fluxo: `Pages (estático) → Worker (API REST) → Neon (PostgreSQL)`.

## 🗂 Estrutura

```text
lista_jogos/
├── index.html            página principal
├── assets/
│   ├── css/style.css     tema dark/neon (Orbitron, Inter, JetBrains Mono)
│   └── js/
│       ├── main.js       render da lista, busca, modal, i18n PT-BR/EN
│       └── db.js         cliente da API (GET/PATCH no Worker)
├── data/games.json       cópia estática dos jogos (fallback sem API)
├── worker/               Cloudflare Worker (a API)
│   ├── src/index.js      rotas, validação, auth, CORS
│   ├── schema.sql        CREATE TABLE do Neon
│   ├── seed.sql          os 364 jogos (gerado por tools/generate-seed.mjs)
│   ├── sync-db.mjs       sincroniza data/games.json → Neon (upsert idempotente)
│   ├── wrangler.toml     config do deploy (vars, Hyperdrive opcional)
│   └── package.json
├── .github/workflows/
│   ├── lint.yml          Prettier + ESLint + Stylelint + testes a cada push
│   ├── sync-neon.yml     roda worker/sync-db.mjs no push que mexer em data/games.json
│   └── dependabot.yml    dependabot semanal
└── tools/
    ├── generate-seed.mjs regenera o seed.sql a partir de data/games.json
    ├── fetch-covers.mjs  caça capas (Steam → Libretro → xero/boxart → SGDB → IGDB → TheGamesDB)
    ├── make-thumbs.mjs   gera thumbs das capas para os cards (npm run thumbs)
    └── audit-covers.mjs  auditoria das capas baixadas
```

### Campos de cada jogo

- `title` — título **original** do jogo (como saiu no lançamento, em geral em inglês)
- `title_pt` — opcional: título que saiu no **Brasil**, exibido quando o idioma é PT-BR
- `year`, `platform`, `engine`, `rating` (1–5, estrelas), `company`, `genre`, `mode`
- `review` — opcional: seu review escrito do jogo, exibido no modal ao clicar no card
- `cover` — não fica no banco: é um arquivo `assets/covers/<id>.jpg`/`.png`/`.webp`
  no próprio repositório (ver [assets/covers/README.md](assets/covers/README.md)); sem capa, o card fica sem imagem
- Qualquer campo `null` simplesmente não aparece na página (mostra "_a preencher_" quando não há nada).

## ✍️ Como editar os dados

- **Pelo site (recomendado)**: clique num jogo → preencha campos/estrelas/review → SALVAR.
  Com a API configurada (⚙), isso grava direto no PostgreSQL via `PATCH /api/games/:id`.
- **Pelo JSON**: edite `data/games.json` (serve de fallback offline). No push que mexe nele,
  o workflow `sync-neon.yml` sobe tudo pro Neon sozinho (`cd worker && node sync-db.mjs`).
  `node tools/generate-seed.mjs` regenera `worker/seed.sql` se precisar reconstruir do zero.

## 🎨 Capas

Uma capa por jogo em `assets/covers/<id>.jpg`/`.png`, povoada por `tools/fetch-covers.mjs`
(360/364 hoje). Fontes, em ordem: **Steam CDN** (`library_600x900`), **Libretro Thumbnails**
(consoles retrô), **xero/boxart** (coleção retro no GitHub), **SteamGridDB**, **IGDB** e
**TheGamesDB** (última, por causa do limite mensal). As chaves ficam em arquivos gitignored:
`tools/.sgdb-key`, `tools/.igdb.json`, `tools/.tgdb-key` — ou em variáveis de ambiente
(`SGDB_API_KEY`, `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`, `TGDB_API_KEY`). A Wikipédia foi
dispensada (baixa qualidade). Os 4 jogos sem capa são conteúdos de comunidade (mapas custom)
ou webgames sem arte oficial — capa será de screenshot/art própria.
Cards carregam **thumbs** (`assets/covers/thumbs/<id>.webp`, ~9 KB; regenerados
com `npm run thumbs`) — o modal carrega o original, zoom sem perda.

Detalhes em [assets/covers/README.md](assets/covers/README.md).

## 🛠 API (Worker)

| Rota             | Método | Auth           | O que faz                              |
| ---------------- | ------ | -------------- | -------------------------------------- |
| `/api/health`    | GET    | pública        | status + total de jogos                |
| `/api/games`     | GET    | pública        | lista completa de jogos (JSON)         |
| `/api/games/:id` | PATCH  | `Bearer token` | atualiza campos de um jogo (whitelist) |

Escritas exigem uma sessão aberta via `POST /api/login` (senha = secret
`ADMIN_PASSWORD` do Worker, comparada em tempo constante, devolvida como
**cookie HttpOnly** assinado com `SESSION_SECRET` — payload `iat.jti.exp`,
HMAC-SHA256 — que o JavaScript
do site não lê) ou o header `Authorization: Bearer <senha>` no terminal.
Validação: `rating` 1–5, `year` plausível, textos ≤ 200 (review ≤ 4000) caracteres.

## 🧰 Qualidade de código (formatação, linters e CI)

O projeto tem verificação automática de estilo a cada push, via [GitHub Actions](.github/workflows/lint.yml):

| Ferramenta                               | O que faz                                                           | Config                 |
| ---------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| [Prettier](https://prettier.io)          | formata HTML, CSS, JS, JSON e Markdown (indentação, aspas, quebras) | `.prettierrc.json`     |
| [ESLint](https://eslint.org)             | lint de JavaScript (erros, variáveis não usadas, boas práticas)     | `eslint.config.js`     |
| [Stylelint](https://stylelint.io)        | lint de CSS (notação de cores, seletores duplicados, ordem)         | `stylelint.config.mjs` |
| [EditorConfig](https://editorconfig.org) | indentação, charset e fim de linha em qualquer editor               | `.editorconfig`        |

### Rodando localmente

```bash
npm install      # só na primeira vez

npm run format   # formata tudo (Prettier)
npm run lint     # aponta erros de JS e CSS
npm run lint:fix # corrige o que dá automaticamente
npm run check    # formatação + lints — o que o CI roda (exige 100% verde)
```

### Padrões de estilo

- Indentação: **2 espaços** (sem tabs) em todos os arquivos
- Aspas **simples** em JS, `;` sempre
- JS em **ES modules** (`type="module"` no `<script>`), `const`/`let` (nunca `var`)
- Comparações estritas (`===`/`!==`), cores CSS em notação moderna (`rgb(... / 18%)`)
- O CI no GitHub bloqueia o push ❌ se algo passar do padrão — rode `npm run check` antes

## 🚀 Deploy no GitHub Pages

1. Crie um repositório no GitHub (veja sugestões de nome abaixo).
2. No seu computador:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPO.git
   git push -u origin main
   ```

3. No GitHub: **Settings → Pages → Build and deployment** → Source: _Deploy from a branch_, Branch: `main` / `/ (root)` → Save.
4. Em ~1 minuto a página está no ar em:
   `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

> O repositório já tem `.nojekyll`, então o Pages serve os arquivos como estão (sem processamento Jekyll).

## ☁️ Colocando o backend no ar (Neon + Cloudflare)

O passo a passo detalhado está em [`worker/README.md`](worker/README.md). Resumo:

1. **Neon**: crie o projeto, copie a connection string, rode `worker/schema.sql` no SQL Editor
   e `cd worker && DATABASE_URL=... node sync-db.mjs` (ou deixe o workflow `sync-neon.yml`
   subir o seed no primeiro push).
2. **Cloudflare**: `cd worker && npm install && npx wrangler login`, configure os secrets (`DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`) e `npx wrangler deploy`.
3. **Site**: no ⚙ da página, cole a URL do Worker e a senha — o login abre uma sessão de 7 dias (cookie HttpOnly) e o site passa a gravar no banco.

Sem API configurada, o site continua funcionando em **modo local** (lê `data/games.json`,
salva edições no `localStorage` do navegador). Motivo do fallback: o front é estático.
