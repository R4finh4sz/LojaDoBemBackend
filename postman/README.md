# Atendimento municipal

## Painel do MASTER

Use `GET /master/dashboard` com `masterToken`. A resposta reúne o cadastro de operador mais recente, créditos de EcoCoins, bloqueios de 2FA, sanções de rate limit, atividade recente e estado atual do sistema.

Os créditos mensais comparam o mês atual até o momento com o mês anterior completo no horário de São Paulo. Sem créditos no mês anterior, `changePercent` é `null`. A contagem de segurança começa com o novo registro de eventos. `activeClients` conta origens de rede distintas com bloqueios registrados ainda dentro do prazo.

O estado de autenticação considera a sessão do próprio pedido, e processamento usa a última execução local dos jobs de trocas e carrinhos. `availabilityPercent` é `null` enquanto não houver histórico de monitoramento de disponibilidade.

## Cadastros e créditos

Importe `LojaDoBem.atendimento-municipal.postman_collection.json` e configure `baseUrl` e os tokens locais. O cadastro de operadores exige um token do `MASTER` e valida cidade e UF pelo CEP. O cadastro de vendedor também exige CNPJ.

O crédito usa `POST /residents/credits` com token da `COOPERATIVA`. Envie uma chave distinta no cabeçalho `Idempotency-Key` para cada operação e reutilize a chave ao reenviar o mesmo pedido. Compras no app também aceitam esse cabeçalho.

Para testar a ativação, copie o `challengeId` retornado pela primeira requisição, confirme o código enviado ao e-mail do pré-cadastro e use o `activationToken` retornado para concluir a ativação.

## Estoque e venda presencial

O catálogo e o estoque são compartilhados por município. No cadastro, informe o preço em EcoCoins e a imagem em `photo`. O campo opcional `barcode` é texto, inclusive para preservar zeros à esquerda. Use o mesmo campo na busca e na inclusão de itens no carrinho. Para ajustar o estoque, informe a quantidade atual em `expectedQuantity` e a quantidade desejada em `quantity`.

1. Use a busca de munícipe por CPF na pasta `PrefeituraVendedor` e copie o ID para `userId`.
2. Crie um carrinho para esse comprador e copie o ID retornado para `cartId`.
3. Defina a quantidade por item. Use zero para remover o item. O carrinho fica disponível ao vendedor que o abriu por 24 horas a partir da criação, sem reservar estoque.
4. Finalize em `POST /store/admin/carts/{{cartId}}/checkout`. Se faltar saldo ou estoque, ajuste o carrinho e tente novamente. Após sucesso, repetir o checkout com o mesmo ID devolve o mesmo recibo.

Use `GET /store/admin/export.xlsx` e salve a resposta como arquivo. A planilha contém o estoque e as vendas e trocas concluídas do município.
