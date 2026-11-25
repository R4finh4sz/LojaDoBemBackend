import swaggerJSDoc from "swagger-jsdoc";

const bearer = [{ bearerAuth: [] }];
const uuid = { type: "string", format: "uuid" };
const quantity = { type: "integer", minimum: 0, maximum: 2_147_483_647 };
const barcode = { type: "string", maxLength: 64, example: "0012345678905" };
const cpf = { type: "string", description: "CPF do munícipe" };
const jsonBody = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", required, properties } } },
});
const pathId = (name = "id") => ({ name, in: "path", required: true, schema: uuid });
const seller = { tags: ["Administração da Loja"], security: bearer, description: "Exclusivo de PrefeituraVendedor. A operação fica restrita ao município do vendedor." };
const residents = { tags: ["Atendimento municipal"], security: bearer };
const activation = { tags: ["Ativação de conta"] };
const operatorProperties = {
  name: { type: "string" },
  cpf,
  birthDate: { type: "string", format: "date" },
  phone: { type: "string" },
  cep: { type: "string" },
  address: { type: "string" },
  city: { type: "string" },
  state: { type: "string" },
  email: { type: "string", format: "email" },
};
const operatorBody = (vendor: boolean) => {
  const required = vendor ? { ...operatorProperties, cnpj: { type: "string" } } : operatorProperties;
  return jsonBody({
    ...required,
    profilePhoto: { type: "string" },
  }, Object.keys(required));
};

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ReciclaOnline API",
      version: "1.0.0",
      description: "Documentacao da API do Backend ReciclaOnline",
    },
    servers: [
      {
        url: "/",
        description: "Servidor atual",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        RegisterInput: {
          type: "object",
          required: [
            "name",
            "cpf",
            "birthDate",
            "phone",
            "cep",
            "address",
            "city",
            "state",
            "termsAccepted",
            "email",
            "password",
            "passwordConfirmation",
          ],
          properties: {
            name: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "joao da silva",
            },
            cpf: {
              type: "string",
              minLength: 11,
              maxLength: 14,
              example: "12345678909",
            },
            birthDate: {
              type: "string",
              format: "date",
              description: "A idade no cadastro deve estar entre 18 e 90 anos, inclusive.",
              example: "1990-05-20",
            },
            phone: {
              type: "string",
              example: "11999999999",
            },
            cep: {
              type: "string",
              example: "01001000",
            },
            address: {
              type: "string",
              example: "rua exemplo, 123",
            },
            city: {
              type: "string",
              example: "sao paulo",
            },
            state: {
              type: "string",
              example: "sp",
            },
            profilePhoto: {
              type: "string",
              nullable: true,
              example: "https://exemplo.com/foto.jpg",
            },
            termsAccepted: {
              type: "boolean",
              enum: [true],
              example: true,
            },
            email: {
              type: "string",
              format: "email",
              example: "usuario@email.com",
            },
            password: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              example: "12345678",
            },
            passwordConfirmation: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              example: "12345678",
            },
          },
        },
        LoginInput: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "usuario@email.com",
            },
            password: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              example: "12345678",
            },
          },
        },
        VerifyTwoFactorInput: {
          type: "object",
          required: ["challengeId", "code"],
          properties: {
            challengeId: {
              type: "string",
              format: "uuid",
              example: "3f57a0f8-6f3c-4b19-a0e2-6b4e8b7a1f2a",
            },
            code: {
              type: "string",
              pattern: "^\\d{6}$",
              example: "123456",
            },
          },
        },
        ForgotPasswordInput: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "usuario@email.com",
            },
          },
        },
        VerifyPasswordResetCodeInput: {
          type: "object",
          required: ["challengeId", "code"],
          properties: {
            challengeId: {
              type: "string",
              format: "uuid",
              example: "3f57a0f8-6f3c-4b19-a0e2-6b4e8b7a1f2a",
            },
            code: {
              type: "string",
              pattern: "^\\d{6}$",
              example: "123456",
            },
          },
        },
        ResetPasswordInput: {
          type: "object",
          required: ["resetToken", "password", "passwordConfirmation"],
          properties: {
            resetToken: {
              type: "string",
              description: "Token temporario retornado depois da validacao do codigo",
            },
            password: {
              type: "string",
              format: "password",
              minLength: 8,
              maxLength: 128,
              example: "NovaSenha123",
            },
            passwordConfirmation: {
              type: "string",
              format: "password",
              minLength: 8,
              maxLength: 128,
              example: "NovaSenha123",
            },
          },
        },
        ForgotPasswordResponse: {
          type: "object",
          properties: {
            challengeId: { type: "string", format: "uuid" },
            expiresAt: { type: "string", format: "date-time" },
            message: { type: "string", example: "Código de recuperação enviado por e-mail" },
          },
        },
        VerifyPasswordResetCodeResponse: {
          type: "object",
          properties: {
            resetToken: { type: "string" },
            expiresAt: { type: "string", format: "date-time" },
            message: { type: "string", example: "Código validado" },
          },
        },
        InvalidPasswordResetCodeResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Código de recuperação inválido" },
          },
        },
        PasswordResetBlockedResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Recuperacao bloqueada por 6 horas" },
            blockedUntil: { type: "string", format: "date-time" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            name: {
              type: "string",
            },
            cpf: {
              type: "string",
            },
            birthDate: {
              type: "string",
              format: "date-time",
            },
            phone: {
              type: "string",
            },
            cep: {
              type: "string",
            },
            address: {
              type: "string",
            },
            city: {
              type: "string",
            },
            state: {
              type: "string",
            },
            profilePhoto: {
              type: "string",
              nullable: true,
            },
            email: {
              type: "string",
              format: "email",
            },
            role: {
              type: "string",
              enum: ["USER", "COOPERATIVA", "PrefeituraVendedor", "MASTER"],
            },
            level: {
              type: "number",
              example: 1,
            },
          },
        },
        AuthenticatedUser: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            role: {
              type: "string",
              enum: ["USER", "COOPERATIVA", "PrefeituraVendedor", "MASTER"],
            },
            level: {
              type: "number",
              example: 1,
            },
          },
        },
        DeleteAccountInput: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string", minLength: 1, maxLength: 128, format: "password" },
          },
        },
        RegisterResponse: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
              },
            },
          },
        },
        LoginResponse: {
          oneOf: [{
            type: "object",
            required: ["twoFactorRequired", "challengeId", "expiresAt", "message"],
            properties: {
              twoFactorRequired: { type: "boolean", enum: [true] },
              challengeId: { type: "string", format: "uuid" },
              expiresAt: { type: "string", format: "date-time" },
              message: { type: "string", example: "Código 2FA enviado para o e-mail cadastrado" },
            },
          }, {
            type: "object",
            required: ["twoFactorRequired", "token"],
            properties: { twoFactorRequired: { type: "boolean", enum: [false] }, token: { type: "string" } },
          }],
        },
        AuthResponse: {
          type: "object",
          properties: {
            token: {
              type: "string",
            },
          },
        },
        TermInput: {
          type: "object",
          required: ["text", "type"],
          properties: {
            title: {
              type: "string",
              nullable: true,
              example: "termos de uso",
            },
            text: {
              type: "string",
              example: "conteudo completo do termo",
            },
            type: {
              type: "string",
              enum: ["USER", "ADMIN"],
              example: "USER",
            },
          },
        },
        UpdateTermInput: {
          type: "object",
          required: ["text"],
          properties: {
            title: {
              type: "string",
              nullable: true,
              example: "termos de uso atualizados",
            },
            text: {
              type: "string",
              example: "novo conteudo completo do termo",
            },
          },
        },
        Term: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            documentId: {
              type: "string",
              format: "uuid",
            },
            title: {
              type: "string",
              nullable: true,
            },
            text: {
              type: "string",
            },
            type: {
              type: "string",
              enum: ["USER", "ADMIN"],
            },
            version: {
              type: "number",
              example: 3,
            },
            active: {
              type: "boolean",
              example: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        TermAccept: {
          type: "object",
          properties: {
            accepted: {
              type: "boolean",
              example: true,
            },
            acceptedAt: {
              type: "string",
              format: "date-time",
            },
            documentId: { type: "string", format: "uuid" },
            version: { type: "integer", example: 3 },
          },
        },
        TermStatusResponse: {
          type: "object",
          properties: {
            accepted: {
              type: "boolean",
              example: false,
            },
            currentVersion: {
              type: "number",
              example: 3,
            },
            acceptedVersion: {
              type: "number",
              nullable: true,
              example: 2,
            },
          },
        },
        StoreProduct: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Garrafa reutilizável" },
            description: { type: "string" },
            photo: { type: "string", example: "https://exemplo.com/produto.jpg" },
            barcode: { type: "string", nullable: true, example: "0012345678905" },
            price: { type: "string", format: "decimal", example: "25.00", description: "Valor em EcoCoin" },
            quantity: { type: "integer", minimum: 0 },
            city: { type: "string", example: "Salesópolis" },
            state: { type: "string", example: "SP" },
            active: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateStoreProductInput: {
          type: "object",
          required: ["name", "description", "photo", "price", "quantity"],
          properties: {
            name: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 2000 },
            photo: { type: "string", maxLength: 2048 },
            barcode: { type: "string", maxLength: 64, example: "0012345678905" },
            price: { oneOf: [{ type: "string", example: "25.00" }, { type: "number", example: 25 }] },
            quantity: { type: "integer", minimum: 0 },
          },
        },
        MunicipalCreditInput: {
          type: "object",
          required: ["cpf", "amount"],
          properties: {
            cpf: { type: "string" },
            amount: { type: "string", example: "50.00" },
          },
        },
        RedeemProductInput: {
          type: "object",
          required: ["productId", "quantity"],
          properties: {
            productId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, maximum: 1000 },
          },
        },
        ValidatePickupInput: {
          type: "object",
          required: ["code"],
          properties: { code: { type: "string", pattern: "^[A-F0-9]{12}$", example: "A1B2C3D4E5F6" } },
        },
        Redemption: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            cartId: { ...uuid, nullable: true },
            quantity: { type: "integer" },
            unitPrice: { type: "string", format: "decimal" },
            totalPrice: { type: "string", format: "decimal" },
            pickupCode: { type: "string", nullable: true, description: "Removido após conclusão ou expiração" },
            status: { type: "string", enum: ["PENDING", "COMPLETED", "EXPIRED"] },
            expiresAt: { type: "string", format: "date-time", description: "Expira cinco dias após a troca" },
            completedAt: { type: "string", format: "date-time", nullable: true },
            product: { $ref: "#/components/schemas/StoreProduct" },
            user: { type: "object", description: "Disponível na consulta do vendedor do município", properties: { name: { type: "string" } } },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
            },
          },
        },
        ValidationErrorResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Dados inválidos",
            },
            errors: {
              type: "object",
              additionalProperties: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/account/two-factor": {
        patch: {
          tags: ["Conta"],
          summary: "Ativa ou desativa o 2FA com a senha atual",
          security: [{ bearerAuth: [] }],
          requestBody: jsonBody({ enabled: { type: "boolean" }, password: { type: "string", format: "password" } }),
          responses: {
            200: { description: "Preferência salva", content: { "application/json": { schema: {
              type: "object", properties: { twoFactorEnabled: { type: "boolean" } },
            } } } },
            400: { description: "Dados inválidos" },
            401: { description: "Sessão inválida" },
            403: { description: "Senha atual inválida" },
          },
        },
      },
      "/account/sessions": {
        get: {
          tags: ["Conta e LGPD"],
          summary: "Lista o histórico de acesso da própria conta",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
          ],
          responses: {
            200: { description: "Sessões e paginação", content: { "application/json": { example: {
              sessions: [{
                id: "81e4340d-cc38-4f9d-951a-28cd8af414bf", createdAt: "2026-11-23T13:32:00.000Z",
                expiresAt: "2026-11-23T14:32:00.000Z", revokedAt: null, browser: "Chrome",
                device: "Windows", city: "São Paulo", region: "SP", status: "CURRENT",
              }],
              pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            } } } },
            400: { description: "Paginação inválida" },
            401: { description: "Sessão ausente, expirada ou inválida" },
          },
        },
      },
      "/master/dashboard": {
        get: {
          tags: ["MASTER"],
          summary: "Consulta indicadores administrativos e saúde atual do sistema",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Cadastros, EcoCoins, eventos de segurança, atividades recentes e saúde atual", content: { "application/json": { example: {
              generatedAt: "2026-11-23T13:32:00.000Z", lastRegistration: null,
              pointsDistributed: { periodStart: "2026-11-01T03:00:00.000Z", total: "120", currentMonth: "120", previousMonth: "0", changePercent: null },
              threats: { blocked: 0, periodStart: "2026-11-01T03:00:00.000Z" },
              rateLimit: { sanctions: 0, activeClients: 0, periodStart: "2026-11-01T03:00:00.000Z" },
              recentActivity: [],
              systemHealth: {
                api: { status: "UP", checkedAt: "2026-11-23T13:32:00.000Z", availabilityPercent: null },
                authentication: { status: "UP", checkedAt: "2026-11-23T13:32:00.000Z", availabilityPercent: null },
                processing: { status: "UNKNOWN", availabilityPercent: null, jobs: [] },
              },
            } } } },
            401: { description: "Sessão ausente, expirada ou inválida" },
            403: { description: "Rota exclusiva do MASTER" },
            503: { description: "Painel temporariamente indisponível" },
          },
        },
      },
      "/account/export": {
        get: {
          tags: ["Conta e LGPD"],
          summary: "Exporta os dados da conta autenticada em PDF",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "PDF com os dados pessoais e históricos da conta",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            401: { description: "Não autenticado" },
            404: { description: "Conta não encontrada" },
          },
        },
      },
      "/account": {
        delete: {
          tags: ["Conta e LGPD"],
          summary: "Exclui a conta após confirmar a senha",
          description: "A exclusão do único MASTER encerra a API após a resposta. A inicialização fica bloqueada até a restauração dessa conta.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteAccountInput" } } },
          },
          responses: {
            204: { description: "Acesso e dados pessoais removidos. Registros de auditoria preservados." },
            400: { description: "Senha não informada ou inválida" },
            401: { description: "Não autenticado ou senha incorreta" },
            404: { description: "Conta não encontrada" },
            409: { description: "Conflito com uma operação concorrente" },
          },
        },
      },
      "/auth/register/user": {
        post: {
          tags: ["Auth"],
          summary: "Cadastra um usuario comum",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RegisterInput",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Usuário cadastrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/RegisterResponse",
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            409: {
              description: "E-mail ou CPF já cadastrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/auth/register/admin": {
        post: {
          tags: ["Auth"],
          summary: "Envia convite para um vendedor",
          security: [{ bearerAuth: [] }],
          description: "O convite expira em 24 horas. A conta é criada quando o operador aceita o termo vigente e define a senha pelo link enviado por e-mail.",
          requestBody: operatorBody(true),
          responses: {
            202: { description: "Convite enviado por e-mail" },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Acesso negado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            409: {
              description: "E-mail ou CPF já cadastrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Realiza login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LoginInput",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Credenciais válidas. Retorna o token ou o desafio 2FA, conforme a preferência da conta.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/LoginResponse",
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Credenciais invalidas",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Usuário desativado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/auth/2fa/verify": {
        post: {
          tags: ["Auth"],
          summary: "Valida o codigo 2FA enviado por e-mail",
          description:
            "Recebe o challengeId retornado no login e o codigo numerico de 6 digitos. O codigo expira em ate 15 minutos e o desafio bloqueia apos excesso de tentativas.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VerifyTwoFactorInput",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Código validado e token emitido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/AuthResponse",
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Código inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Código expirado ou usuário desativado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Desafio 2FA não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            429: {
              description: "Muitas tentativas de validacao",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/auth/password/forgot": {
        post: {
          tags: ["Auth"],
          summary: "Solicita a recuperação de senha",
          description: "Envia um codigo numerico de 6 digitos ao e-mail cadastrado. O codigo expira em 15 minutos.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordInput" } },
            },
          },
          responses: {
            200: {
              description: "Código enviado por e-mail",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordResponse" } },
              },
            },
            400: {
              description: "E-mail inválido",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ValidationErrorResponse" } },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
              },
            },
          },
        },
      },
      "/auth/password/verify-code": {
        post: {
          tags: ["Auth"],
          summary: "Valida o código de recuperação de senha",
          description: "Permite 5 tentativas. A quinta falha bloqueia novas tentativas e solicitacoes por 6 horas.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/VerifyPasswordResetCodeInput" } },
            },
          },
          responses: {
            200: {
              description: "Código validado e token temporário emitido",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/VerifyPasswordResetCodeResponse" } },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ValidationErrorResponse" } },
              },
            },
            401: {
              description: "Código inválido, expirado ou desafio inexistente",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/InvalidPasswordResetCodeResponse" } },
              },
            },
            429: {
              description: "Limite de tentativas atingido; bloqueio por 6 horas",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PasswordResetBlockedResponse" } },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
              },
            },
          },
        },
      },
      "/auth/password/reset": {
        post: {
          tags: ["Auth"],
          summary: "Redefine a senha",
          description: "Consome o token temporario, altera a senha e revoga todas as sessoes abertas do usuario.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordInput" } },
            },
          },
          responses: {
            200: {
              description: "Senha redefinida com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string", example: "Senha redefinida com sucesso" } },
                  },
                },
              },
            },
            400: {
              description: "Senhas invalidas ou diferentes",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ValidationErrorResponse" } },
              },
            },
            401: {
              description: "Token inválido, expirado ou já utilizado",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
              },
            },
            500: {
              description: "Erro interno",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
              },
            },
          },
        },
      },
      "/me": {
        get: {
          tags: ["Usuários"],
          summary: "Retorna o usuario autenticado",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Usuário autenticado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      user: {
                        $ref: "#/components/schemas/AuthenticatedUser",
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/store/products": {
        get: {
          tags: ["Loja"], summary: "Lista produtos disponíveis na cidade do usuário", security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Produtos da cidade", content: { "application/json": { schema: { type: "object", properties: { products: { type: "array", items: { $ref: "#/components/schemas/StoreProduct" } } } } } } },
            401: { description: "Não autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            403: { description: "Disponível somente para USER" },
          },
        },
      },
      "/store/balance": {
        get: {
          tags: ["EcoCoin"], summary: "Consulta o saldo EcoCoin do usuário", security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Saldo atual", content: { "application/json": { schema: { type: "object", properties: { balance: { type: "string", example: "75.00" }, currency: { type: "string", enum: ["EcoCoin"] } } } } } }, 401: { description: "Não autenticado" }, 403: { description: "Disponível somente para USER" } },
        },
      },
      "/store/redemptions": {
        post: {
          tags: ["Trocas"], summary: "Troca EcoCoins por um produto", security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RedeemProductInput" } } } },
          responses: { 201: { description: "Troca criada e estoque debitado", content: { "application/json": { schema: { type: "object", properties: { redemption: { $ref: "#/components/schemas/Redemption" } } } } } }, 400: { description: "Dados inválidos" }, 401: { description: "Não autenticado" }, 403: { description: "Produto fora da cidade ou perfil sem acesso" }, 404: { description: "Produto não encontrado" }, 409: { description: "Saldo ou estoque insuficiente" } },
        },
        get: {
          tags: ["Trocas"], summary: "Lista as trocas do usuário autenticado", security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Histórico de trocas", content: { "application/json": { schema: { type: "object", properties: { redemptions: { type: "array", items: { $ref: "#/components/schemas/Redemption" } } } } } } }, 401: { description: "Não autenticado" }, 403: { description: "Disponível somente para USER" } },
        },
      },
      "/store/admin/products": {
        post: {
          tags: ["Administração da Loja"], summary: "Cria um produto no estoque do município do vendedor", security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateStoreProductInput" } } } },
          responses: { 201: { description: "Produto criado", content: { "application/json": { schema: { type: "object", properties: { product: { $ref: "#/components/schemas/StoreProduct" } } } } } }, 400: { description: "Dados inválidos" }, 401: { description: "Não autenticado" }, 403: { description: "Disponível para PrefeituraVendedor" }, 409: { description: "Código de barras duplicado no município" } },
        },
        get: {
          tags: ["Administração da Loja"], summary: "Lista e filtra os produtos do município em páginas de 9 itens", security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", minimum: 1, maximum: 100_000_000, default: 1 } },
            { in: "query", name: "search", description: "Busca por trecho do nome ou descrição", schema: { type: "string", maxLength: 120 } },
            { in: "query", name: "barcode", description: "Código de barras exato", schema: barcode },
            { in: "query", name: "stock", description: "available seleciona itens ativos com estoque e out seleciona itens zerados",
              schema: { type: "string", enum: ["available", "out"] } },
          ],
          responses: {
            200: { description: "Produtos do município e paginação após os filtros", content: { "application/json": { schema: {
              type: "object", properties: {
                products: { type: "array", items: { $ref: "#/components/schemas/StoreProduct" } },
                pagination: { type: "object", properties: {
                  page: { type: "integer" }, limit: { type: "integer", example: 9 },
                  total: { type: "integer" }, totalPages: { type: "integer" },
                } },
              },
            } } } },
            400: { description: "Filtro ou página inválida" },
            401: { description: "Não autenticado" },
            403: { description: "Disponível para PrefeituraVendedor" },
          },
        },
      },
      "/auth/register/cooperative": {
        post: {
          tags: ["Auth"], summary: "MASTER envia convite para uma cooperativa vinculada ao município do CEP", security: [{ bearerAuth: [] }],
          description: "O convite expira em 24 horas. A conta é criada quando o operador aceita o termo vigente e define a senha pelo link enviado por e-mail.",
          requestBody: operatorBody(false),
          responses: { 202: { description: "Convite enviado por e-mail" }, 400: { description: "Dados inválidos" }, 403: { description: "Perfil sem acesso" }, 409: { description: "Cadastro duplicado ou termo indisponível" }, 502: { description: "Falha ao enviar convite" } },
        },
      },
      "/residents/credits": {
        post: {
          tags: ["EcoCoin"], summary: "Cooperativa, vendedor ou MASTER credita EcoCoins a um munícipe", security: [{ bearerAuth: [] }],
          description: "Cooperativas e vendedores podem creditar no próprio município. MASTER pode creditar em qualquer município.",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", maxLength: 128 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MunicipalCreditInput" } } } },
          responses: { 201: { description: "Crédito registrado com protocolo, nome completo do munícipe e saldo atualizado" }, 400: { description: "Dados inválidos" }, 403: { description: "Perfil sem acesso" }, 404: { description: "Munícipe não encontrado" }, 409: { description: "Conflito de saldo, concorrência ou chave" } },
        },
      },
      "/auth/logout": {
        post: { tags: ["Auth"], summary: "Encerra a sessão atual", security: bearer,
          responses: { 204: { description: "Sessão encerrada" }, 401: { description: "Sessão inválida" } },
        },
      },
      "/residents/activation/start": {
        post: { ...activation, summary: "Solicita código para um pré-cadastro",
          requestBody: jsonBody({ cpf }),
          responses: { 202: { description: "Solicitação recebida com challengeId" }, 400: { description: "CPF inválido" } },
        },
      },
      "/residents/activation/confirm": {
        post: { ...activation, summary: "Confirma o código de ativação",
          requestBody: jsonBody({ challengeId: uuid, code: { type: "string", pattern: "^[0-9]{6}$" } }),
          responses: { 200: { description: "Token de ativação e dados do pré-cadastro" }, 400: { description: "Código inválido ou expirado" } },
        },
      },
      "/residents/activation/complete": {
        post: { ...activation, summary: "Ativa a conta do munícipe",
          requestBody: jsonBody({
            challengeId: uuid, activationToken: { type: "string", pattern: "^[a-f0-9]{64}$" },
            phone: { type: "string" }, password: { type: "string", format: "password", minLength: 8 },
            passwordConfirmation: { type: "string", format: "password", minLength: 8 }, termsAccepted: { type: "boolean", enum: [true] },
          }),
          responses: { 200: { description: "Conta ativada com o ID original" }, 400: { description: "Dados inválidos ou ativação expirada" } },
        },
      },
      "/residents/pre-registrations": {
        post: { ...residents, summary: "Pré-cadastra munícipe do mesmo município",
          description: "Disponível apenas para PrefeituraVendedor.",
          requestBody: jsonBody({
            cpf, name: { type: "string" }, birthDate: { type: "string", format: "date", description: "Idade de 18 a 90 anos, inclusive." },
            cep: { type: "string" }, address: { type: "string" }, addressNumber: { type: "string" },
            email: { type: "string", format: "email" },
            termsAccepted: { type: "boolean", enum: [true] },
            authorizationDocument: { type: "string", format: "byte", description: "Um termo assinado em JPG, PNG ou PDF de até 2 MiB" },
          }, ["cpf", "name", "birthDate", "cep", "address", "addressNumber", "email", "termsAccepted", "authorizationDocument"]),
          responses: { 201: { description: "Pré-cadastro criado" }, 400: { description: "Dados inválidos" }, 403: { description: "Perfil ou município sem acesso" }, 409: { description: "CPF ou e-mail em uso" } },
        },
      },
      "/residents/pre-registrations/{id}": {
        delete: { ...residents, summary: "Exclui um pré-cadastro pendente como MASTER", parameters: [pathId()],
          responses: { 204: { description: "Pré-cadastro excluído" }, 403: { description: "Rota exclusiva do MASTER" }, 404: { description: "Pré-cadastro pendente não encontrado" } },
        },
      },
      "/residents/lookup": {
        post: { ...residents, summary: "Localiza munícipe por CPF",
          description: "PrefeituraVendedor consulta o próprio município. MASTER consulta munícipes ativos ou com ativação pendente em qualquer município.",
          requestBody: jsonBody({ cpf }),
          responses: { 200: { description: "ID, saldo e estado de ativação do munícipe" }, 404: { description: "Munícipe não encontrado" } },
        },
      },
      "/residents/sales": {
        post: { ...residents, deprecated: true, summary: "Venda direta desativada",
          responses: { 410: { description: "Use POST /store/admin/carts/{id}/checkout" } },
        },
      },
      "/residents/audit/{userId}": {
        get: { ...residents, summary: "Consulta registros de movimentação",
          description: "MASTER consulta qualquer munícipe. USER consulta a própria conta.",
          parameters: [pathId("userId"), { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } }],
          responses: { 200: { description: "Até 100 registros de auditoria" }, 403: { description: "Acesso negado" } },
        },
      },
      "/store/admin/export.xlsx": {
        get: { ...seller, summary: "Exporta estoque e vendas do município em Excel",
          responses: { 200: { description: "Planilha Excel", content: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } },
          } } },
        },
      },
      "/store/admin/dashboard": {
        get: { ...seller, summary: "Consulta os indicadores do município",
          responses: {
            200: {
              description: "Totais históricos dos pedidos concluídos, até 10 pedidos recentes e até 5 itens mais retirados",
              content: { "application/json": { example: {
                municipality: { city: "salesópolis", state: "sp" },
                ordersCollected: 2, usersServed: 1, pointsRedeemed: "20.00",
                recentOrders: [{
                  id: "fb31f074-dc75-4934-a1d9-875ebe2fdb01",
                  user: { id: "b39b772f-4c82-47f4-8e97-1d13a9702a95", name: "Munícipe de exemplo" },
                  collectedAt: "2026-11-23T13:32:00.000Z",
                  items: [{ productId: "e75fc271-1414-47a9-84d5-311017597c69", name: "Ecobag", quantity: 2 }],
                }],
                topItems: [{ productId: "e75fc271-1414-47a9-84d5-311017597c69", productName: "Ecobag", units: 3, sharePercent: 75 }],
              } } },
            },
            401: { description: "Sessão inválida" },
            403: { description: "Rota exclusiva de PrefeituraVendedor" },
          },
        },
      },
      "/store/admin/products/{id}/stock": {
        patch: { ...seller, summary: "Atualiza a quantidade em estoque", parameters: [pathId()],
          requestBody: jsonBody({ expectedQuantity: quantity, quantity }),
          responses: { 200: { description: "Produto atualizado" }, 404: { description: "Produto não encontrado" }, 409: { description: "Quantidade atual diverge da informada" } },
        },
      },
      "/store/admin/carts": {
        get: { ...seller, summary: "Lista carrinhos abertos do vendedor",
          responses: { 200: { description: "Carrinhos disponíveis" } } },
        post: { ...seller, summary: "Abre um carrinho de 24 horas para um comprador",
          requestBody: jsonBody({ buyerId: uuid }),
          responses: { 201: { description: "Carrinho criado" }, 404: { description: "Comprador não encontrado no município" } },
        },
      },
      "/store/admin/carts/{id}": {
        get: { ...seller, summary: "Consulta um carrinho aberto", parameters: [pathId()],
          responses: { 200: { description: "Carrinho e seus itens" }, 404: { description: "Carrinho não encontrado ou expirado" } },
        },
        delete: { ...seller, summary: "Cancela um carrinho aberto", parameters: [pathId()],
          responses: { 204: { description: "Carrinho cancelado" }, 404: { description: "Carrinho não encontrado ou expirado" } },
        },
      },
      "/store/admin/carts/{id}/items": {
        put: { ...seller, summary: "Define a quantidade de um item", parameters: [pathId()],
          description: "Envie productId ou barcode. Quantidade zero remove o item.",
          requestBody: {
            required: true, content: { "application/json": { schema: { oneOf: [
              { type: "object", required: ["productId", "quantity"], additionalProperties: false, properties: { productId: uuid, quantity } },
              { type: "object", required: ["barcode", "quantity"], additionalProperties: false, properties: { barcode, quantity } },
            ] } } },
          },
          responses: { 200: { description: "Carrinho atualizado" }, 404: { description: "Carrinho ou produto não encontrado" }, 409: { description: "Estoque insuficiente ou limite de itens" } },
        },
      },
      "/store/admin/carts/{id}/checkout": {
        post: { ...seller, summary: "Conclui a venda do carrinho", parameters: [pathId()],
          requestBody: jsonBody({ expectedTotal: { type: "string", example: "25.00" } }),
          responses: { 201: { description: "Recibo da venda. Repetir o mesmo ID devolve o recibo existente." }, 400: { description: "Total confirmado inválido ou ausente" }, 404: { description: "Carrinho não encontrado ou expirado" }, 409: { description: "Carrinho vazio, saldo ou estoque insuficiente" }, 412: { description: "O total mudou. Atualize o carrinho e confirme o novo valor." } },
        },
      },
      "/store/admin/redemptions": {
        get: {
          tags: ["Administração da Loja"], summary: "Lista trocas dos produtos do administrador", security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Trocas do município", content: { "application/json": { schema: { type: "object", properties: { redemptions: { type: "array", items: { $ref: "#/components/schemas/Redemption" } } } } } } }, 401: { description: "Não autenticado" }, 403: { description: "Disponível para PrefeituraVendedor" } },
        },
      },
      "/store/admin/redemptions/validate": {
        post: {
          tags: ["Administração da Loja"], summary: "Valida e consome um código de retirada", security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ValidatePickupInput" } } } },
          responses: { 200: { description: "Retirada concluída; código removido", content: { "application/json": { schema: { type: "object", properties: { redemption: { $ref: "#/components/schemas/Redemption" } } } } } }, 400: { description: "Código malformado" }, 401: { description: "Não autenticado" }, 403: { description: "Código de outra loja ou perfil sem acesso" }, 404: { description: "Código inválido ou utilizado" }, 410: { description: "Código expirado" } },
        },
      },
      "/terms/create": {
        post: {
          tags: ["Termos"],
          summary: "Cria uma nova versao de termo",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TermInput",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Termo criado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      term: {
                        $ref: "#/components/schemas/Term",
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Acesso negado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/list": {
        get: {
          tags: ["Termos"],
          summary: "Lista todos os termos, incluindo versoes",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Termos encontrados",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      terms: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/Term",
                        },
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Acesso negado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/edit/{documentId}": {
        put: {
          tags: ["Termos"],
          summary: "Atualiza um termo criando uma nova versao",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "documentId",
              in: "path",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateTermInput",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Nova versao criada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      term: {
                        $ref: "#/components/schemas/Term",
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ValidationErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Acesso negado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Termo não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/detail/{documentId}": {
        get: {
          tags: ["Termos"],
          summary: "Retorna um termo especifico",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "documentId",
              in: "path",
              required: true,
              schema: {
                type: "string",
                format: "uuid",
              },
            },
          ],
          responses: {
            200: {
              description: "Termo encontrado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      term: {
                        $ref: "#/components/schemas/Term",
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            403: {
              description: "Acesso negado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Termo não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/current": {
        get: {
          tags: ["Termos"],
          summary: "Retorna a versao ativa do termo da role do usuario",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Termo vigente",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      term: {
                        $ref: "#/components/schemas/Term",
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Termo vigente não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/status": {
        get: {
          tags: ["Termos"],
          summary: "Informa se o usuario aceitou a versao vigente",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Status de aceite",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/TermStatusResponse",
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Termo vigente não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/terms/accept": {
        post: {
          tags: ["Termos"],
          summary: "Aceita a versao vigente do termo",
          security: [{ bearerAuth: [] }],
          responses: {
            201: {
              description: "Termo aceito",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accept: {
                        $ref: "#/components/schemas/TermAccept",
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Token não informado ou inválido",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description: "Termo vigente não encontrado",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            409: {
              description: "Termo vigente já aceito",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
});
