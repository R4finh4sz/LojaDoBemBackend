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

Para criar a conta `MASTER` na primeira inicialização, preencha `MASTER_EMAIL` e `MASTER_PASSWORD` no `.env`. Se já houver um `MASTER`, informe o e-mail dessa conta. Deixe os dois campos vazios para iniciar sem provisionamento automático. Use uma senha com pelo menos 12 caracteres e até 72 bytes em UTF-8.

Para trocar a senha desse `MASTER`, altere `MASTER_PASSWORD` e reinicie a API. A troca revoga as sessões e os desafios 2FA anteriores. O login continua exigindo 2FA por e-mail. Se a conta for excluída com as variáveis ainda preenchidas, ela será criada novamente na próxima inicialização.

## Swagger

No navegador, abra `/docs/login` e cole o token de uma sessão ativa do `MASTER`, obtido após a validação 2FA. A página redireciona para `/docs/`. Em produção, acesse por HTTPS. Para executar chamadas pela interface, use **Authorize** e informe um token com o perfil exigido pela rota.

Clientes HTTP também podem consultar `/docs.json` enviando `Authorization: Bearer <token MASTER>`.
