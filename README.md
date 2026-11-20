# 🎮 Lista de Jogos

**PT-BR** · página estática com a lista de jogos que já joguei, em tema dark/neon, bilíngue (PT-BR / EN). Hosteada no [GitHub Pages](https://pages.github.com/).

**EN** · A static page with the list of games I have played, in a dark/neon theme, bilingual (PT-BR / EN). Hosted on GitHub Pages.

## 🗂 Estrutura

- `index.html` — página principal
- `revisar.html` — página interna de revisão dos metadados (`/_obs`), com campos para responder e botão de copiar respostas
- `assets/css/style.css` — tema dark/neon (fundo escuro, acentos com glow; fontes Orbitron, Inter e JetBrains Mono)
- `assets/js/main.js` — render da lista, busca, idioma (toggle PT/EN, salvo no `localStorage`)
- `assets/js/revisar.js` — lógica da página de revisão
- `data/games.json` — **a lista em si**. Cada jogo tem:
  - `title` — título **original** do jogo (como saiu no lançamento, em geral em inglês)
  - `title_pt` — opcional: título que saiu no **Brasil**, exibido quando o idioma é PT-BR (`null` = mostrar o original)
  - `year`, `platform`, `engine`, `rating` (1–5, estrelas), `company`, `genre`, `mode`
  - Qualquer campo `null` simplesmente não aparece na página (mostra "_a preencher_" quando não há nada).
  - `id` é só sequencial; mantenha para ordenação estável.

## ✍️ Como preencher

Edite `data/games.json` direto (no GitHub ou no seu editor). Exemplo de jogo preenchido:

```json
{
  "id": 137,
  "title": "Hollow Knight",
  "title_pt": null,
  "year": 2017,
  "platform": "PC / Switch",
  "engine": "Unity",
  "rating": 5,
  "company": "Team Cherry",
  "genre": "Metroidvania",
  "mode": "Single-player"
}
```

Dica: `rating` admite casas decimais se quiser depois; hoje ele mostra estrelas cheias.

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

## 🙅 Sugestões de nome para o repositório

- `lista-de-jogos` — direto, combina com o projeto
- `my-played-games` — se quiser em inglês
- `game-shelf` / `estante-de-jogos` — mais "marca pessoal"
- `jogos-que-joguei` — informal

O nome só afeta a URL (última parte) — o visual é independente.
