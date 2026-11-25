# Atendimento municipal

## Painel do MASTER

Use `GET /master/dashboard` com `masterToken`. A resposta reúne o cadastro de operador mais recente, créditos de EcoCoins, bloqueios de 2FA, sanções de rate limit, atividade recente e estado atual do sistema.

Os créditos mensais comparam o mês atual até o momento com o mês anterior completo no horário de São Paulo. Sem créditos no mês anterior, `changePercent` é `null`. A contagem de segurança começa com o novo registro de eventos. `activeClients` conta origens de rede distintas com bloqueios registrados ainda dentro do prazo.

O estado de autenticação considera a sessão do próprio pedido, e processamento usa a última execução local dos jobs de trocas e carrinhos. `availabilityPercent` é `null` enquanto não houver histórico de monitoramento de disponibilidade.

## Histórico de acesso

Use `GET /account/sessions?page=1&limit=10` com o token da conta. A resposta traz `sessions` da mais recente à mais antiga e `pagination` com `page`, `limit`, `total` e `totalPages`. Os estados são `CURRENT` (sessão atual), `ACTIVE` (outra sessão aberta), `REVOKED` (encerrada) e `EXPIRED` (expirada).

Navegador e dispositivo são reconhecidos pelo User-Agent da requisição que efetiva o login. Para preencher cidade e região aproximadas, configure `SESSION_LOCATION_PROXY_SECRET` na API e no proxy de entrada. O proxy deve descartar os cabeçalhos correspondentes recebidos do cliente e enviar seus próprios `X-Session-Location-Secret`, `X-Session-City` e `X-Session-Region` em `POST /auth/login` e `POST /auth/2fa/verify`. Cidade e região em UTF-8 devem ser codificadas com escape de porcentagem. Campos desconhecidos e metadados de sessões antigas retornam `null`.

## Cadastros e créditos

Importe `LojaDoBem.atendimento-municipal.postman_collection.json` e configure `baseUrl` e os tokens locais. O cadastro de operadores exige um token do `MASTER` e valida cidade e UF pelo CEP. O cadastro de vendedor também exige CNPJ.

Publique um termo administrativo vigente antes de convidar vendedores ou cooperativas. As rotas de cadastro enviam um convite por e-mail e respondem com HTTP `202`. A conta só é criada quando o operador aceita o termo e define uma senha pelo link, que expira em 24 horas. Configure `PUBLIC_API_URL` com a URL da API que o destinatário consegue acessar.

Para pré-cadastrar um munícipe com `sellerToken`, envie `termsAccepted: true` e preencha `authorizationDocument` com o termo assinado em JPG, PNG ou PDF de até 2 MiB, em Base64 puro.

O crédito usa `POST /residents/credits` com token de `COOPERATIVA`, `PrefeituraVendedor` ou `MASTER`. Cooperativas e vendedores podem creditar no próprio município. O MASTER pode creditar em qualquer município. Envie uma chave distinta no cabeçalho `Idempotency-Key` para cada operação e reutilize a chave ao reenviar o mesmo pedido. Compras no app também aceitam esse cabeçalho.

Para testar a ativação, copie o `challengeId` retornado pela primeira requisição, confirme o código enviado ao e-mail do pré-cadastro e use o `activationToken` retornado para concluir a ativação.

## Estoque e venda presencial

Use `GET /store/admin/dashboard` com `sellerToken` para consultar os indicadores do município do vendedor. A rota retorna pedidos concluídos, munícipes distintos atendidos e EcoCoins resgatadas, além de até 10 pedidos recentes e 5 itens mais retirados. Um carrinho concluído conta como um pedido. O percentual de cada item é sua participação no total de unidades retiradas no município.

O catálogo e o estoque são compartilhados por município. No cadastro, informe o preço em EcoCoins e a imagem em `photo`. O campo opcional `barcode` é texto, inclusive para preservar zeros à esquerda. Use o mesmo campo na busca e na inclusão de itens no carrinho. Para ajustar o estoque, informe a quantidade atual em `expectedQuantity` e a quantidade desejada em `quantity`.

Para listar produtos, use `GET /store/admin/products?page=1`. A lista tem 9 itens por página. Combine `search` (trecho do nome ou descrição), `barcode` (código exato) e `stock` (`available` para ativos com estoque ou `out` para estoque zerado). A resposta inclui `products` e `pagination`, com o total de itens e páginas após os filtros. Ao trocar um filtro, volte à página 1.

1. Use a busca de munícipe por CPF na pasta `PrefeituraVendedor` e copie o ID para `userId`.
2. Crie um carrinho para esse comprador e copie o ID retornado para `cartId`.
3. Defina a quantidade por item. Use zero para remover o item. O carrinho fica disponível ao vendedor que o abriu por 24 horas a partir da criação, sem reservar estoque.
4. Finalize em `POST /store/admin/carts/{{cartId}}/checkout` com o total confirmado em `expectedTotal`, como texto com duas casas decimais (por exemplo, `"25.00"`). Se receber HTTP 412, consulte o carrinho novamente e confirme o novo total. Se faltar saldo ou estoque, ajuste o carrinho e tente novamente. Após sucesso, reenviar o checkout com o mesmo ID devolve o mesmo recibo.

Use `GET /store/admin/export.xlsx` e salve a resposta como arquivo. A planilha contém o estoque e as vendas e trocas concluídas do município.
