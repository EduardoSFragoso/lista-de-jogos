# Auditoria de infraestrutura

Checklist para projetos com **frontend no GitHub Pages, backend em Cloudflare Worker e Postgres no Neon**, tudo no mesmo repositório. É referenciado pelo `AGENTS.md`.

**Regra de ouro:** nunca cole segredos reais (senhas, tokens, chaves, `DATABASE_URL` completa). Mascare valores e hosts em qualquer saída enviada a uma IA.

## Ordem das etapas

1. Auditoria **sem alterações** (este documento).
2. Segredos: rotacionar o que estiver exposto, antes de qualquer refatoração.
3. Rede de segurança: testes de caracterização, snapshot ou equivalente.
4. CI e proteção da branch principal.
5. Validação de entrada e contratos da API.
6. Refatorações, uma etapa por vez, com a rede de segurança verde.
7. `handoff.md` para quem continuar.

## 1. GitHub Pages e repositório

- Em **Settings → Pages**, veja a origem do deploy (branch/pasta ou GitHub Action). Só a pasta do frontend deve ser publicada.
- Se a raiz do repositório for publicada, tudo o que estiver nela é baixável por URL, inclusive o código do servidor.
- Procure arquivos sensíveis versionados:

```bash
git ls-files | grep -Ei '\.env|\.pem|\.key|dump|\.sql$|backup'
```

- Procure o mesmo no **histórico** (arquivos que já foram apagados continuam lá):

```bash
git log --all --diff-filter=A --name-only --format= | grep -Ei '\.env|\.pem|\.key|dump|\.sql$' | sort -u
```

- Use um detector de segredos no código e no histórico (por exemplo `gitleaks` ou `trufflehog`), rodando localmente.
- No frontend, só podem existir chaves feitas para serem públicas.

### Se achar um segredo

1. **Rotacione primeiro**: resete a senha da role no Neon, rotacione ADMIN_PASSWORD e SESSION_SECRET no Worker, regenere tokens de terceiros (IGDB/Twitch etc.).
2. Só depois decida se vale reescrever o histórico. A rotação é o que realmente protege; apagar do código não basta.

## 2. Neon (Postgres)

No console do Neon, confira:

- plano e **janela de restauração** (antes de qualquer mudança de esquema);
- branches existentes e a role usada pela aplicação;
- o host usado pela aplicação (`-pooler`) e pelas migrações (conexão direta).

Regras:

- `DATABASE_URL` só no servidor, com `sslmode=require`.
- A aplicação usa uma **role com privilégios mínimos**, nunca a dona do banco (`neondb_owner`). As migrações usam outra role.
- Migrações versionadas — neste projeto, SQL puro (`worker/schema.sql`, sem ORM), aplicado via SQL Editor do Neon. Antes de mudar o esquema, aplicar primeiro numa **branch do Neon** criada a partir da produção, com plano de reversão e backup/ponto de restauração confirmados.

Consultas de leitura, para rodar numa branch:

```sql
SELECT current_user, version();

SELECT rolname, rolsuper, rolcreatedb, rolcreaterole
FROM pg_roles WHERE rolname NOT LIKE 'pg_%';

SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'NOME_DA_ROLE_DA_APLICACAO'
ORDER BY table_schema, table_name;
```

## 3. Cloudflare Worker (API)

Comandos de **leitura** (a pessoa executa, ou o agente com wrangler autenticado localmente; mascare hosts e segredos em qualquer saída enviada a uma IA):

```bash
npx wrangler deployments list
npx wrangler secret list
```

- `secret list` mostra só os **nomes** dos secrets — os valores nunca aparecem no dashboard nem no CLI.
- Segredos **não** ficam no `wrangler.toml` versionado; só `[vars]` não sensíveis (ex.: `ALLOWED_ORIGIN`).
- **Armadilha**: secret editado só pelo dashboard fica como versão pendente e o deployment entra em descompasso. Fluxo comprovado: `npx wrangler versions secret put NOME < arquivo` + `npx wrangler versions deploy --version-id <id> --percentage 100 -y`.

Verificações de HTTPS e CORS, a partir de qualquer máquina:

```bash
curl -sI https://api.exemplo.com/api/health | head -n 5
curl -s -D - -o /dev/null -H 'Origin: https://evil.example' https://api.exemplo.com/api/health
curl -s -D - -o /dev/null -H 'Origin: https://USUARIO.github.io' https://api.exemplo.com/api/health
```

- O domínio `*.workers.dev` traz HTTPS automático; se usar domínio próprio, confira certificado.
- Para a origem estranha **não** deve voltar `Access-Control-Allow-Origin`. Para a origem do Pages deve voltar exatamente essa origem, nunca `*` com credenciais.
- Se o login usar cookies entre domínios, use `SameSite=None; Secure` e proteção contra CSRF. O cookie de sessão é `HttpOnly` e invisível para o JavaScript do site.
- Rate limit nas rotas sensíveis (neste projeto: `/api/login`, limite em memória do isolate).

Diagnóstico de runtime:

```bash
npx wrangler tail --format pretty
```

## 4. Backend

- Autenticação e autorização em toda rota que não seja pública.
- Validação de toda entrada e consultas parametrizadas (contra SQL injection).
- Limite de requisições nas rotas sensíveis.
- Logs sem dados pessoais (LGPD) e respostas de erro sem stack trace.
- Dependências: `npm audit` ou `pip-audit`, com Dependabot ativo.

## 5. Rede de segurança por camada

| Camada       | Proteção                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Frontend     | Snapshot de renderização (ex.: jsdom), testes dos pontos de injeção de HTML e verificação de carga                               |
| Backend      | Testes de caracterização das rotas (gravam as respostas atuais e provam que não mudaram), testes de integração, análise estática |
| Banco        | Migrações testadas do zero na CI com Postgres efêmero                                                                            |
| Dependências | Dependabot, `npm audit` ou `pip-audit`                                                                                           |

Confirme que cada teste novo **falha** no código antigo antes de confiar nele.

## 6. CI e deploy do Pages

- A CI gera exatamente o que será publicado no Pages.
- `permissions` mínimas (`contents: read`); as GitHub Actions ficam atualizadas.
- Proteção da branch principal: PR, check obrigatório e método de merge definido no `handoff.md`.
- PRs abertos por workflows com o `GITHUB_TOKEN` (autor `github-actions[bot]`) ficam em _Action required_ e só rodam a CI depois de **Approve workflows to run**.

## O que o agente não deve fazer sem confirmação

DROP, TRUNCATE, DELETE sem WHERE, apagar branches ou secrets, mudar `ALLOWED_ORIGIN`, aplicar migração na produção, reescrever o histórico do Git e fazer push forçado — nada disso sem confirmação explícita.
