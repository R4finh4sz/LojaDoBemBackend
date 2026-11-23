# Atendimento municipal

Importe `LojaDoBem.atendimento-municipal.postman_collection.json` e configure `baseUrl` e os tokens locais. O cadastro de operadores exige um token do `MASTER` e valida cidade e UF pelo CEP. O cadastro de vendedor também exige CNPJ.

O crédito usa `POST /residents/credits` com token da `COOPERATIVA`. A venda usa `POST /residents/sales` com token de `PrefeituraVendedor`. Envie uma chave distinta no cabeçalho `Idempotency-Key` para cada operação e reutilize a mesma chave ao reenviar o mesmo pedido. Compras no app também aceitam esse cabeçalho.

Para testar a ativação, copie o `challengeId` retornado pela primeira requisição, confirme o código enviado ao e-mail do pré-cadastro e use o `activationToken` retornado para concluir a ativação.
