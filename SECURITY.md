# Política de segurança

## Reportando uma vulnerabilidade

Este é um repositório pessoal, mas vulnerabilidades são bem-vindas:

- Use o **Private vulnerability reporting** do GitHub (aba _Security_ → _Report a vulnerability_), nunca uma issue pública.
- Nunca poste senhas, tokens, `DATABASE_URL` ou outros segredos no reporte — descreva o caminho de reprodução.

## Escopo

- **Worker (`worker/`)**: as rotas de `/api` (login/sessão CORS, rate limit, whitelist de campos no PATCH) são a superfície mais sensível.
- **Frontend (`assets/`)**: problemas de XSS/injeção no render dos dados.
- **GitHub Pages**: a raiz publicada não deve expor nada além do frontend.

## O que não é escopo

- O banco (Neon) é acessado só pelo Worker, com role de privilégio mínimo; falhas do provedor (Cloudflare/Neon/GitHub) devem ser reportadas a eles.
- O site é uma lista pessoal de jogos: não há dados de terceiros.
