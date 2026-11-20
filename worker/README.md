# lista-api — Worker da Lista de Jogos

API REST em [Cloudflare Workers](https://developers.cloudflare.com/workers/) +
[Neon](https://neon.tech) (PostgreSQL serverless). O front fica no GitHub Pages e
chama essa API para ler e gravar os jogos.

```
GitHub Pages (front estático)  →  Cloudflare Worker (esta API)  →  Neon (PostgreSQL)
```

## Rotas

| Rota             | Método | Auth          | Descrição                             |
| ---------------- | ------ | ------------- | ------------------------------------- |
| `/api/health`    | GET    | pública       | `{ ok: true, total: 285 }`            |
| `/api/games`     | GET    | pública       | lista completa de jogos               |
| `/api/login`     | POST   | senha         | abre sessão (cookie HttpOnly, 7 dias) |
| `/api/logout`    | POST   | —             | encerra a sessão                      |
| `/api/games/:id` | PATCH  | sessão/bearer | atualiza campos (whitelist validada)  |
| `/api/games`     | POST   | sessão/bearer | cria um jogo novo (id = max + 1)      |

Campos aceitos em PATCH/POST: `title`, `title_pt`, `year`, `platform`, `engine`,
`rating` (1–5), `company`, `genre`, `mode`, `review` (≤ 4000). Qualquer outra
chave é rejeitada.

**Segurança** — a senha nunca fica salva no navegador:

1. O site faz `POST /api/login` com a senha; o Worker responde com um cookie
   `lista_session` assinado (HMAC-SHA256), `HttpOnly`, `Secure`, `SameSite=None`,
   válido 7 dias — o JavaScript **não consegue ler** esse cookie.
2. Toda escrita autenticada por cookie também confere o header `Origin`
   (deve ser exatamente `ALLOWED_ORIGIN`), o que bloqueia CSRF.
3. No terminal, escreva com `Authorization: Bearer <senha>` — a senha nunca
   toca o navegador por esse caminho. Exemplo:

```bash
curl -X PATCH "https://lista-api.SEU-SUBDOMINIO.workers.dev/api/games/137" \
  -H "Authorization: Bearer $ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "review": "Obra-prima."}'
```

> **Hyperdrive?** O driver `@neondatabase/serverless` conecta por HTTP/fetch,
> então o binding do Hyperdrive fica **comentado** no `wrangler.toml` — só é
> preciso se trocar para um driver TCP (node-postgres).

## Passo a passo do deploy

### 1. Neon — criar o banco

1. Crie uma conta em <https://neon.com> (tem free tier) → **Create project**.
2. Escolha a região mais próxima (ex.: AWS US East / South America quando disponível).
3. No **Dashboard**, copie a _Connection string_ (formato
   `postgresql://usuario:senha@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`).
4. Abra o **SQL Editor** do projeto e rode, nesta ordem:
   1. o conteúdo de `schema.sql` (cria a tabela `games`);
   2. o conteúdo de `seed.sql` (insere/atualiza os 285 jogos — idempotente,
      nunca sobrescreve rating/review pessoais).

### 2. Cloudflare — criar e deployar o Worker

Requisito: [Node.js](https://nodejs.org) ≥ 18 instalado.

```bash
cd worker
npm install
npx wrangler login        # abre o navegador para autorizar
```

Configure os **secrets** (valores que não vão no código):

```bash
npx wrangler secret put DATABASE_URL
# cole a connection string do Neon

npx wrangler secret put ADMIN_PASSWORD
# escolha uma senha FORTE e cole aqui (é ela que você usa no ⚙ do site
# e no header Bearer do terminal)
```

Ajuste o CORS em `wrangler.toml` se o domínio do front mudar:

```toml
[vars]
ALLOWED_ORIGIN = "https://eduardosfragoso.github.io"
```

Deploy:

```bash
npx wrangler deploy
```

Anote a URL final (ex.: `https://lista-api.seu-usuario.workers.dev`).

### 3. Ligar o site à API

1. Abra o site (GitHub Pages) e clique em **⚙**.
2. Cole a **URL da API** (sem barra final) e digite a **senha de admin** → ENTRAR.
3. Pronto: a senha não fica no navegador — o Worker te dá um cookie de sessão
   `HttpOnly` de 7 dias. Cada SALVAR no modal grava direto no PostgreSQL
   (`PATCH /api/games/:id`) e aparece na hora para qualquer visitante.

Só a **URL da API** (pública por natureza) fica no `localStorage`; visitantes
veem a lista via `GET /api/games`, que é aberto e só lê.

### Testar

```bash
curl https://lista-api.SEU-SUBDOMINIO.workers.dev/api/health
curl https://lista-api.SEU-SUBDOMINIO.workers.dev/api/games | head -c 300
```

Logs em tempo real: `npx wrangler tail`.
