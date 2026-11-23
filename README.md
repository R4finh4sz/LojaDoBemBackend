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

## Swagger

No navegador, abra `/docs/login` e cole o token de uma sessão ativa do `MASTER`, obtido após a validação 2FA. A página redireciona para `/docs/`. Em produção, acesse por HTTPS. Para executar chamadas pela interface, use **Authorize** e informe um token com o perfil exigido pela rota.

Clientes HTTP também podem consultar `/docs.json` enviando `Authorization: Bearer <token MASTER>`.
