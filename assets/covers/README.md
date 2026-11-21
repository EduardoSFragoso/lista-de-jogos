# Capas dos jogos

Uma imagem por jogo, nomeada pelo **id do jogo no banco**:

    assets/covers/<id>.jpg      (ou .png / .webp)

Exemplo: `assets/covers/49.jpg` aparece no card de _Adventure Quest_ (id 49).

- Sem capa o card fica sem thumb (o front tenta jpg → png → webp e desiste).
- As imagens são **verticais em proporção 2:3** (ideal 600×900, do Steam
  `library_600x900`). O layout corta com `object-fit: cover` — 42×56 no card
  e até 440px de altura no modal.
- Deploy é o mesmo push para o GitHub Pages — nada de serviço externo.

## Thumbs (cards)

Cards carregam `assets/covers/thumbs/<id>.webp` (160px, q80, ~9 KB média) e
caem pro original em cadeia se o thumb não existir. O **modal carrega só o
original** — zoom nunca perde resolução. Regenerar (incremental, só o que
mudou):

```bash
npm run thumbs
```

Rode depois de adicionar/substituir capas — é rápido e versiona junto.

## Como povoar / atualizar

```bash
node tools/fetch-covers.mjs              # todos que não têm capa
node tools/fetch-covers.mjs --only=42,45 # específicos
node tools/fetch-covers.mjs --only=42    # força nova tentativa (apague <id>.* antes)
```

Cadeia de fontes (para na primeira que achar):

1. **Steam CDN** — `library_600x900.jpg`, depois `header.jpg` (460×215)
2. **Libretro Thumbnails** — boxarts de consoles retrô via raw.githubusercontent
3. **SteamGridDB** — arte vertical comunitária (chave: `tools/.sgdb-key` ou
   env `SGDB_API_KEY`; gratuita em steamgriddb.com → Preferences → API)
4. **IGDB** — capa 720p 2:3 (credenciais: `tools/.igdb.json` ou env
   `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`; app grátis em dev.twitch.tv)
5. **TheGamesDB** — último recurso, limite de ~1000 req/mês que renova no
   dia 22 (chave: `tools/.tgdb-key` ou env `TGDB_API_KEY`)

Todas as chaves ficam em arquivos **gitignored** e também podem vir de
variáveis de ambiente. Correções de título/appid por jogo: `TITLE_FIX` e
`APPID_FIX` no topo do `tools/fetch-covers.mjs` (`null` = não busca no Steam).

Auditoria do que foi baixado: `node tools/audit-covers.mjs`.
Status atual: **361/365** — os ausentes são casos sem arte em DB alguma
(mapas custom de WC3, Adventure Quest/Flash, Final Fantasy Record Keeper).
