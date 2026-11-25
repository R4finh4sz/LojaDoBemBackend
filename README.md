# Loja do Bem Backend

## Ambiente local

Copie `.env.example` para `.env`, ajuste `DATABASE_URL` e informe dois segredos diferentes para `JWT_SECRET` e `DATA_ENCRYPTION_KEY`. Para gerar uma chave Base64 de 32 bytes, rode o comando abaixo uma vez para cada segredo. Em um banco existente, preserve a chave usada para criptografar os dados.

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64')"
```

Configure `RESEND_API_KEY` e `RESEND_SENDER_EMAIL` para enviar e-mails de login com 2FA, recuperação e alteração de senha e ativação de conta. Use um endereço de um domínio verificado no Resend. O nome do remetente é definido por `RESEND_SENDER_NAME` e o padrão é `ReciclaOnline`. [Documentação de envio do Resend](https://resend.com/docs/api-reference/emails/send-email)

A configuração `SESSION_LOCATION_PROXY_SECRET` é opcional e serve para registrar cidade e região a partir de um proxy confiável.

```sh
yarn install
yarn prisma:generate
yarn prisma:migrate
yarn build
yarn data:municipal-ownership
yarn dev
```

## Prefeitura e EcoCoins

O MASTER cadastra a prefeitura em `POST /master/municipalities`. Envie `name` (nome completo), `address` (endereço), `cep` e `cnpj`. A API consulta o ViaCEP para definir cidade e UF e retorna `201` com os dados cadastrados. Se a prefeitura já tiver um registro antigo com apenas cidade e UF, a rota completa os dados e retorna `200` com o mesmo ID. Uma prefeitura completa na mesma cidade e UF ou um CNPJ já cadastrado retorna `409`.

Ao cadastrar vendedor (`POST /auth/register/admin`), munícipe (`POST /auth/register/user`) ou cooperativa (`POST /auth/register/cooperative`), informe o CEP de cada conta. Todos os CEPs do mesmo município e UF são vinculados à mesma prefeitura. `city` e `state` são opcionais e, quando enviados, devem corresponder ao CEP. Se a prefeitura ainda não estiver cadastrada, o cadastro retorna `404`. Os vínculos existentes são preservados.

- `PATCH /account/profile` aceita apenas `cep`, `address` e `addressNumber`. A troca de CEP atualiza a cidade e a UF do endereço. O vínculo com a prefeitura continua o mesmo.
- `POST /residents/credits` permite à cooperativa emitir EcoCoins para a carteira de um munícipe da mesma prefeitura. A cooperativa não tem carteira nem saldo próprios.
- Estoque, vendas e movimentações ficam vinculados à prefeitura. Ao excluir a conta de um vendedor, os dados pessoais são apagados e a prefeitura continua com seu catálogo e seu histórico.
- `DELETE /residents/:id` permite ao vendedor excluir os dados pessoais de um munícipe da mesma prefeitura e encerra suas sessões. A API tenta enviar a confirmação ao e-mail do munícipe após a exclusão. A resposta `200` traz `deleted: true` e `emailSent`, que indica se o Resend aceitou o envio.

Em um banco existente, pare a API, aplique as migrações (`yarn prisma migrate deploy` em produção) e execute `yarn prisma:generate`, `yarn build` e `yarn data:municipal-ownership` antes de reiniciar. O comando usa a `DATA_ENCRYPTION_KEY` original para identificar o município dos cadastros existentes, copia os saldos para as carteiras e pode ser repetido. Registros históricos sem município identificável são preservados e contabilizados na saída do comando.

## Conta MASTER

Preencha `MASTER_EMAIL` e `MASTER_PASSWORD` no `.env` antes de iniciar. Em um banco novo, a API cria o único `MASTER`. Se já houver um `MASTER`, informe o e-mail dessa conta. Use uma senha com pelo menos 12 caracteres e até 72 bytes em UTF-8.

Para trocar a senha desse `MASTER`, altere `MASTER_PASSWORD` e reinicie a API. A troca revoga as sessões e os desafios 2FA anteriores.

## Autenticação em duas etapas

Contas novas começam com 2FA desativado. A migração mantém a verificação por e-mail nas contas existentes até que o titular altere a preferência.

- `GET /account/profile` retorna o estado em `twoFactorEnabled`.
- `PATCH /account/two-factor` recebe `enabled` (booleano) e `password` (senha atual) com o token da sessão. A resposta traz `twoFactorEnabled`.
- `POST /auth/login` retorna `twoFactorRequired: false` e `token` quando o 2FA está desativado. Quando retorna `twoFactorRequired: true` e `challengeId`, envie o código do e-mail para `POST /auth/2fa/verify` para obter o token.

Excluir o `MASTER` encerra a API após a resposta de exclusão. O banco preserva a identidade da conta e o servidor recusa novas inicializações até ela ser restaurada. A API também verifica a cada cinco segundos se a conta continua ativa.

## Primeiro acesso de vendedores e cooperativas

O cadastro feito pelo MASTER usa o CPF sem pontuação como senha inicial. O operador aceita os termos na própria conta. Antes do primeiro acesso, publique um termo do tipo `ADMIN` em `POST /terms/create`.

1. Envie o e-mail e o CPF sem pontuação como senha para `POST /auth/login`. A resposta inclui `firstLogin: true` e `challengeId`.
2. Confirme o código enviado ao e-mail em `POST /auth/2fa/verify`. A resposta inclui `firstLoginToken`, válido por 15 minutos.
3. Use esse token como Bearer em `GET /auth/first-login/terms` para exibir o termo vigente.
4. Depois que o operador marcar **O operador leu e aceitou os termos de uso.**, envie `password`, `passwordConfirmation`, `termDocumentId` (o `documentId` retornado na consulta) e `termsAccepted: true` para `POST /auth/first-login`, com o mesmo Bearer. A resposta contém o token da sessão normal.

Esse fluxo vale para novos vendedores e cooperativas. Contas já cadastradas continuam usando suas credenciais atuais.

## Swagger

No navegador, abra `/docs/login` e cole o token de uma sessão ativa do `MASTER`. A página redireciona para `/docs/`. Em produção, acesse por HTTPS. Para executar chamadas pela interface, use **Authorize** e informe um token com o perfil exigido pela rota.

Clientes HTTP também podem consultar `/docs.json` enviando `Authorization: Bearer <token MASTER>`.
