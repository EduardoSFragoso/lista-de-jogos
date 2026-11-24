# Configuração do repositório: PRs e commits

Checklist para **quem administra o repositório**. Estas configurações ficam no GitHub e **o agente não as altera**: ele propõe e a pessoa aplica. É referenciado pelo `AGENTS.md`.

Parte do conteúdo vem da documentação oficial do GitHub (regras de rulesets). Os nomes de menus mudam com o tempo; se algum caminho não existir, procure o nome da opção em **Settings**.

## 1. Ruleset da branch principal

Em **Settings → Rules → Rulesets → New branch ruleset**, com alvo na branch padrão. Rulesets estão disponíveis em repositórios públicos no plano gratuito.

| Regra                                   | Recomendação                                                                                              | Por quê                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Restrict deletions                      | Ligada (já vem ligada)                                                                                    | Impede apagar a `main`                                                                                     |
| Block force pushes                      | Ligada (já vem ligada)                                                                                    | Impede reescrever o histórico publicado                                                                    |
| Require linear history                  | Ligada                                                                                                    | Exige squash ou rebase no merge; histórico fácil de reverter. O repositório precisa permitir esses métodos |
| Require a pull request before merging   | Ligada                                                                                                    | Nada entra sem PR                                                                                          |
| ↳ aprovações exigidas                   | 0 se há uma só pessoa; 1 ou mais se há equipe                                                             | Quem abre o PR não aprova o próprio; com 1 aprovação e um só mantenedor, o PR fica bloqueado               |
| ↳ métodos de merge permitidos           | Só o adotado (por exemplo Rebase)                                                                         | Evita o método errado por engano                                                                           |
| ↳ conversas resolvidas                  | Ligada                                                                                                    | Comentários de revisão não ficam esquecidos                                                                |
| ↳ descartar aprovações antigas          | Ligada, se exigir aprovações                                                                              | Aprovação vale para o código aprovado, não para o que mudou depois                                         |
| Require status checks to pass           | Ligada, com o job da CI (aqui: o job de lint e testes, contexto `ESLint + Stylelint + Prettier + testes`) | A CI é o portão do merge                                                                                   |
| ↳ branch atualizada antes do merge      | Ligada ("strict")                                                                                         | Evita merge de código testado contra uma base velha                                                        |
| Require code scanning results           | Ligada, se o CodeQL estiver ativo                                                                         | Bloqueia alertas de severidade definida                                                                    |
| Require secret scanning alerts resolved | Ligada, se usar secret scanning (recurso em prévia pública)                                               | Bloqueia o merge com segredo detectado                                                                     |
| Bypass list                             | Vazia, ou só o dono para emergências                                                                      | Ninguém contorna a regra por conveniência                                                                  |

**Limite do plano:** as regras "Restrict file paths", "Restrict file extensions" e "Restrict file size" são _push rulesets_, disponíveis para repositórios **privados ou internos** no plano Team. Em repositório público gratuito, o bloqueio de `.env`, `.pem` e dumps é feito por `.gitignore`, secret scanning com push protection e um hook local (seção 2).

## 2. Segurança dos commits

### Segredos

- **Secret scanning e push protection:** ative em **Settings → Code security** (ou _Advanced Security_). A push protection recusa o push que contém um segredo conhecido.
- **Hook local de pre-commit** com um detector de segredos (por exemplo `gitleaks`, na sintaxe atual da ferramenta). Ele barra o segredo antes de o commit existir.
- Se um segredo for commitado: **rotacione primeiro**. Apagar do código não basta, porque o histórico guarda o valor. Reescrever o histórico é opcional e vem depois.

### Assinatura de commits

A assinatura é recomendada, mas **a exigência tem armadilhas**. Para assinar com chave SSH:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

Depois adicione a mesma chave pública em **Settings → SSH and GPG keys** como _Signing Key_. Para assinar commits criados por `git am` (patches), use `git am -S`.

Antes de ligar **Require signed commits** na ruleset, leia o que a documentação diz:

- só commits assinados e verificados podem ser enviados à branch;
- commits sem assinatura na branch do PR podem **bloquear o merge** (a documentação cita o squash), mesmo que o GitHub assinasse o commit final;
- a documentação não detalha o caso do **Rebase and merge**.

Por isso: **teste num PR descartável** antes de exigir assinatura, principalmente se o fluxo usa Rebase and merge ou commits gerados por IA e aplicados por patch.

## 3. Segurança do repositório e das Actions

- **Dependabot:** ative alertas, atualizações de segurança e de versão, com um `.github/dependabot.yml` (exemplo na seção 4).
- **Code scanning (CodeQL):** cobre Java, JavaScript/TypeScript e Python, entre outras linguagens.
- **Private vulnerability reporting** e um `SECURITY.md` dizendo como reportar falhas.
- **Settings → Actions → General:**
  - _Workflow permissions_ em somente leitura; cada workflow declara o que precisa.
  - _Allow GitHub Actions to create and approve pull requests_ só se um workflow realmente abrir PRs.
  - Aprovação obrigatória para workflows de colaboradores externos.
- **Environments** (por exemplo `producao`) com revisores obrigatórios e segredos de deploy (ex.: `CLOUDFLARE_API_TOKEN`), quando houver equipe. Num projeto individual, secrets no nível do repositório (como os atuais `CLOUDFLARE_API_TOKEN` e `DATABASE_URL`) são aceitáveis.
- **Pages:** em **Settings → Pages**, publique só a pasta do frontend e ative _Enforce HTTPS_.

## 4. Arquivos de apoio no repositório

### `.github/pull_request_template.md`

```markdown
## O que mudou e por quê

## Como foi testado

- [ ] Testes e lint passam localmente
- [ ] Sem segredos, `.env`, dumps ou artefatos de build no diff

## Riscos e como reverter
```

### `.github/dependabot.yml` (exemplo deste projeto)

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
  - package-ecosystem: 'npm'
    directory: '/worker'
    schedule:
      interval: 'weekly'
  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

### `.gitignore` (trechos essenciais)

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
*.sql.gz
target/
build/
node_modules/
dist/
```

### Outros

- `SECURITY.md` com o canal de reporte de vulnerabilidades.
- `CODEOWNERS`, se houver mais de uma pessoa revisando.

## 5. Como mostrar a configuração a uma IA, sem prints

Estes comandos só **leem** a configuração (precisam do GitHub CLI, `gh`) e não expõem segredos:

```bash
gh api repos/EduardoSFragoso/lista-de-jogos/rulesets --jq '.[] | {id, name, enforcement, target}'
gh api repos/EduardoSFragoso/lista-de-jogos/rulesets/ID_DA_RULESET
gh api repos/EduardoSFragoso/lista-de-jogos --jq '{private, default_branch, allow_rebase_merge, allow_squash_merge, allow_merge_commit, delete_branch_on_merge, security_and_analysis}'
gh api repos/EduardoSFragoso/lista-de-jogos/pages --jq '{https_enforced, source, build_type}'
```

A IA compara o resultado com este checklist e aponta o que falta.
