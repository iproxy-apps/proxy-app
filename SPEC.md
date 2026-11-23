# Proxy App — Especificação técnica e funcional

> Documento guia para desenvolvimento do app mobile **Proxy** (React Native / Expo) seguindo um padrão de _spec-driven development_. Base: protótipo Lovable em `~/Downloads/proxy-prototype` e API NestJS em [proxy-api](../proxy-api).
>
> Toda cópia de usuário é em **português do Brasil**, valores em **BRL**.

## Índice

1. [Visão geral](#1-visão-geral)
2. [Fundamentos globais](#2-fundamentos-globais)
3. [Integração com o backend](#3-integração-com-o-backend)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Arquitetura de rotas](#5-arquitetura-de-rotas)
6. [Componentes compartilhados](#6-componentes-compartilhados)
7. [Fluxos transversais](#7-fluxos-transversais)
8. [Especificação por tela](#8-especificação-por-tela)
9. [Próximos passos](#9-próximos-passos)

---

## 1. Visão geral

**Produto**: marketplace mobile que conecta **Clientes** que precisam resolver tarefas a **Proxies** que as executam. Inspiração: TaskRabbit, Uber for Services.

**Escopo do MVP**: cadastro, autenticação, criação e execução de tarefas ponta-a-ponta, pagamento via cartão (Stripe), carteira do proxy, histórico, perfil.

**Stack do app**:
- Expo SDK 54 · React Native 0.81 · React 19 · TypeScript (strict)
- Expo Router 6 (file-based + typed routes)
- NativeWind 4 (Tailwind CSS)
- ESLint + Prettier

**Dois perfis**:
| Perfil   | Papel no app                                             |
| -------- | -------------------------------------------------------- |
| `CLIENT` | Cria tarefas, escolhe cartão, valida conclusão, avalia   |
| `PROXY`  | Aceita tarefas na cidade, executa, envia foto, recebe    |

**Convenções-chave**:
- Tarefas têm **ciclo de vida** com 7 estados (ver [§2.6](#26-status-da-tarefa)).
- Pagamento é **retido** até validação do cliente — o cliente paga exatamente o valor oferecido; o proxy recebe 80 %, a plataforma fica com 20 % e paga a taxa da Stripe com esse valor (D1).
- Erros da API vêm em **português** (dicionário no backend).
- Autenticação: **JWT RS256** via Bearer token.

---

## 2. Fundamentos globais

### 2.1 Paleta de cores

Tokens definidos em [tailwind.config.js](./tailwind.config.js). Direção **premium-neutro** (vibe Linear/Stripe/Notion).

| Token                    | HSL                  | Uso                                           |
| ------------------------ | -------------------- | --------------------------------------------- |
| `background`             | `40 20% 97%`         | Fundo da tela (off-white quente)              |
| `foreground`             | `220 10% 12%`        | Texto principal (grafite)                     |
| `card` / `card-foreground` | `0 0% 100%` / `220 10% 12%` | Cards sobre o background              |
| `primary`                | `220 10% 12%`        | Marca, botões principais (grafite)            |
| `primary-foreground`     | `40 20% 96%`         | Texto sobre primary (cream)                   |
| `primary-glow`           | `220 10% 18%`        | Gradiente / hover do primary                  |
| `accent`                 | `45 95% 55%`         | Destaques e CTAs (mostarda dourada)           |
| `accent-foreground`      | `220 12% 11%`        | Texto sobre accent                            |
| `secondary`              | `40 15% 94%`         | Botões fantasmas, seções agrupadas            |
| `muted` / `muted-foreground` | `40 12% 92%` / `220 8% 42%` | Fundo/texto secundário              |
| `border` / `input`       | `40 10% 88%`         | Bordas                                        |
| `ring`                   | `220 10% 22%`        | Foco                                          |
| `destructive`            | `358 70% 52%`        | Erros, exclusão                               |
| `success`                | `152 60% 38%`        | Confirmações, estado "concluído"              |
| `warning`                | `38 92% 52%`         | Alertas, estrelas de rating                   |
| `info`                   | `215 80% 52%`        | Informações neutras                           |

**Splash (tela de boas-vindas)** usa um gradiente próprio mais escuro: `hsl(220, 10%, 8%) → hsl(220, 12%, 14%)`, com texto em cream (`hsl(40, 20%, 96%)`) e accent mostarda.

> A paleta atual é diferente da do protótipo Lovable (que era verde-escuro + lima). A troca foi feita depois que o lima ficou "agronegócio demais" pra um marketplace de serviços do dia a dia.

### 2.2 Status da tarefa — cores

Mapeamento entre o enum `TaskStatus` do backend e os tokens visuais.

| Status (backend)         | Label (UI)              | Token de cor         | Cor aproximada | Implementado? |
| ------------------------ | ----------------------- | -------------------- | -------------- | ------------- |
| `available`              | Disponível              | `status-available`   | Cinza          | ✅            |
| `accepted`               | Aceita                  | `status-accepted`    | Azul           | ⚠️ enum-only  |
| `on_the_way`             | A caminho               | `status-onway`       | Roxo           | ⚠️ enum-only  |
| `in_progress`            | Em andamento            | `status-progress`    | Amarelo        | ✅            |
| `verification_required`  | Aguardando validação    | `status-validating`  | Laranja        | ✅            |
| `completed`              | Concluída               | `status-done`        | Verde          | ✅            |
| `canceled`               | Cancelada               | `status-cancelled`   | Vermelho       | ✅            |
| `payout_failed`          | Falha no repasse        | `status-cancelled`   | Vermelho       | ⚠️ legado (nunca escrito) |

> **Notas**:
> - O backend usa `canceled` (1 L) — protótipo Lovable usava `cancelled` (2 Ls). Manter `canceled` em todos os payloads.
> - `accepted` e `on_the_way` existem no enum mas **nenhum use-case escreve neles** — só aparecem no filtro de `GET /tasks/active`. **Decisão MVP**: tratar como se não existissem na UI (Opção A).
> - `payout_failed` continua no enum e em `TaskStatus` só para linhas antigas: **a API não escreve mais esse estado** (D5). O webhook `payout.failed` apenas liga `payoutIssue` no usuário do proxy, sem estornar nada. Se aparecer, mostrar "Falha no repasse" com a mesma cor de cancelado.

### 2.3 Tipografia

| Uso            | Família              | Tamanhos (px) | Peso     |
| -------------- | -------------------- | ------------- | -------- |
| Display (H1)   | Inter (fallback: system) | 28–44     | 700      |
| Heading (H2)   | Inter                | 22–26         | 600      |
| Subheading     | Inter                | 16–18         | 600      |
| Body           | Inter                | 13–15         | 400–500  |
| Label / caption | Inter               | 11–12         | 500      |

> No app mobile, usar `font-semibold` / `font-bold` do NativeWind. Fonts customizadas (Inter) podem ser carregadas com `expo-font` — opcional no MVP (system fonts ficam próximas o suficiente).

### 2.4 Espaçamento, raios e sombras

- **Padding de tela**: `px-6` (24px) lateral padrão.
- **Raios**: `rounded-2xl` (16px) para cards, `rounded-xl` (12px) para inputs/botões, `rounded-full` para avatars e pills.
- **Sombras**: sutis — usar `shadow-sm` em cards, `shadow-md` em botões primários ao toque. Evitar sombras fortes (estética clean).

### 2.4.1 Gotchas do NativeWind 4 (importante)

Alguns utilitários do Tailwind **não traduzem corretamente** para `style` no React Native nesta versão. Quando o layout sair errado, prefira `style` inline pra essas propriedades:

- `text-center` em `<Text>` → usar `style={{ textAlign: 'center' }}`.
- `self-start` em `<View>` dentro de um pai com `flex-direction: column` → não encolhe ao tamanho do conteúdo. Usar `style={{ alignSelf: 'flex-start' }}` ou definir `width`.
- `flex-1` aninhado com `justify-center` → tecnicamente funciona, mas em telas mobile altas com pouco conteúdo cria "buracos" vazios. **Padrão recomendado** para layouts full-screen: conteúdo no topo + `<View style={{ flex: 1 }} />` como spacer + CTAs no rodapé (em vez de centralizar verticalmente o miolo).
- `gap-X` entre filhos de `<View>` — funciona em RN 0.71+ (estamos em 0.81), mas se der comportamento estranho, usar `marginTop` explícito no segundo item em diante.

Regra geral: usar `className` para cores, fontes, bordas e espaçamento simples. Quando o resultado visual ficar errado, **não brigar com o NativeWind** — descer para `style` inline naquela propriedade específica.

### 2.5 Tom de voz e cópia

- **Informal-profissional**: "Tudo certo!", "Opa, algo deu errado", "Bem-vindo de volta".
- **Evitar jargão financeiro**: "Valor", "Taxa", "Total" em vez de "débito/crédito/fee".
- **Ação direta**: CTAs em verbo no infinitivo ("Criar tarefa", "Aceitar", "Enviar").
- **Toasts**: uma frase, ponto final. Não usar "!" em erros (só em sucesso).

### 2.6 Formatação

| Tipo       | Formato                      | Exemplo            |
| ---------- | ---------------------------- | ------------------ |
| Moeda      | `R$ 1.234,56`                | `formatBRL(1234.56)` |
| Data       | `24 abr`, `24 abr 2026`      | `date-fns/format`  |
| Data+hora  | `24 abr, 14:30`              |                    |
| Telefone   | `(11) 99999-0000`            | mask               |
| CPF        | `000.000.000-00`             | mask               |
| CNPJ       | `00.000.000/0000-00`         | mask               |

Implementar helpers em `src/lib/format.ts` (BRL via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, datas via `date-fns/locale/pt-BR`).

### 2.7 Haptics e animações

- **Haptics**: usar `expo-haptics` em cada ação importante (botão primário, troca de tab, conclusão de passo). Padrão: `Haptics.impactAsync(ImpactFeedbackStyle.Light)`.
- **Animações**: preferir `react-native-reanimated` (já instalado). Entrada de tela: `FadeInDown(300)`. Listas: `Layout.springify()`.
- **Loading**: skeletons com shimmer (componente `Skeleton`).

### 2.8 Tratamento de erros

Padrão único: toda requisição que falhar dispara um **toast de erro** com a mensagem do dicionário do backend (já vem em PT). Implementar interceptor no cliente HTTP.

```ts
// Pseudocódigo
try { await api.post(...) }
catch (e) {
  const msg = e?.response?.data?.message ?? 'Algo deu errado. Tente novamente.'
  toast.error(msg)
}
```

Toast lib sugerida: `sonner-native` ou `burnt`. Posição: topo.

---

## 3. Integração com o backend

### 3.1 Autenticação

- **Access token**: JWT RS256 no header `Authorization: Bearer <token>`, válido por **30 minutos** (claim `exp`).
- **Refresh token**: string opaca devolvida junto com o JWT em `POST /auth/session` e `POST /auth/create` (`{ session, refreshToken }`). Vale 60 dias e é rotacionado a cada `POST /auth/refresh` (o token antigo deixa de valer; reapresentar um token já usado revoga a sessão inteira). Reset de senha e exclusão de conta revogam todos os refresh tokens.
- **Storage**: `expo-secure-store` para os dois tokens (não usar AsyncStorage para segredos).
- **Claims úteis** (ver [`SessionPayload`](#41-sessionpayload)): `sub`, `userType`, `stripeCustomerId`, `stripeAccountId`, `stripeAccountReady`, `walletBalance`, `rating`, etc. Usar para decidir rotas e UI sem chamar API.
- **Expiração**: ao receber 401 com a sessão expirada, chamar `POST /auth/refresh { refreshToken }` uma única vez, gravar o novo par e repetir a requisição. Se o refresh devolver 401 `SESSION_REFRESH_INVALID`, limpar o storage e redirecionar para `/login`.
- **Logout**: `POST /auth/logout { refreshToken }` (responde 204 sempre) e limpar o storage.
- `GET /auth/session/refresh` (só com o access token) devolve `{ session }` com claims atualizadas, sem novo refresh token; `GET /auth/me` devolve o perfil atual do usuário.

### 3.2 Cliente HTTP

- Lib: `axios` (ou `ofetch`).
- Base URL: `process.env.EXPO_PUBLIC_API_URL` (definida em `.env`).
- Interceptors:
  - Request: injeta `Authorization` se houver token em SecureStore.
  - Response: extrai `response.data.message` em erros e passa para o consumidor.

### 3.3 Dicionário de erros (referência rápida)

Mensagens em PT que a API pode retornar. Usar direto no toast.

| Chave | Status | Mensagem |
| ----- | ------ | -------- |
| `STANDARD_ERROR` | 400 | Algo de errado aconteceu ao processar sua requisição. Tente novamente mais tarde. |
| `SESSION_REFRESH_INVALID` | 401 | Sua sessão expirou. Entre novamente. |
| `USER_NOT_CLIENT` | 403 | Apenas clientes podem criar tarefas. |
| `SIGN_UP_UNAVAILABLE` | 503 | Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos. |
| `USER_NOT_FOUND` | 404 | Usuário não encontrado. |
| `USER_EMAIL_EXISTS` | 409 | Um usuário com este email já existe. |
| `USER_INVALID_CREDENTIALS` | 401 | Credenciais fornecidas são inválidas. |
| `USER_NOT_PROXY` | 403 | O usuário não possui permissão de proxy. |
| `PROXY_ACCOUNT_NOT_READY` (ao aceitar a tarefa) | 409 | Conclua a configuração da sua conta na Carteira para aceitar tarefas. |
| `MERCHANT_ACCOUNT_CREATION_FAILED` | 400 | Falha ao criar a conta do comerciante. |
| `MERCHANT_ACCOUNT_NOT_FOUND` | 404 | Conta de comerciante não encontrada. Crie uma conta antes de acessar o painel. |
| `MERCHANT_DASHBOARD_LINK_FAILED` | 400 | Falha ao gerar o link do painel do comerciante. |
| `USER_HAS_ACTIVE_TASKS` | 409 | Você possui tarefas em andamento. Finalize ou cancele todas antes de excluir a conta. |
| `CARD_CREATION_FAILED` | 400 | Falha ao criar o método de pagamento. |
| `NO_SAVED_CARD_FOUND` | 404 | Nenhum cartão salvo encontrado para este usuário. |
| `CARD_NOT_FOUND` | 404 | Cartão não encontrado. |
| `CARD_NOT_CONFIRMED` | 400 | Cartão não confirmado. Adicione o cartão novamente. |
| `CARD_ALREADY_EXISTS` | 409 | Já existe um cartão salvo. Atualize a tela e tente novamente. |
| `CANNOT_DELETE_CARD` | 403 | Você não tem permissão para remover este cartão. |
| `CITY_NOT_SERVED` | 400 | Ainda não atendemos nessa cidade. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte. |
| `TASK_NOT_FOUND` | 404 | Tarefa não encontrada. |
| `CANNOT_START_OWN_TASK` | 403 | Você não pode iniciar uma tarefa que você mesmo criou. |
| `TASK_NOT_AVAILABLE` | 400 | A tarefa não está disponível para ser iniciada. |
| `TASK_MAPPING_NOT_FOUND` | 404 | Mapeamento da tarefa não encontrado. |
| `PROOF_PHOTO_REQUIRED` | 400 | Envie uma foto de comprovação para finalizar a tarefa. |
| `TASK_STATUS_CONFLICT` | 409 | A tarefa mudou de estado. Atualize a tela e tente novamente. |
| `CANNOT_FINISH_TASK` | 403 | Você não tem permissão para finalizar esta tarefa. |
| `CANNOT_VALIDATE_TASK` | 403 | Você não tem permissão para validar esta tarefa. |
| `CANNOT_CANCEL_TASK` | 403 | Você não tem permissão para cancelar esta tarefa. |
| `PROXY_ACCOUNT_NOT_READY` (ao validar a tarefa) | 409 | Não foi possível liberar o pagamento. O Proxy ainda não terminou de configurar a conta para receber. |
| `TASK_TRANSFER_FAILED` | 500 | Falha ao transferir o valor da tarefa para o proxy. |
| `PAYMENT_FAILED` | 409 | Não foi possível cobrar o cliente. Tente outra tarefa. |
| `PAYMENT_PENDING` | 409 | Ainda estamos confirmando a cobrança do cliente. Tente novamente em instantes. |
| `PAYMENT_NOT_CONFIRMED` | 409 | O pagamento desta tarefa ainda não foi confirmado. Tente novamente em alguns minutos. |
| `PAYMENT_DISPUTED` | 409 | O pagamento desta tarefa está em disputa. Fale com o suporte. |
| `REFUND_FAILED` | 500 | Falha ao processar o reembolso. |
| `PASSWORD_RESET_INVALID_CODE` | 400 | Código de recuperação inválido ou expirado. |
| `FILE_FORMAT_NOT_SUPPORTED` | 400 | Formato de arquivo não suportado. Envie uma imagem JPG, PNG, WEBP ou HEIC. |
| `FILE_UPLOAD_FAILED` | 500 | Falha ao fazer upload do arquivo. |
| `FILE_TOO_LARGE` | 413 | Arquivo muito grande. O limite é 10 MB. |
| `VALIDATION_FAILED` | 400 | Dados inválidos. Verifique os campos e tente novamente. |
| `UNAUTHORIZED` | 401 | Sessão inválida ou expirada. Entre novamente. |
| `TOO_MANY_REQUESTS` | 429 | Muitas tentativas. Aguarde um minuto e tente novamente. |
| `ROUTE_NOT_FOUND` | 404 | Rota não encontrada. |
| `RESOURCE_ALREADY_EXISTS` | 409 | Já existe um registro com esses dados. |
| `RESOURCE_NOT_FOUND` | 404 | Registro não encontrado. |
| `INVALID_IDENTIFIER` | 400 | Identificador inválido. |
| `HEALTH_DATABASE_UNAVAILABLE` | 503 | Banco de dados indisponível. |

### 3.4 Endpoints (referência rápida)

Detalhes de request/response em cada tela em [§8](#8-especificação-por-tela).

| Método | Path                          | Auth | Throttle | Uso                                      |
| ------ | ----------------------------- | ---- | -------- | ---------------------------------------- |
| POST   | `/auth/create`                | ❌    | 5/min    | Cadastro — `{ session, refreshToken }`   |
| POST   | `/auth/session`               | ❌    | 5/min    | Login — `{ session, refreshToken }`; 401 `USER_INVALID_CREDENTIALS` também para e-mail desconhecido |
| GET    | `/auth/me`                    | ✅    | 100/min  | Perfil atual (ver §4.1)                  |
| GET    | `/auth/session/refresh`       | ✅    | 100/min  | Novo JWT com claims atualizadas (`{ session }`, só access token) |
| POST   | `/auth/refresh`               | ❌    | 30/min   | Troca o refresh token — `{ session, refreshToken }` |
| POST   | `/auth/logout`                | ❌    | 10/min   | Revoga o refresh token (204)             |
| POST   | `/auth/forgot-password`       | ❌    | 5/min    | Solicitar código de reset                |
| POST   | `/auth/verify-reset-code`     | ❌    | 5/min    | Validar código antes do reset            |
| POST   | `/auth/reset-password`        | ❌    | 5/min    | Redefinir senha (revoga todos os refresh tokens) |
| POST   | `/auth/update-profile`        | ✅    | 100/min  | Atualizar nome e/ou telefone — devolve `{ session }` |
| POST   | `/auth/merchant-account`      | ✅    | 100/min  | Criar/obter link Stripe Connect (Proxy)  |
| GET    | `/auth/merchant-dashboard`    | ✅    | 100/min  | Link do painel Stripe (Proxy)            |
| GET    | `/auth/transaction-history?page=` | ✅ | 100/min | Histórico paginado (20 por página)      |
| DELETE | `/auth/account`               | ✅    | 100/min  | Soft delete da conta (cancela tarefas `available`; bloqueado se `in_progress`/`verification_required`) |
| POST   | `/tasks/create`               | ✅    | 100/min  | Criar tarefa (Cliente) — retorna `{ id }` |
| GET    | `/tasks/fetch?city=&page=`    | ✅    | 100/min  | Listar tarefas disponíveis (Proxy) — `{ items, page, perPage, hasMore }` |
| GET    | `/tasks/price-preview?offeredPrice=` | ✅ | 100/min | Breakdown do preço (cinco números)      |
| GET    | `/tasks/active`               | ✅    | 100/min  | Tarefas ativas do usuário (owner ou executor) |
| GET    | `/tasks/:id`                  | ✅    | 100/min  | Detalhe da tarefa + `payment` embarcado (só dono) |
| GET    | `/tasks/:id/proof`            | ✅    | 100/min  | Foto de prova (imagem; só dono ou executor) |
| POST   | `/tasks/start`                | ✅    | 100/min  | Aceitar + iniciar tarefa (Proxy)         |
| POST   | `/tasks/finish`               | ✅    | 100/min  | Finalizar com foto (Proxy, multipart)    |
| POST   | `/tasks/validate`             | ✅    | 100/min  | Validar + pagar + avaliar (Cliente)      |
| POST   | `/tasks/cancel`               | ✅    | 100/min  | Cancelar tarefa (Cliente, até 1h)        |
| POST   | `/card/setup-intent`          | ✅    | 100/min  | Criar SetupIntent para salvar cartão — `{ clientSecret, setupIntentId }` |
| POST   | `/card/create`                | ✅    | 100/min  | Salvar cartão (`{ paymentMethodId }`)    |
| GET    | `/card/fetch`                 | ✅    | 100/min  | Buscar cartão salvo                      |
| DELETE | `/card/:id`                   | ✅    | 100/min  | Remover cartão (detach Stripe + soft delete) |

**Rate limiting**: 100 req/min default, 5 req/min em `/auth/session`, `/auth/create`, `/auth/forgot-password`, `/auth/verify-reset-code` e `/auth/reset-password`, 30 req/min em `/auth/refresh`, 10 req/min em `/auth/logout`. Webhooks são `@SkipThrottle()`. Em 429, mostrar toast pedindo para aguardar.

> **Gaps anteriores — resolvidos pelo backend** (commit `8bc3c5e`, 13/05/2026):
> - ✅ `GET /tasks/:id` agora existe — usar em todas as telas de detalhe (em vez de cachear de `/tasks/fetch`). Response inclui `payment` como objeto embarcado (só para o dono da tarefa).
> - ✅ `POST /tasks/create` agora retorna `{ id }` — permite `router.push` imediato para o detalhe.
> - ✅ `POST /tasks/validate` aceita `{ rating?: 1-5, comment?: string(max 500) }` — avaliação integrada à validação.
> - ✅ `DELETE /card/:id` para remover cartão.
> - ✅ `DELETE /auth/account` para exclusão de conta.
> - ✅ `GET /tasks/active` para listar tarefas ativas do usuário (substitui a heurística sobre `/auth/transaction-history`).
>
> **Gap remanescente**:
> - Estados `accepted` e `on_the_way` continuam **órfãos no enum** (nenhum use-case escreve neles). Confirmada a **Opção A**: UI ignora esses estados e segue 5 estados reais (`available`, `in_progress`, `verification_required`, `completed`, `canceled`). `payout_failed` é valor legado do enum, nunca escrito pela 1.0 (D5).

---

## 4. Modelo de dados

Tipos a serem definidos em `src/types/`.

### 4.1 SessionPayload

Conteúdo do JWT. Fonte de verdade para UI sem round-trip.

```ts
type UserType = 'CLIENT' | 'PROXY'

interface SessionPayload {
  sub: string                // user ID
  email: string
  name: string
  avatarUrl: string | null
  phoneNumber: string | null
  stripeAccountId: string | null
  stripeAccountReady: boolean
  stripeCustomerId: string | null
  userType: UserType
  rating: number             // 0–5
  totalTasksCompleted: number
  totalTasksCreated: number
  walletBalance: number
  payoutIssue: boolean       // Stripe falhou ao pagar o proxy (webhook payout.failed)
  cardActionRequired: boolean // cartão do cliente não pôde ser cobrado; pedir para confirmar na Carteira
  termsAccepted: boolean
  iat: number
  exp: number                // iat + 30 minutos
}
```

Não há claims de documento (tipo ou URL de documento, verificação): a API não guarda documentos de identidade (D12).

Resposta de login e cadastro (`POST /auth/session`, `POST /auth/create`) e de `POST /auth/refresh`:

```ts
interface AuthResponse {
  session: string       // JWT (access token, 30 min)
  refreshToken: string  // opaco, 60 dias, rotacionado a cada refresh
}
```

`POST /auth/update-profile` e `GET /auth/session/refresh` devolvem só `{ session: string }`.

`GET /auth/me`:

```ts
interface Me {
  id: string
  name: string
  email: string
  phoneNumber: string | null
  avatarUrl: string | null
  userType: UserType
  rating: number
  totalTasksCompleted: number
  totalTasksCreated: number
  walletBalance: number
  stripeAccountId: string | null
  stripeAccountReady: boolean
  payoutIssue: boolean
  cardActionRequired: boolean
  termsAccepted: boolean
}
```

### 4.2 Task

```ts
type TaskStatus =
  | 'available' | 'accepted' | 'on_the_way'
  | 'in_progress' | 'verification_required'
  | 'completed' | 'canceled' | 'payout_failed'

interface PublicUser {
  id: string
  name: string
  avatarUrl: string | null
  rating: number
  totalTasksCreated: number
}

interface Task {
  id: string
  title: string
  description: string
  city: string                 // canonical served city
  state: string
  locationLat: number
  locationLng: number
  locationAddress: string
  offeredPrice: number         // dinheiro sempre como number (BRL)
  proxyEarnings: number | null
  platformFee: number | null
  stripeFee: number | null
  chargedAmount: number | null // igual a offeredPrice
  status: TaskStatus
  proofImageUrl: string | null // chave de storage (<taskId>/<uuid>.jpg), NÃO uma URL: carregar a imagem em GET /tasks/:id/proof com o header Bearer
  startedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  createdAt: string
  owner: string                // userId
  ownerId: PublicUser          // dono, formato público (sem e-mail nem telefone)
}

// GET /tasks/:id
interface TaskDetail extends Omit<Task, 'ownerId'> {
  ownerId: PublicUser & { phoneNumber?: string | null }          // telefone só para o executor, com a tarefa em in_progress / verification_required
  executorId: string | null
  executor: (PublicUser & { phoneNumber?: string | null }) | null // telefone só para o dono, nos mesmos status
  payment: {                   // só o dono recebe; sem paymentIntent
    id: string; taskId: string; amount: number
    status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'
    refundId: string | null; createdAt: string; updatedAt: string
  } | null
}

// GET /tasks/fetch
interface TaskPage { items: Task[]; page: number; perPage: number; hasMore: boolean }
```

### 4.3 Card

```ts
interface Card {
  id: string
  userId: string
  brand: string           // 'visa' | 'mastercard' | ...
  last4: string
  stripeCardId: string
}
```

### 4.4 WalletEntry (derivado)

O backend não expõe uma lista direta. Usar `/auth/transaction-history.tasksCompleted` (para Proxy) como fonte — cada item vira uma `WalletEntry`:

```ts
interface WalletEntry {
  taskId: string
  taskTitle: string
  amount: number         // netAmount do backend
  date: string           // completedAt
}
```

---

## 5. Arquitetura de rotas

### 5.1 Estrutura de arquivos

```
app/
├── _layout.tsx              # Root: SafeAreaProvider + Tailwind
├── index.tsx                # Splash (se não autenticado) ou redirect
├── (auth)/                  # Grupo sem auth
│   ├── _layout.tsx          # Stack sem header
│   ├── choose-profile.tsx
│   ├── sign-up.tsx
│   ├── sign-in.tsx
│   └── forgot-password.tsx
├── (app)/                   # Grupo com auth (guard)
│   ├── _layout.tsx          # Protege rotas + decide tabs por role
│   ├── (tabs)/              # Tabs — layout dinâmico por role
│   │   ├── _layout.tsx
│   │   ├── index.tsx        # Home (Cliente ou Proxy)
│   │   ├── history.tsx      # Histórico
│   │   ├── cards.tsx        # Cartões (Cliente) — hidden para Proxy
│   │   ├── wallet.tsx       # Carteira (Proxy) — hidden para Cliente
│   │   └── profile.tsx      # Perfil
│   ├── tasks/
│   │   ├── create.tsx       # Criar tarefa (Cliente)
│   │   ├── [id].tsx         # Detalhe de tarefa
│   │   └── [id]/finish.tsx  # Finalizar com foto (Proxy)
└── +not-found.tsx           # 404
```

### 5.2 Guarda de rota

No `app/(app)/_layout.tsx`: se não houver token válido em SecureStore, redirecionar para `/(auth)/sign-in` via `<Redirect>`.

### 5.3 Deep linking

Scheme configurado: `proxyapp://`. URLs relevantes:
- `proxyapp://tasks/:id` — detalhe de tarefa (útil para notificações push futuras).

---

## 6. Componentes compartilhados

Localização: `src/components/`.

| Componente            | Props                                                                  | Responsabilidade                                                  |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ScreenHeader`        | `title?`, `back?`, `right?`, `transparent?`                            | Top bar com back e slot direito                                   |
| `BottomTabBar`        | (derivado de role via context)                                         | Tabs dinâmicos por perfil                                         |
| `TaskCard`            | `task`, `showDistance?`, `variant?: 'list' \| 'compact'`               | Card clicável; navega para `/tasks/[id]`                          |
| `StatusBadge`         | `status: TaskStatus`                                                   | Pill com cor + label PT                                           |
| `TaskTimeline`        | `status: TaskStatus`                                                   | Stepper vertical de 6 passos                                      |
| `Avatar`              | `name`, `hue?`, `size?`, `uri?`                                        | Gradiente com iniciais ou foto                                    |
| `EmptyState`          | `icon`, `title`, `description?`, `action?`                             | Estado vazio padronizado                                          |
| `Skeleton`            | `variant`                                                              | Shimmer de loading (task card, line, circle)                      |
| `PriceBreakdown`      | `amount`                                                               | Resumo de valor: "Você paga" (= valor oferecido) e "Proxy recebe" (80 %) |
| `FormInput`           | `label`, `error?`, `hint?`, `icon?`, ...`TextInput` props              | Wrapper de input com label + erro + hint                          |
| `Button`              | `variant: 'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'destructive'`, `size`, `loading?`, `disabled?` | Botão com haptic; `loading` → spinner |
| `PhotoUploader`       | `onPicked(uri)`, `uri?`                                                | Abre câmera/galeria via `expo-image-picker`                       |
| `OtpInput`            | `length=6`, `onComplete(code)`                                         | 6 caixas com auto-advance                                         |
| `CurrencyInput`       | `value`, `onChange`, `min?`                                            | Input com máscara `R$ 0,00`                                       |
| `ScreenContainer`     | `children`, `safeArea?`                                                | SafeArea + scroll + padding padrão                                |

---

## 7. Fluxos transversais

### 7.1 Fluxo de autenticação

```
┌─────────┐   "Já tenho conta"   ┌──────────┐
│ Splash  ├─────────────────────▶│  Login   ├────────┐
│   /     │                      │          │        │
└─────┬───┘                      └──────────┘        │
      │ "Criar conta"                                 ▼
      ▼                                       ┌────────────┐
┌───────────────┐   Cliente/Proxy    ┌────────│ Home (app) │
│ EscolherPerfil├───────────────────▶│Cadastro│            │
└───────────────┘                    └────────┘            │
                                                            │
┌─────────────────┐  Step 1 → 2 → 3  ┌──────┐               │
│ Recuperar senha ├──────────────────▶│Login │──────────────┘
└─────────────────┘                   └──────┘
```

**Regras**:
- Após cadastro ou login com sucesso, salvar `session` e `refreshToken` em SecureStore e navegar para `/(app)` com `router.replace()`.
- Em 401 por sessão expirada, tentar `POST /auth/refresh` uma vez; se falhar com `SESSION_REFRESH_INVALID`, limpar storage e ir para `/(auth)/sign-in`.

### 7.2 Ciclo de vida da tarefa

Versão pragmática que **segue o backend atual** (sem estados intermediários `accepted` / `on_the_way`):

```
┌──────────┐                                              ┌───────────┐
│available │── Proxy clica "Aceitar e iniciar" ──────────▶│in_progress│
└──────────┘                                              └─────┬─────┘
                                                                │
                        Proxy envia foto de prova               │
                                                                ▼
                                                        ┌───────────────────────┐
                                                        │verification_required  │
                                                        └────────┬──────────────┘
                           Cliente "Validar e pagar"              │
                                                                  ▼
                                                        ┌───────────┐
                                                        │completed  │
                                                        └───────────┘

Cancelamento: disponível OU in_progress (até 1h de início) → canceled (via Cliente)
Liberação automática: verification_required há 7 dias → completed (job diário, valida como o dono)
Disputa: webhook charge.dispute.created marca o pagamento como disputed e bloqueia finish, validate e cancel
```

**Decisão do MVP** (Opção A confirmada): seguir os estados reais que o backend escreve — `available`, `in_progress`, `verification_required`, `completed`, `canceled`. `payout_failed` não é mais escrito (D5): o enum o mantém só para linhas antigas, e uma falha de repasse liga `payoutIssue` no usuário do proxy. Os estados `accepted` e `on_the_way` do enum **não são suportados** pela API e devem ser ignorados na UI.

### 7.3 Fluxo de pagamento

**Modelo de taxas (D1)**: o cliente paga exatamente o `offeredPrice`; o proxy recebe 80 % (`proxyEarnings`); a plataforma fica com 20 % (`platformFee`) e paga a taxa da Stripe com esse valor. O app nunca soma taxa por cima do valor oferecido. `GET /tasks/price-preview?offeredPrice=` devolve os cinco números (`offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`).

1. **Cliente salva o cartão** → `POST /card/setup-intent` devolve `{ clientSecret, setupIntentId }`; o app confirma o SetupIntent no próprio aparelho com `@stripe/stripe-react-native` (o 3DS, se houver, acontece **aqui**, uma única vez) e então chama `POST /card/create { paymentMethodId }`. Um cartão por usuário; salvar outro substitui o anterior. Salvar o cartão limpa `cardActionRequired`.
2. **Cliente cria tarefa** → `POST /tasks/create` com `cardDetails.savedCard` (stripeCardId) ou `cardDetails.paymentMethodId`. Backend cria a tarefa em `available` e retorna `{ id }`. Nada é cobrado ainda.
3. **Proxy aceita** → `POST /tasks/start` → backend cobra o cartão do cliente **off-session**, com captura automática, no mesmo ato. O valor fica retido na plataforma até a validação.
   - Sucesso: `{ status: 'succeeded' }`, a tarefa fica `in_progress`.
   - 409 `PAYMENT_FAILED`: o cartão não pôde ser cobrado; a tarefa volta a `available`, o cliente recebe um e-mail e `cardActionRequired` é ligado.
   - 409 `PAYMENT_PENDING`: resultado desconhecido; a reserva do proxy é mantida, repetir `POST /tasks/start` depois (ou consultar `GET /tasks/:id`, que embarca `payment` para o dono).
   - Não há desafio de autenticação no aparelho do proxy e a resposta nunca traz `clientSecret`.
4. **Proxy finaliza** → `POST /tasks/finish` com foto obrigatória → task vira `verification_required`.
5. **Cliente valida** → `POST /tasks/validate` com `{ taskId, rating?, comment? }` → backend:
   - Cria `stripe.transfers.create` para a Connect account do Proxy (ligada à cobrança original).
   - Persiste `transferId` na task e credita `walletBalance` do proxy.
   - Insere rating na tabela `Ratings` (se enviado) e recomputa `Users.rating` (média).
   - Erros: `PROXY_ACCOUNT_NOT_READY` (409) se o proxy não tem `stripeAccountReady`; `PAYMENT_NOT_CONFIRMED` / `PAYMENT_DISPUTED` (409); `TASK_STATUS_CONFLICT` (409) fora de `verification_required`; `TASK_TRANSFER_FAILED` (500).
   - Se o cliente não validar em 7 dias, um job diário valida a tarefa automaticamente (D18).
6. **Cancelamento** (Cliente: `available`, ou `in_progress` até 1h após `startedAt`) → `POST /tasks/cancel` → backend refunda a cobrança integralmente e task vira `canceled`.

**Webhooks**:
- `charge.dispute.created` → pagamento `disputed`; sem movimentação de saldo; bloqueia finish, validate e cancel (409 `PAYMENT_DISPUTED`).
- `payout.failed` (Stripe não conseguiu pagar o proxy) → liga `payoutIssue` no usuário; nada é estornado e a task não muda de estado.

**No app**: após qualquer ação, refetch a task via `GET /tasks/:id` para refletir o estado real (que pode ter mudado via webhook).

### 7.4 Fluxo de reset de senha (3 passos)

```
┌──────────┐ POST /auth/forgot-password ┌──────────┐ POST /auth/verify-reset-code ┌──────────┐ POST /auth/reset-password
│ 1. Email ├───────────────────────────▶│ 2. Código├─────────────────────────────▶│ 3. Senha ├─────────▶ Login
└──────────┘                            └──────────┘                              └──────────┘
```

---

## 8. Especificação por tela

Cada seção segue o mesmo template:
- **Rota** · **Quem acessa** · **Objetivo**
- **Layout** (resumo visual)
- **Copy** (headings, CTAs, placeholders, toasts)
- **Componentes**
- **Estados** (loading / empty / error / success)
- **API calls** (método, path, request, resposta, erros)
- **Navegação**
- **Edge cases**

---

### 8.1 Splash

- **Rota**: `/` (redirect automático para home se autenticado)
- **Acessa**: não autenticado
- **Objetivo**: apresentar o app, direcionar para cadastro ou login.

**Layout**: fundo com gradiente `primary → primary-glow`, logo no topo-esquerda, badge "✨ Novo no Brasil", título grande, sub-heading, lista de 3 benefícios com emojis, dois botões full-width na base.

**Copy**:

| Elemento    | Texto                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Badge       | ✨ Novo no Brasil                                                                          |
| Título      | Resolva o que precisa. Ou ganhe fazendo.                                                   |
| Sub-heading | Conectamos quem precisa de tarefas resolvidas a pessoas prontas pra executar — com pagamento seguro, no app. |
| Feature 1   | 🛡️ Pagamento retido até a tarefa ser concluída                                              |
| Feature 2   | 💰 Recebimento direto na carteira do Proxy                                                  |
| Feature 3   | ⭐ Avaliação e histórico transparentes                                                      |
| CTA 1       | Criar conta → `/(auth)/choose-profile`                                                     |
| CTA 2       | Já tenho conta → `/(auth)/sign-in`                                                         |
| Rodapé      | Ao continuar você aceita nossos Termos e Política de Privacidade.                          |

**Componentes**: `Button` (primary e ghost), `Logo`.
**API**: nenhuma.
**Edge cases**: se já autenticado, `<Redirect href="/(app)" />`.

---

### 8.2 Escolher perfil

- **Rota**: `/(auth)/choose-profile`
- **Acessa**: não autenticado
- **Objetivo**: usuário escolhe `CLIENT` ou `PROXY` antes do cadastro.

**Layout**: header com back, heading `font-display`, subheading, dois cards grandes selecionáveis, botão "Continuar" na base (disabled até seleção).

**Copy**:

| Elemento        | Texto                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Título          | Como você quer começar?                                                 |
| Subtítulo       | Você pode trocar de perfil depois, dentro do app.                       |
| Card Cliente    | **Quero contratar serviços** / Publique tarefas e encontre alguém pra resolver pra você. |
| Card Proxy      | **Quero executar tarefas** / Aceite tarefas na sua cidade e ganhe extra com flexibilidade. |
| CTA             | Continuar                                                               |

**Componentes**: `ScreenHeader`, cards selecionáveis (com checkmark em active), `Button`.
**API**: nenhuma. Armazenar seleção em estado local (ou AsyncStorage) para usar no passo seguinte.
**Navegação**: Continuar → `/(auth)/sign-up?userType=<CLIENT|PROXY>`.
**Edge cases**: bloquear botão até seleção.

---

### 8.3 Cadastro

- **Rota**: `/(auth)/sign-up`
- **Acessa**: não autenticado (com `userType` vindo da query).
- **Objetivo**: criar conta e receber JWT.

**Layout**: header com back e título "Criar conta", form em scroll, botão "Criar minha conta" no rodapé.

**Campos**:

| Campo              | Obrigatório | Placeholder              | Notas                                             |
| ------------------ | ----------- | ------------------------ | ------------------------------------------------- |
| Badge perfil       | —           | "Cadastrando como Cliente/Proxy" | Read-only                                 |
| Nome completo      | ✅           | Seu nome                 |                                                   |
| Email              | ✅           | voce@email.com           | Tipo email                                        |
| Telefone           | ✅ (obrigatório no app; opcional na API — `phoneNumber?` 8–20) | (11) 99999-0000          | Máscara; 8 a 20 caracteres                        |
| Senha              | ✅           | Mínimo 8 caracteres      | `type=password`, 8 a 72 caracteres                |
| Termos             | ✅           | "Li e aceito os **Termos de Uso** e a **Política de Privacidade**." | Checkbox |

Sem tipo, número ou foto de documento: a API não coleta nem guarda documentos de identidade (D12).

**Copy**:
- Botão: `Criar minha conta`
- Erro de termos: toast `Aceite os termos para continuar.`
- Sucesso: toast `Conta criada! Bem-vindo ao Proxy.`

**API**: `POST /auth/create`

Request body (estrito: campos desconhecidos são rejeitados):
```ts
{
  name,                 // 2 a 80 caracteres
  email,                // normalizado para minúsculas
  password,             // 8 a 72 caracteres
  userType,             // 'CLIENT' | 'PROXY'
  phoneNumber?,         // 8 a 20 caracteres
  termsAccepted: true
}
```
Response: `{ session: string, refreshToken: string }`

Erros tratados:
- `USER_EMAIL_EXISTS` → toast "Um usuário com este email já existe."
- `SIGN_UP_UNAVAILABLE` (503) → toast da mensagem; a conta não foi criada, pode tentar de novo.
- `STANDARD_ERROR` → toast da mensagem.

**Componentes**: `ScreenHeader`, `FormInput`, checkbox, `Button`.

**Navegação**: sucesso → salvar `session` e `refreshToken` → `router.replace('/(app)')`.

**Edge cases**:
- Validar senha >= 8 chars antes de enviar.

---

### 8.4 Login

- **Rota**: `/(auth)/sign-in`
- **Acessa**: não autenticado
- **Objetivo**: autenticar com email/senha.

**Layout**: header transparente com back, logo, heading, subheading, dois inputs, link "Esqueci a senha" à direita, botão "Entrar", link "Criar conta" centralizado.

**Copy**:

| Elemento    | Texto                                |
| ----------- | ------------------------------------ |
| Heading     | Bem-vindo de volta                   |
| Sub-heading | Entre para continuar.                |
| Email       | placeholder: voce@email.com          |
| Senha       | placeholder: Sua senha               |
| Link        | Esqueci a senha                      |
| CTA         | Entrar                               |
| Rodapé      | Não tem conta? **Criar conta**       |
| Toast OK    | Tudo certo! Bem-vindo de volta.      |

**API**: `POST /auth/session`

Request: `{ email, password }`
Response: `{ session: string, refreshToken: string }`

Erros:
- `USER_INVALID_CREDENTIALS` (401) → toast "Credenciais fornecidas são inválidas." (também para e-mail desconhecido e conta excluída: a API não revela se o e-mail existe).

**Navegação**: sucesso → salvar `session` e `refreshToken` → `router.replace('/(app)')`. "Esqueci a senha" → `/(auth)/forgot-password`. "Criar conta" → `/(auth)/choose-profile`.

---

### 8.5 Recuperar senha

- **Rota**: `/(auth)/forgot-password`
- **Acessa**: não autenticado
- **Objetivo**: reset em 3 passos.

**Layout**: header com back + título "Recuperar senha", barra de progresso (3 segmentos), conteúdo do step atual.

**Step 1 — Email**:
- Heading: "Qual seu email?"
- Sub: "Vamos enviar um código de 6 dígitos."
- Input: email
- CTA: "Continuar"
- API: `POST /auth/forgot-password { email }` → `{ message }` (mensagem é genérica por segurança).

**Step 2 — Código**:
- Heading: "Digite o código"
- Sub: "Enviado para seu email."
- `OtpInput` (6 caixas)
- Link: "Reenviar código" (reenvia step 1)
- CTA: "Continuar"
- API: `POST /auth/verify-reset-code { email, code }` → `{ message }`. Erro `PASSWORD_RESET_INVALID_CODE` → toast.

**Step 3 — Nova senha**:
- Heading: "Crie uma nova senha"
- Sub: "Mínimo 8 caracteres com letras e números."
- Inputs: "Nova senha" e "Confirme a nova senha" (ambos `type=password`)
- CTA: "Salvar nova senha"
- Validação local: iguais e >= 8 chars (backend mínimo: 8, máximo 72).
- API: `POST /auth/reset-password { email, code, newPassword }` → `{ message }`

**Toast OK (final)**: `Senha alterada! Faça login.` → redireciona `/(auth)/sign-in`.

**Edge cases**:
- Pedidos repetidos de código: `POST /auth/forgot-password` sempre responde o mesmo 200 genérico (a API limita a 3 códigos por 15 minutos em silêncio); o limite de requisições é 5/min (429 `TOO_MANY_REQUESTS` → toast da mensagem). Cada código aceita no máximo 5 tentativas.
- Se usuário fechar antes do step 3 sem concluir, perde o progresso (não guardar em storage).

---

### 8.6 Home do Cliente (tab Início)

- **Rota**: `/(app)/(tabs)/` quando `userType === 'CLIENT'`
- **Objetivo**: acesso rápido a criar tarefa, stats e tarefas ativas do cliente.

**Layout**:
1. Header hero com gradiente `primary` (rounded-b-[28px]), logo + ícones à direita (histórico, notificações), avatar + saudação.
2. Card CTA grande "O que você precisa hoje? / Criar nova tarefa" → `/tasks/create`.
3. Grid de 3 stats: Ativas, Concluídas, Avaliação.
4. Lista "Suas tarefas ativas" (filtradas por status ≠ `completed` / `canceled`).
5. `BottomTabBar`.

**Copy**:

| Elemento       | Texto                                                   |
| -------------- | ------------------------------------------------------- |
| Saudação       | Olá, {primeiro nome} 👋                                 |
| CTA            | O que você precisa hoje? / Criar nova tarefa            |
| Stats          | Ativas / Concluídas / Avaliação                         |
| Lista header   | Suas tarefas ativas / Ver todas                         |
| Empty title    | Nenhuma tarefa ativa                                    |
| Empty desc     | Crie sua primeira tarefa e veja o Proxy fazer mágica.   |
| Empty CTA      | + Criar tarefa                                          |

**Dados**:
- Stats `createdTasks` / `completedTasks` / `rating` — do `SessionPayload`.
- Ativas: `GET /tasks/active` → tarefas onde o usuário é owner OU executor com status ∈ {`accepted`, `on_the_way`, `in_progress`, `verification_required`}. No app, filtrar por `owner === user.id` para mostrar só as do Cliente nesta tela.

**Estados**: loading (2 skeletons de TaskCard), empty (EmptyState com CTA), populado (lista).

**Navegação**: Card CTA → `/tasks/create`. TaskCard → `/tasks/[id]`. Sino → (futuro) notificações. Relógio → tab Histórico.

**Edge cases**: se API falhar, toast de erro e lista vazia.

---

### 8.7 Home do Proxy (tab Tarefas)

- **Rota**: `/(app)/(tabs)/` quando `userType === 'PROXY'`
- **Objetivo**: browse de tarefas disponíveis na cidade, saldo em destaque, filtro.

**Layout**:
1. Header hero com gradiente + saudação.
2. Card "Saldo na carteira: **R$ X,XX**" clicável → `/wallet`.
3. Campo de busca (por título/endereço) + 3 pills de cidade.
4. Lista de tarefas disponíveis com badge de contagem.
5. `BottomTabBar`.

**Copy**:

| Elemento       | Texto                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Saldo          | Saldo na carteira / R$ {balance}                                        |
| Busca          | placeholder: Buscar tarefa...                                           |
| Cidades        | São Paulo / Rio de Janeiro / Belo Horizonte                             |
| Lista header   | Tarefas disponíveis / {count} ativas                                    |
| Empty title    | Nenhuma tarefa por aqui                                                 |
| Empty desc     | Tente trocar de cidade ou volte em alguns minutos.                      |

**API**: `GET /tasks/fetch?city=<city>&page=1` → `{ items: Task[], page, perPage: 10, hasMore }`. Cidade fora das atendidas (São Paulo, Rio de Janeiro, Belo Horizonte) devolve página vazia.

**Estados**:
- Loading (3 skeletons)
- Empty (tarefas vazias ou filtro sem match)
- Populado (lista com distância — **calcular localmente** entre `locationLat/Lng` da tarefa e localização do usuário via `expo-location`).

**Navegação**: Saldo → `/wallet`. TaskCard → `/tasks/[id]`.

**Edge cases**:
- Permissão de localização negada → não mostrar distância, só endereço.
- Paginação: scroll infinito; pedir a próxima página enquanto `hasMore === true`.

---

### 8.8 Criar tarefa

- **Rota**: `/(app)/tasks/create`
- **Acessa**: `CLIENT`
- **Objetivo**: publicar uma tarefa.

**Layout em 2 passos** (com progress bar e botão "Voltar"/"Continuar"):

**Passo 1 — Detalhes**:

| Campo        | Placeholder                       | Validação       |
| ------------ | --------------------------------- | --------------- |
| Título       | Ex: Trocar lâmpada da sala        | obrigatório     |
| Descrição    | Conte tudo que importa...         | obrigatório, ≥ 10 chars |
| Endereço     | Busca com autocomplete (Google Places, `country:br`), restrita às cidades atendidas (app-side, Phase 3 P3-T14b; a API só valida `city`/`state`) | obrigatório; a seleção preenche endereço formatado, cidade, estado e coordenadas |
| Complemento  | Apto, bloco, referência           | opcional, até 120 chars |
| Data         | (picker nativo)                   | obrigatório, ≥ hoje |
| Hora         | (picker nativo)                   | obrigatório     |
| Valor        | 0,00 (prefixo "R$")               | mínimo R$ 20,00, máximo R$ 10.000,00 |

Hints: "Seja claro e direto." / "Detalhes ajudam o Proxy a entender o serviço." / "Mínimo R$ 20,00"

**Passo 2 — Pagamento**:
- Resumo da tarefa (card não editável)
- Seleção de cartão salvo OU "+ Adicionar cartão" (abre modal de cartões)
- Breakdown (`PriceBreakdown`, dados de `GET /tasks/price-preview?offeredPrice=`):
  - Valor oferecido: R$ X
  - **Você paga: R$ X** (exatamente o valor oferecido; `chargedAmount`)
  - O Proxy recebe 80 %: R$ Y (`proxyEarnings`); a plataforma fica com 20 % e paga a taxa da Stripe
- Disclaimer: "O valor fica retido com segurança e só é repassado ao Proxy quando você validar a conclusão."
- Botões: "Voltar" / "Publicar tarefa".

**API**: `POST /tasks/create`

Request:
```ts
{
  title, description,
  address: { formattedAddress, complement?, city, state, locationLat, locationLng },
  pricing: { offeredPrice },          // 20 a 10000, até 2 casas decimais
  cardDetails: { savedCard: stripeCardId } // ou { paymentMethodId }
}
```

O endereço vem da busca Google Places (`country:br`) restrita às cidades atendidas; a API valida `city`/`state` contra São Paulo/SP, Rio de Janeiro/RJ e Belo Horizonte/MG. (Os campos legados `street` + `zipCode` ainda são aceitos no lugar de `formattedAddress` até a Fase 5; o app novo não os envia.)

**Erros**:
- `CITY_NOT_SERVED` (400) → toast da mensagem.
- `USER_NOT_CLIENT` (403) → toast da mensagem.
- `CARD_CREATION_FAILED` → toast da mensagem.
- `NO_SAVED_CARD_FOUND` → sugerir adicionar cartão.

**Resposta**: `{ id: string }`

**Toast OK**: "Tarefa publicada! Aguardando um Proxy."
**Navegação**: sucesso → `router.replace('/tasks/' + id)`.

---

### 8.9 Detalhe de tarefa

- **Rota**: `/(app)/tasks/[id]`
- **Acessa**: Cliente (dona) ou Proxy (qualquer)
- **Objetivo**: visualizar tudo sobre a tarefa + executar ações conforme status e perfil.

**Layout**:
1. Header com back.
2. Card de resumo: título + `StatusBadge`, descrição, localização, data/hora, valor em destaque.
3. Seção de pessoas envolvidas (executor ou "Aguardando").
4. `TaskTimeline` (stepper de 5 passos — alinhado ao backend).
5. Seção de foto de prova (se `proofImageUrl`): `proofImageUrl` é uma chave de storage, não uma URL; carregar a imagem com `GET /tasks/:id/proof` enviando o header `Authorization: Bearer`.
6. Seção de avaliação (se status `verification_required` e cliente).
7. Recibo (se status `completed`).
8. Botão de ação sticky no rodapé.

**Ações por combinação** (status × perfil):

| Status                     | Cliente                                                  | Proxy                                                       |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| `available`                | ❌ Cancelar tarefa                                        | ▶️ Aceitar e iniciar tarefa                                 |
| `in_progress`              | ❌ Cancelar tarefa (se < 1h desde startedAt)              | 📷 Finalizar com foto → `/tasks/[id]/finish`                |
| `verification_required`    | ✅ Validar e pagar / Contestar                            | ⏳ "Aguardando validação do cliente..." (disabled)           |
| `completed`                | Ver recibo (sem ação)                                    | Ver recibo (sem ação)                                       |
| `canceled`                 | (sem ação)                                               | (sem ação)                                                  |

**Fonte de dados**: `GET /tasks/:id` retorna a task completa **com o objeto `payment` embarcado** — usar como única fonte de verdade. Refetch após cada ação.

**APIs por ação**:
- Proxy aceitar: `POST /tasks/start { taskId }` → response `{ status: 'succeeded' }` (cobrança off-session com captura automática; sem autenticação no aparelho do proxy).
  - `succeeded`: toast OK e refetch.
  - Toasts OK: `Tarefa aceita! Boa execução.`
  - Erros: `CANNOT_START_OWN_TASK`, `USER_NOT_PROXY`, `PROXY_ACCOUNT_NOT_READY` (409 — abrir a Carteira), `TASK_NOT_AVAILABLE`, `PAYMENT_FAILED`, `PAYMENT_PENDING` (409 — tentar de novo em instantes).
- Cliente validar: `POST /tasks/validate { taskId, rating?, comment? }` → toast OK `Pagamento liberado. Obrigado!`.
  - Erros: `CANNOT_VALIDATE_TASK`, `TASK_STATUS_CONFLICT` (409 — a tarefa mudou de estado; refetch), `PROXY_ACCOUNT_NOT_READY` (409 — informar o cliente que o pagamento ao proxy não foi possível agora), `PAYMENT_NOT_CONFIRMED`, `PAYMENT_DISPUTED`, `TASK_TRANSFER_FAILED`.
- Cliente cancelar: `POST /tasks/cancel { taskId }` → toast OK `Tarefa cancelada.`. Erros: `CANNOT_CANCEL_TASK`, `REFUND_FAILED`.

**Avaliação** (estrelas 1-5 + comentário opcional): **enviar junto com validação** no mesmo `POST /tasks/validate`. Backend insere na tabela `Ratings` e recomputa a média em `Users.rating`.

**Copy relevante**:
- Labels: "Valor oferecido", "Localização", "Quando", "Foto de prova", "Como foi o serviço?"
- Botões: "Aceitar e iniciar tarefa", "📷 Finalizar com foto", "✓ Validar e pagar", "Contestar conclusão", "❌ Cancelar tarefa".
- Disputa: abre modal informativo "Funcionalidade em breve." (MVP).

**Estados**:
- Loading: skeleton do card.
- Tarefa não encontrada: EmptyState com CTA "Voltar".

**Navegação**: "Finalizar com foto" → `/tasks/[id]/finish`. Depois da ação, refetch da tarefa via `GET /tasks/:id` (`react-query` invalidate).

---

### 8.10 Finalizar tarefa (Proxy)

- **Rota**: `/(app)/tasks/[id]/finish`
- **Acessa**: Proxy executor da tarefa, status `in_progress`
- **Objetivo**: enviar foto de prova para liberar validação.

**Layout**:
- Header com back + título "Finalizar tarefa".
- Heading "Última etapa" + sub "Envie uma foto de prova pra liberar o pagamento."
- Área grande (aspect 4:3) para foto — tap abre câmera via `expo-image-picker`. Estados: vazio (dashed + ícone câmera) / preenchido (imagem + ✓).
- Campo opcional "Observações (opcional)" (textarea).
- Botão "Enviar e finalizar" (disabled até foto; a foto é obrigatória).

**API**: `POST /tasks/finish` (multipart/form-data)

Request:
```
fields:
  taskId: string
files:
  file: <jpg|png|webp|heic>   # obrigatório (campo multipart `file`)
```

Erros:
- `PROOF_PHOTO_REQUIRED` (400) → toast.
- `FILE_FORMAT_NOT_SUPPORTED` → toast.
- `FILE_TOO_LARGE` (413) → toast.
- `CANNOT_FINISH_TASK` → toast.
- `TASK_STATUS_CONFLICT` (409) → toast e refetch.
- `PAYMENT_NOT_CONFIRMED` / `PAYMENT_DISPUTED` (409) → toast.

Sem limite de tempo para finalizar a tarefa. A foto é guardada como JPEG (lado maior até 1600 px) e lida pelo dono ou executor em `GET /tasks/:id/proof`.

**Toast OK**: `Enviado! Aguardando validação do cliente.`
**Navegação**: sucesso → `router.back()` (volta ao detalhe) e refetch.

**Edge cases**:
- Foto maior que 10MB → validar local antes do upload.
- Perda de conexão → permitir retry sem reescolher foto.

---

### 8.11 Carteira (Proxy)

- **Rota**: `/(app)/(tabs)/wallet`
- **Acessa**: `PROXY`
- **Objetivo**: mostrar saldo e histórico de ganhos.

**Layout**:
1. Card de saldo em destaque (fundo `primary`, `font-display text-[40px]` no valor).
2. Badge "🛡️ Conta merchant ativa" (se `stripeAccountReady`) ou CTA "Configurar recebimento" (abre Stripe onboarding via WebBrowser).
3. Link "Painel Stripe" → abre URL do `GET /auth/merchant-dashboard` em `WebBrowser`.
4. Lista "Ganhos recentes" (de `/auth/transaction-history.tasksCompleted`).
5. `BottomTabBar`.

**Copy**:
- Labels: "Saldo disponível", "Ganhos recentes", "Extrato".
- CTA onboarding: "Configurar recebimento"
- Empty: "Sem ganhos ainda."

**APIs**:
- `POST /auth/merchant-account` → `{ accountLinkUrl }` (abrir no WebBrowser).
- `GET /auth/merchant-dashboard` → `{ dashboardUrl }` (abrir no WebBrowser).
- `GET /auth/transaction-history` → usar `tasksCompleted` como ganhos.

**Edge cases**:
- Se `stripeAccountReady === false`, ocultar link Painel Stripe.
- Saldo é derivado do JWT (`walletBalance`) — atualizar localmente após validação de tarefas ou após refresh do token.

---

### 8.12 Cartões (Cliente)

- **Rota**: `/(app)/(tabs)/cards`
- **Acessa**: `CLIENT`
- **Objetivo**: gerenciar cartão salvo para pagamento.

**Layout**:
- Se não há cartão: `EmptyState` com ícone + título "Nenhum cartão salvo" + desc "Adicione um cartão pra contratar serviços rapidamente." + CTA "+ Adicionar cartão".
- Se há cartão: exibir como card com gradiente `primary`, bandeira, `•••• •••• •••• {last4}`.
- Botão "+ Adicionar cartão" → abre bottom sheet com form (número, validade, CVV, titular) + botão "Salvar cartão".

**API**:
- `GET /card/fetch` → `{ id, userId, brand, last4, stripeCardId }` (ou 404 `NO_SAVED_CARD_FOUND`).
- `POST /card/setup-intent` → `{ clientSecret, setupIntentId }`; o app confirma o SetupIntent com `@stripe/stripe-react-native` e então chama `POST /card/create { paymentMethodId }`. **MVP**: usar `<CardField>` do `@stripe/stripe-react-native` ao invés de form manual.
  - Erros: `CARD_NOT_CONFIRMED` (400), `CARD_ALREADY_EXISTS` (409), `CARD_CREATION_FAILED`.
- `DELETE /card/:id` → soft delete + detach na Stripe.
  - Erros: `CARD_NOT_FOUND`, `CANNOT_DELETE_CARD`.

**Copy**:
- Erro: `Cartão inválido. Confira os dados.`
- OK ao adicionar: `Cartão adicionado!`
- OK ao remover: `Cartão removido.`
- Confirmação ao remover: alert "Remover cartão?" com botões "Cancelar" / "Remover".

**Edge cases**:
- Backend guarda **apenas 1 cartão por usuário**. Adicionar novo substitui o anterior — UI precisa deixar isso claro ("Substituir cartão?" modal se já houver).

---

### 8.13 Histórico (ambos)

- **Rota**: `/(app)/(tabs)/history`
- **Acessa**: todos
- **Objetivo**: ver todas as tarefas do usuário organizadas por status.

**Layout**:
- Header "Histórico".
- Tab switcher: "Em andamento" / "Concluídas" / "Canceladas".
- Lista de `TaskCard variant="compact"`.
- `BottomTabBar`.

**Filtros**:
| Tab            | Status                                                        |
| -------------- | ------------------------------------------------------------- |
| Em andamento   | `available`, `in_progress`, `verification_required`           |
| Concluídas     | `completed`                                                   |
| Canceladas     | `canceled`                                                    |

**APIs**:
- Em andamento: `GET /tasks/active` (owner OU executor; para o dono: `available`, `in_progress`, `verification_required`).
- Concluídas / Canceladas: `GET /auth/transaction-history?page=1` → `{ tasksCreated, tasksCompleted, page, perPage: 20, hasMore }`. Cada item: `{ id, title, status, city, offeredPrice, netAmount, createdAt, completedAt, canceledAt }`. `tasksCreated` são as tarefas que o usuário criou (qualquer status); `tasksCompleted` são as que ele executou com status `completed`, `canceled` ou `payout_failed`. `netAmount` vem das colunas gravadas: para o proxy é `proxyEarnings` (0 se cancelada); para o cliente é `chargedAmount` só quando a tarefa foi concluída. Juntar as duas listas e filtrar por status no cliente; pedir a próxima página enquanto `hasMore === true`.

**Copy empty**: "Nada por aqui" / "Suas tarefas vão aparecer nesta aba quando houver atualização."

**Edge cases**: alternar tabs entre "Em andamento" e os outros pode trocar a fonte de dados — usar `react-query` com keys distintas e prefetch dos dois.

---

### 8.14 Perfil

- **Rota**: `/(app)/(tabs)/profile`
- **Acessa**: todos
- **Objetivo**: ver dados, editar, sair.

**Layout**:
1. Card de perfil: avatar (64px) + nome + email + telefone.
2. Stats grid (3 colunas): Criadas/Concluídas, Avaliação, Cidade.
3. Seção **Conta**: Editar dados, Segurança.
4. Seção **Mais**: Termos e Privacidade, Sair, **Excluir conta** (destrutivo).
5. Rodapé: "Proxy v1.0.0 — feito no Brasil 🇧🇷".
6. `BottomTabBar`.

**Editar dados** (D14): tela secundária que edita só **nome** e **telefone** → `POST /auth/update-profile { name?, phoneNumber? }` → devolve `{ session }` (novo JWT) → atualizar SecureStore. E-mail, tipo de perfil, avatar e senha não são editáveis aqui.

**Sair**: confirmar em alert → limpar SecureStore → `router.replace('/')`.

**Excluir conta**:
- Alert duplo de confirmação ("Tem certeza? Esta ação não pode ser desfeita.").
- `DELETE /auth/account` → backend faz soft delete (anonimiza PII, seta `isDeleted=true`, cancela automaticamente as tarefas `available` do usuário e revoga todos os refresh tokens).
- Erro `USER_HAS_ACTIVE_TASKS` (409) → toast com a mensagem do dicionário (tarefa `in_progress` ou `verification_required` como dono ou executor) e abrir o histórico.
- Sucesso → limpar SecureStore → `router.replace('/')`.

**Copy**:
- Títulos de seção: "Conta", "Mais".
- "Sair" em vermelho.
- "Excluir conta" em vermelho.

**APIs**:
- `POST /auth/update-profile { name?, phoneNumber? }` (ao menos um campo; `phoneNumber` pode ser `null`) → `{ session: string }`.
- `DELETE /auth/account` → 204 No Content.

**Edge cases**:
- Trocar de `userType` manualmente não está no MVP (remover opção "trocar para Proxy/Cliente" do protótipo — no backend é um campo real, não um modo).

---

## 9. Próximos passos

### 9.1 Gaps remanescentes
1. **Estados `accepted` / `on_the_way`** — continuam órfãos no enum do backend. Decisão **mantida (Opção A)**: ignorar na UI.
2. **3DS ao salvar o cartão**: a autenticação acontece uma vez, na confirmação do SetupIntent (`POST /card/setup-intent`) com `@stripe/stripe-react-native`. `POST /tasks/start` cobra off-session e não exige nenhuma ação no aparelho do proxy.
3. **Endereço** em `POST /tasks/create`: o backend exige `formattedAddress`, `city`, `state`, `locationLat` e `locationLng`; o app obtém tudo da busca Google Places (app-side, Phase 3 P3-T14b; a API só valida `city`/`state`) (§8.8).
4. **Push notifications** (futuro, não MVP): "Sua tarefa foi aceita", "Aguardando validação", "Pagamento liberado".

### 9.2 Ordem sugerida de implementação
1. Estrutura de rotas + layouts + guard de auth + SecureStore.
2. Cliente HTTP + interceptor de erros + tratamento de 401/429.
3. Auth (Splash, Escolher perfil, Cadastro, Login, Recuperar senha).
4. Cartões (com `@stripe/stripe-react-native`) — pré-requisito para criar tarefa.
5. Home Cliente + Criar tarefa (happy path).
6. Home Proxy + Detalhe de tarefa (`GET /tasks/:id`) + Start.
7. Finalizar tarefa (foto via `expo-image-picker`) + Validar (cliente, com rating).
8. Carteira + Stripe Connect onboarding.
9. Histórico + Perfil + exclusão de conta.
10. Polish: skeletons, animações Reanimated, haptics, deep links, refetch via webhook (poll após ações).

### 9.3 Decisões em aberto
- Biblioteca de toast: `sonner-native` (recomendado, idiomático React) vs `burnt` (mais nativo).
- Data fetching: `@tanstack/react-query` **fortemente recomendado** — caching, retry exponencial em 429, invalidação por chave após mutations.
- Salvar cartão: **`@stripe/stripe-react-native`** (SDK oficial — confirma o SetupIntent, inclusive o 3DS).
- Geolocalização: `expo-location` para distância na lista do Proxy; busca de endereço via Google Places.
- Push notifications (futuro): `expo-notifications` + deep link `proxyapp://tasks/:id`.
