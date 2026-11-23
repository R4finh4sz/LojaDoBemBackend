# Loja do Bem Backend

## Ambiente local

Copie `.env.example` para `.env`, ajuste `DATABASE_URL` e informe dois segredos diferentes para `JWT_SECRET` e `DATA_ENCRYPTION_KEY`. Para gerar uma chave Base64 de 32 bytes, rode o comando abaixo uma vez para cada segredo. Em um banco existente, preserve a chave usada para criptografar os dados.

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64')"
```

Preencha as variáveis `BREVO_*` para os fluxos que enviam e-mail, incluindo login com 2FA. A configuração `SESSION_LOCATION_PROXY_SECRET` é opcional e serve para registrar cidade e região a partir de um proxy confiável.

```sh
yarn install
yarn prisma:generate
yarn prisma:migrate
yarn dev
```

## Conta MASTER

Preencha `MASTER_EMAIL` e `MASTER_PASSWORD` no `.env` antes de iniciar. Em um banco novo, a API cria o único `MASTER`. Se já houver um `MASTER`, informe o e-mail dessa conta. Use uma senha com pelo menos 12 caracteres e até 72 bytes em UTF-8.

Para trocar a senha desse `MASTER`, altere `MASTER_PASSWORD` e reinicie a API. A troca revoga as sessões e os desafios 2FA anteriores.

## Autenticação em duas etapas

Contas novas começam com 2FA desativado. A migração mantém a verificação por e-mail nas contas existentes até que o titular altere a preferência.

- `GET /account/profile` retorna o estado em `twoFactorEnabled`.
- `PATCH /account/two-factor` recebe `enabled` (booleano) e `password` (senha atual) com o token da sessão. A resposta traz `twoFactorEnabled`.
- `POST /auth/login` retorna `twoFactorRequired: false` e `token` quando o 2FA está desativado. Quando retorna `twoFactorRequired: true` e `challengeId`, envie o código do e-mail para `POST /auth/2fa/verify` para obter o token.

Excluir o `MASTER` encerra a API após a resposta de exclusão. O banco preserva a identidade da conta e o servidor recusa novas inicializações até ela ser restaurada. A API também verifica a cada cinco segundos se a conta continua ativa.

## Swagger

No navegador, abra `/docs/login` e cole o token de uma sessão ativa do `MASTER`. A página redireciona para `/docs/`. Em produção, acesse por HTTPS. Para executar chamadas pela interface, use **Authorize** e informe um token com o perfil exigido pela rota.

Clientes HTTP também podem consultar `/docs.json` enviando `Authorization: Bearer <token MASTER>`.
