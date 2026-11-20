# 🎮 Lista de Jogos

**PT-BR** · página estática com a lista de jogos que já joguei, em estilo retrô 8/16-bit, bilíngue (PT-BR / EN). Hosteada no [GitHub Pages](https://pages.github.com/).

**EN** · A static page with the list of games I have played, in retro 8/16-bit style, bilingual (PT-BR / EN). Hosted on GitHub Pages.

## 🗂 Estrutura

- `index.html` — página principal
- `assets/css/style.css` — tema retrô (paleta 16-bit, fonte Press Start 2P + VT323, scanlines CRT)
- `assets/js/main.js` — render da lista, busca, idioma (toggle PT/EN, salvo no `localStorage`)
- `data/games.json` — **a lista em si**. Cada jogo tem:
  - `title` — título **original** do jogo (como saiu no lançamento, em geral em inglês)
  - `title_pt` — opcional: título que saiu no **Brasil**, exibido quando o idioma é PT-BR (`null` = mostrar o original)
  - `year`, `platform`, `engine`, `rating` (1–5, estrelas), `company`, `genre`, `mode`
  - Qualquer campo `null` simplesmente não aparece na página (mostra "_a preencher_" quando não há nada).
  - `id` é só sequencial; mantenha para ordenação estável.

## ✍️ Como preencher

Edite `data/games.json` direto (no GitHub ou no seu editor). Exemplo de jogo preenchido:

```json
{ "id": 137, "title": "Hollow Knight", "title_pt": null,
  "year": 2017, "platform": "PC / Switch", "engine": "Unity",
  "rating": 5, "company": "Team Cherry", "genre": "Metroidvania", "mode": "Single-player" }
```

Dica: `rating` admite casas decimais se quiser depois; hoje ele mostra estrelas cheias.

## 🚀 Deploy no GitHub Pages

1. Crie um repositório no GitHub (veja sugestões de nome abaixo).
2. No seu computador:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPO.git
   git push -u origin main
   ```

3. No GitHub: **Settings → Pages → Build and deployment** → Source: *Deploy from a branch*, Branch: `main` / `/ (root)` → Save.
4. Em ~1 minuto a página está no ar em:
   `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

> O repositório já tem `.nojekyll`, então o Pages serve os arquivos como estão (sem processamento Jekyll).

## 🙅 Sugestões de nome para o repositório

- `lista-de-jogos` — direto, combina com o projeto
- `my-played-games` — se quiser em inglês
- `game-shelf` / `estante-de-jogos` — mais "marca pessoal"
- `jogos-que-joguei` — informal

O nome só afeta a URL (última parte) — o visual é independente.
