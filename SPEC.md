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
- Pagamento é **retido** até validação do cliente — taxa de 20% plataforma + 3,99%+R$0,39 Stripe.
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
| `payout_failed`          | Falha no repasse        | `status-cancelled`   | Vermelho       | ✅ (webhook)  |

> **Notas**:
> - O backend usa `canceled` (1 L) — protótipo Lovable usava `cancelled` (2 Ls). Manter `canceled` em todos os payloads.
> - `accepted` e `on_the_way` existem no enum mas **nenhum use-case escreve neles** — só aparecem no filtro de `GET /tasks/active`. **Decisão MVP**: tratar como se não existissem na UI (Opção A).
> - `payout_failed` é estado terminal: webhook `payout.failed` reverte a transferência, debita `walletBalance` e seta a task. UI deve mostrar como "Falha no repasse" com mesma cor de cancelado.

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

- **Token**: JWT RS256 no header `Authorization: Bearer <token>`.
- **Storage**: `expo-secure-store` (não usar AsyncStorage para segredos).
- **Claims úteis** (ver [`SessionPayload`](#41-sessionpayload)): `sub`, `userType`, `stripeCustomerId`, `stripeAccountId`, `walletBalance`, `rating`, etc. Usar para decidir rotas e UI sem chamar API.
- **Expiração**: tratar 401 → limpar storage → redirect para `/login`.

### 3.2 Cliente HTTP

- Lib: `axios` (ou `ofetch`).
- Base URL: `process.env.EXPO_PUBLIC_API_URL` (definida em `.env`).
- Interceptors:
  - Request: injeta `Authorization` se houver token em SecureStore.
  - Response: extrai `response.data.message` em erros e passa para o consumidor.

### 3.3 Dicionário de erros (referência rápida)

Mensagens em PT que a API pode retornar. Usar direto no toast.

| Chave                                     | Status | Mensagem                                                                                 |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `STANDARD_ERROR`                          | 400    | Algo de errado aconteceu ao processar sua requisição. Tente novamente mais tarde.        |
| `USER_NOT_FOUND`                          | 404    | Usuário não encontrado.                                                                  |
| `USER_EMAIL_EXISTS`                       | 409    | Um usuário com este email já existe.                                                     |
| `USER_INVALID_CREDENTIALS`                | 401    | Credenciais fornecidas são inválidas.                                                    |
| `USER_NOT_PROXY`                          | 403    | O usuário não possui permissão de proxy.                                                 |
| `USER_HAS_ACTIVE_TASKS`                   | 409    | Não é possível excluir a conta: existem tarefas em andamento.                            |
| `MERCHANT_ACCOUNT_CREATION_FAILED`        | 400    | Falha ao criar a conta do comerciante.                                                   |
| `MERCHANT_ACCOUNT_NOT_FOUND`              | 404    | Conta de comerciante não encontrada. Crie uma conta antes de acessar o painel.           |
| `MERCHANT_DASHBOARD_LINK_FAILED`          | 400    | Falha ao gerar o link do painel do comerciante.                                          |
| `CARD_CREATION_FAILED`                    | 400    | Falha ao criar o método de pagamento.                                                    |
| `NO_SAVED_CARD_FOUND`                     | 404    | Nenhum cartão salvo encontrado para este usuário.                                        |
| `CARD_NOT_FOUND`                          | 404    | Cartão não encontrado.                                                                   |
| `CANNOT_DELETE_CARD`                      | 403    | Você não tem permissão para excluir este cartão.                                         |
| `TASK_NOT_FOUND`                          | 404    | Tarefa não encontrada.                                                                   |
| `CANNOT_START_OWN_TASK`                   | 403    | Você não pode iniciar uma tarefa que você mesmo criou.                                   |
| `TASK_NOT_AVAILABLE`                      | 400    | A tarefa não está disponível para ser iniciada.                                          |
| `TASK_MAPPING_NOT_FOUND`                  | 404    | Mapeamento da tarefa não encontrado.                                                     |
| `CANNOT_FINISH_TASK`                      | 403    | Você não tem permissão para finalizar esta tarefa.                                       |
| `TASK_STARTED_AT_NOT_VALID`               | 400    | A tarefa não pode ser finalizada após mais de 1 hora do seu início.                      |
| `TASK_NOT_AVAILABLE_FOR_VALIDATION`       | 400    | A tarefa não está em estado de validação.                                                |
| `CANNOT_VALIDATE_TASK`                    | 403    | Você não tem permissão para validar esta tarefa.                                         |
| `CANNOT_CANCEL_TASK`                      | 403    | Você não tem permissão para cancelar esta tarefa.                                        |
| `PROXY_ACCOUNT_NOT_READY`                 | 409    | A conta merchant do proxy ainda não está pronta para receber pagamentos.                 |
| `PAYMENT_FAILED`                          | 402    | Falha ao processar o pagamento.                                                          |
| `TRANSFER_FAILED`                         | 500    | Falha ao criar transferência.                                                            |
| `REFUND_FAILED`                           | 500    | Falha ao processar o reembolso.                                                          |
| `PASSWORD_RESET_TOO_MANY_REQUESTS`        | 429    | Muitas tentativas de recuperação de senha. Aguarde alguns minutos antes de tentar novamente. |
| `PASSWORD_RESET_INVALID_CODE`             | 400    | Código de recuperação inválido ou expirado.                                              |
| `PASSWORD_RESET_SEND_FAILED`              | 500    | Falha ao enviar o código de recuperação. Tente novamente.                                |
| `FILE_FORMAT_NOT_SUPPORTED`               | 400    | Formato de arquivo não suportado. Envie uma imagem JPG, PNG ou WEBP.                     |
| `FILE_UPLOAD_FAILED`                      | 500    | Falha ao fazer upload do arquivo.                                                        |

### 3.4 Endpoints (referência rápida)

Detalhes de request/response em cada tela em [§8](#8-especificação-por-tela).

| Método | Path                          | Auth | Throttle | Uso                                      |
| ------ | ----------------------------- | ---- | -------- | ---------------------------------------- |
| POST   | `/auth/create`                | ❌    | 5/min    | Cadastro                                 |
| POST   | `/auth/session`               | ❌    | 5/min    | Login                                    |
| POST   | `/auth/forgot-password`       | ❌    | 100/min  | Solicitar código de reset                |
| POST   | `/auth/verify-reset-code`     | ❌    | 100/min  | Validar código antes do reset            |
| POST   | `/auth/reset-password`        | ❌    | 100/min  | Redefinir senha                          |
| POST   | `/auth/update-profile`        | ✅    | 100/min  | Atualizar perfil (devolve novo JWT)      |
| POST   | `/auth/merchant-account`      | ✅    | 100/min  | Criar/obter link Stripe Connect (Proxy)  |
| GET    | `/auth/merchant-dashboard`    | ✅    | 100/min  | Link do painel Stripe (Proxy)            |
| GET    | `/auth/transaction-history`   | ✅    | 100/min  | Histórico completo do usuário            |
| DELETE | `/auth/account`               | ✅    | 100/min  | Soft delete da conta (bloqueado se tarefas ativas) |
| POST   | `/tasks/create`               | ✅    | 100/min  | Criar tarefa (Cliente) — retorna `{ id }` |
| GET    | `/tasks/fetch?city=&page=`    | ✅    | 100/min  | Listar tarefas disponíveis (Proxy)       |
| GET    | `/tasks/active`               | ✅    | 100/min  | Tarefas ativas do usuário (owner ou executor) |
| GET    | `/tasks/:id`                  | ✅    | 100/min  | Detalhe da tarefa + `payment` embarcado  |
| POST   | `/tasks/start`                | ✅    | 100/min  | Aceitar + iniciar tarefa (Proxy)         |
| POST   | `/tasks/finish`               | ✅    | 100/min  | Finalizar com foto (Proxy, multipart)    |
| POST   | `/tasks/validate`             | ✅    | 100/min  | Validar + pagar + avaliar (Cliente)      |
| POST   | `/tasks/cancel`               | ✅    | 100/min  | Cancelar tarefa (Cliente, até 1h)        |
| POST   | `/card/create`                | ✅    | 100/min  | Salvar cartão (token Stripe)             |
| GET    | `/card/fetch`                 | ✅    | 100/min  | Buscar cartão salvo                      |
| DELETE | `/card/:id`                   | ✅    | 100/min  | Remover cartão (detach Stripe + soft delete) |

**Rate limiting**: 100 req/min default, 5 req/min em `/auth/session` e `/auth/create`. Webhooks são `@SkipThrottle()`. Em 429, mostrar toast pedindo para aguardar.

> **Gaps anteriores — resolvidos pelo backend** (commit `8bc3c5e`, 13/05/2026):
> - ✅ `GET /tasks/:id` agora existe — usar em todas as telas de detalhe (em vez de cachear de `/tasks/fetch`). Response inclui `payment` como objeto embarcado, útil para tratar fluxo 3DS.
> - ✅ `POST /tasks/create` agora retorna `{ id }` — permite `router.push` imediato para o detalhe.
> - ✅ `POST /tasks/validate` aceita `{ rating?: 1-5, comment?: string(max 500) }` — avaliação integrada à validação.
> - ✅ `DELETE /card/:id` para remover cartão.
> - ✅ `DELETE /auth/account` para exclusão de conta.
> - ✅ `GET /tasks/active` para listar tarefas ativas do usuário (substitui a heurística sobre `/auth/transaction-history`).
>
> **Gap remanescente**:
> - Estados `accepted` e `on_the_way` continuam **órfãos no enum** (nenhum use-case escreve neles). Confirmada a **Opção A**: UI ignora esses estados e segue 5 estados reais (`available`, `in_progress`, `verification_required`, `completed`, `canceled` + `payout_failed` derivado de webhook).

---

## 4. Modelo de dados

Tipos a serem definidos em `src/types/`.

### 4.1 SessionPayload

Conteúdo do JWT. Fonte de verdade para UI sem round-trip.

```ts
type UserType = 'CLIENT' | 'PROXY'
type DocumentType = 'RG' | 'CPF' | 'CNPJ'

interface SessionPayload {
  sub: string                // user ID
  email: string
  name: string
  avatarUrl: string | null
  phoneNumber: string
  stripeAccountId: string | null
  stripeCustomerId: string | null
  userType: UserType
  documentType: DocumentType | null
  documentUrl: string | null
  isVerified: boolean
  rating: number             // 0–5
  totalTasksCompleted: number
  totalTasksCreated: number
  walletBalance: number
  termsAccepted: boolean
}
```

### 4.2 Task

```ts
type TaskStatus =
  | 'available' | 'accepted' | 'on_the_way'
  | 'in_progress' | 'verification_required'
  | 'completed' | 'canceled'

interface Task {
  id: string
  title: string
  description: string
  locationLat: number
  locationLng: number
  locationAddress: string
  offeredPrice: number
  proxyEarnings: number | null
  platformFee: number | null
  status: TaskStatus
  proofImageUrl: string | null
  startedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  createdAt: string
  owner: string              // userId
  ownerId?: Pick<SessionPayload, 'id' | 'name' | 'email' | 'phoneNumber' | 'avatarUrl' | 'rating' | 'isVerified' | 'totalTasksCompleted' | 'totalTasksCreated'>
}
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
| `PriceBreakdown`      | `amount`                                                               | Tabela de valor + taxa plataforma + taxa Stripe + total           |
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
- Após cadastro ou login com sucesso, salvar token em SecureStore e navegar para `/(app)` com `router.replace()`.
- Em 401, limpar storage e ir para `/(auth)/sign-in`.

### 7.2 Ciclo de vida da tarefa

Versão pragmática que **segue o backend atual** (sem estados intermediários `accepted` / `on_the_way`):

```
┌──────────┐                                              ┌───────────┐
│available │── Proxy clica "Aceitar e iniciar" ──────────▶│in_progress│
└──────────┘                                              └─────┬─────┘
                                                                │
                        Proxy envia foto de prova (até 1h)      │
                                                                ▼
                                                        ┌───────────────────────┐
                                                        │verification_required  │
                                                        └────────┬──────────────┘
                           Cliente "Validar e pagar"              │
                                                                  ▼
                                                        ┌───────────┐
                                                        │completed  │
                                                        └───────────┘
                                                              │
                              webhook payout.failed (rev. transfer + débito wallet)
                                                              ▼
                                                       ┌───────────────┐
                                                       │payout_failed  │
                                                       └───────────────┘

Cancelamento: disponível OU in_progress (até 1h de início) → canceled (via Cliente)
Reversão via dispute: webhook charge.dispute.created → debita wallet do proxy se já validada
```

**Decisão do MVP** (Opção A confirmada): seguir os estados reais que o backend escreve — `available`, `in_progress`, `verification_required`, `completed`, `canceled`, `payout_failed`. Os estados `accepted` e `on_the_way` do enum **não são suportados** pela API e devem ser ignorados na UI.

### 7.3 Fluxo de pagamento

1. **Cliente cria tarefa** → `POST /tasks/create` com `cardDetails.savedCard` (stripeCardId) ou `cardDetails.token`. Backend cria a tarefa em `available` e retorna `{ id }`.
2. **Proxy aceita** → `POST /tasks/start` → backend cobra o cliente via Stripe PaymentIntent **imediatamente**, mas o valor fica retido na plataforma (não transfere ainda).
   - Resposta possível 1: `{ status: 'succeeded' }` — pagamento ok, task vira `in_progress`.
   - Resposta possível 2: `{ status: 'requires_action', clientSecret }` — 3DS necessário. Frontend deve confirmar via `@stripe/stripe-react-native` (`confirmPayment`). O `payment` row já existe como `pending` e webhook `payment_intent.succeeded` finaliza. Frontend pode consultar via `GET /tasks/:id` (response embarca `payment`).
3. **Proxy finaliza** → `POST /tasks/finish` com foto → task vira `verification_required`.
4. **Cliente valida** → `POST /tasks/validate` com `{ taskId, rating?, comment? }` → backend:
   - Cria `stripe.transfers.create` para a Connect account do Proxy.
   - Persiste `transferId`, `proxyEarnings`, `platformFee` na task.
   - Credita `walletBalance` do proxy.
   - Insere rating na tabela `Ratings` (se enviado) e recomputa `Users.rating` (média).
   - Erro `PROXY_ACCOUNT_NOT_READY` (409) se o proxy não tem `stripeAccountReady`.
5. **Cancelamento** (Cliente, até 1h após `startedAt`) → `POST /tasks/cancel` → backend refunda via Stripe e task vira `canceled`.

**Estados terminais por webhook**:
- `charge.dispute.created` (cliente abre disputa pós-validação) → debita `walletBalance` do proxy automaticamente.
- `payout.failed` (Stripe não conseguiu pagar o proxy) → reverte transfer, debita wallet, decrementa contador, task vira `payout_failed`.

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
| Telefone           | ✅           | (11) 99999-0000          | Máscara                                           |
| Senha              | ✅           | Mínimo 8 caracteres      | `type=password`, mínimo 8                         |
| Tipo de documento  | ✅           | CPF / CNPJ (toggle)      | Altera máscara do próximo campo                   |
| Documento          | ✅           | 000.000.000-00           | Máscara dinâmica                                  |
| Foto do documento  | ✅ (Proxy)   | "Foto do documento (frente)" | Upload via `expo-image-picker`, faz upload separado e armazena URL |
| Termos             | ✅           | "Li e aceito os **Termos de Uso** e a **Política de Privacidade**." | Checkbox |

**Copy**:
- Botão: `Criar minha conta`
- Erro de termos: toast `Aceite os termos para continuar.`
- Erro de foto (Proxy): toast `Envie a foto do seu documento.`
- Sucesso: toast `Conta criada! Bem-vindo ao Proxy.`

**API**: `POST /auth/create`

Request body:
```ts
{
  name, email, password, userType,
  phoneNumber, documentType, documentUrl?,
  termsAccepted: true
}
```
Response: `{ session: string }` (JWT)

Erros tratados:
- `USER_EMAIL_EXISTS` → toast "Um usuário com este email já existe."
- `STANDARD_ERROR` → toast da mensagem.

**Componentes**: `ScreenHeader`, `FormInput`, toggles de documento, `PhotoUploader`, checkbox, `Button`.

**Navegação**: sucesso → salvar JWT → `router.replace('/(app)')`.

**Edge cases**:
- Upload do documento falhar → manter em memória, permitir retry.
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
Response: `{ session: string }`

Erros:
- `USER_NOT_FOUND` → toast da mensagem.
- `USER_INVALID_CREDENTIALS` → toast "Credenciais fornecidas são inválidas."

**Navegação**: sucesso → `router.replace('/(app)')`. "Esqueci a senha" → `/(auth)/forgot-password`. "Criar conta" → `/(auth)/choose-profile`.

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
- Validação local: iguais e >= 6 chars (backend mínimo).
- API: `POST /auth/reset-password { email, code, newPassword }` → `{ message }`

**Toast OK (final)**: `Senha alterada! Faça login.` → redireciona `/(auth)/sign-in`.

**Edge cases**:
- Erro `PASSWORD_RESET_TOO_MANY_REQUESTS` → toast orientando esperar.
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

**API**: `GET /tasks/fetch?city=<city>&page=1` → array de tarefas (10 por página).

**Estados**:
- Loading (3 skeletons)
- Empty (tarefas vazias ou filtro sem match)
- Populado (lista com distância — **calcular localmente** entre `locationLat/Lng` da tarefa e localização do usuário via `expo-location`).

**Navegação**: Saldo → `/wallet`. TaskCard → `/tasks/[id]`.

**Edge cases**:
- Permissão de localização negada → não mostrar distância, só endereço.
- Paginação: scroll infinito (próxima página quando chega no fim da lista).

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
| Cidade       | Toggle SP / RJ / BH               | obrigatório     |
| Endereço     | Rua, número — bairro              | obrigatório     |
| Data         | (picker nativo)                   | obrigatório, ≥ hoje |
| Hora         | (picker nativo)                   | obrigatório     |
| Valor        | 0,00 (prefixo "R$")               | ≥ R$ 10,00      |

Hints: "Seja claro e direto." / "Detalhes ajudam o Proxy a entender o serviço." / "Mínimo R$ 10,00"

**Passo 2 — Pagamento**:
- Resumo da tarefa (card não editável)
- Seleção de cartão salvo OU "+ Adicionar cartão" (abre modal de cartões)
- Breakdown (`PriceBreakdown`):
  - Valor oferecido: R$ X
  - Taxa da plataforma (20%): R$ Y
  - Taxa Stripe (3,99% + R$ 0,39): R$ Z
  - **Total a pagar: R$ W**
- Disclaimer: "O valor fica retido com segurança e só é repassado ao Proxy quando você validar a conclusão."
- Botões: "Voltar" / "Publicar tarefa".

**API**: `POST /tasks/create`

Request:
```ts
{
  title, description,
  address: { city, state, street, zipCode, locationLat, locationLng },
  pricing: { offeredPrice },
  cardDetails: { savedCard: stripeCardId } // ou { token }
}
```

> **Gap de UX**: backend espera `state` e `zipCode`, e `locationLat/Lng`. O protótipo não coletava — precisa decidir: (a) acrescentar campos na UI, (b) hardcodar state por cidade + usar `expo-location` para lat/lng aproximado, (c) integrar geocoder. **MVP**: (b), com state fixo por cidade e usar localização atual como lat/lng.

**Erros**:
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
5. Seção de foto de prova (se `proofImageUrl`).
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
- Proxy aceitar: `POST /tasks/start { taskId }` → response `{ status: 'succeeded' | 'requires_action', clientSecret? }`.
  - `succeeded`: toast OK e refetch.
  - `requires_action`: chamar `confirmPayment(clientSecret)` do `@stripe/stripe-react-native`. Em caso de sucesso, fazer poll de `GET /tasks/:id` até `payment.status === 'succeeded'` (ou aguardar webhook).
  - Toasts OK: `Tarefa aceita! Boa execução.`
  - Erros: `CANNOT_START_OWN_TASK`, `USER_NOT_PROXY`, `TASK_NOT_AVAILABLE`, `PAYMENT_FAILED`.
- Cliente validar: `POST /tasks/validate { taskId, rating?, comment? }` → toast OK `Pagamento liberado. Obrigado!`.
  - Erros: `CANNOT_VALIDATE_TASK`, `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `PROXY_ACCOUNT_NOT_READY` (409 — informar o cliente que o pagamento ao proxy não foi possível agora), `TRANSFER_FAILED`.
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
- Botão "Enviar e finalizar" (disabled até foto).

**API**: `POST /tasks/finish` (multipart/form-data)

Request:
```
fields:
  taskId: string
files:
  photo: <jpg|png|webp>
```

Erros:
- `FILE_FORMAT_NOT_SUPPORTED` → toast.
- `TASK_STARTED_AT_NOT_VALID` → toast.
- `CANNOT_FINISH_TASK` → toast.

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
- `POST /card/create { token }` → o app precisa **tokenizar o cartão** com `@stripe/stripe-react-native` (`createPaymentMethod`) e enviar o token. **MVP**: usar `<CardField>` do `@stripe/stripe-react-native` ao invés de form manual.
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
- Em andamento: `GET /tasks/active` (owner OU executor).
- Concluídas / Canceladas: `GET /auth/transaction-history` → juntar `tasksCreated` + `tasksCompleted` e filtrar por status no cliente.

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
3. Seção **Conta**: Editar perfil, Documentos (badge "Verificado" se aplicável), Segurança.
4. Seção **Mais**: Termos e Privacidade, Sair, **Excluir conta** (destrutivo).
5. Rodapé: "Proxy v1.0.0 — feito no Brasil 🇧🇷".
6. `BottomTabBar`.

**Editar perfil**: tela secundária com form → `POST /auth/update-profile` → devolve novo JWT → atualizar SecureStore.

**Sair**: confirmar em alert → limpar SecureStore → `router.replace('/')`.

**Excluir conta**:
- Alert duplo de confirmação ("Tem certeza? Esta ação não pode ser desfeita.").
- `DELETE /auth/account` → backend faz soft delete (anonimiza PII e seta `isDeleted=true`).
- Erro `USER_HAS_ACTIVE_TASKS` (409) → toast "Não é possível excluir a conta: existem tarefas em andamento." e abrir o histórico.
- Sucesso → limpar SecureStore → `router.replace('/')`.

**Copy**:
- Títulos de seção: "Conta", "Mais".
- "Verificado" (badge em Documentos).
- "Sair" em vermelho.
- "Excluir conta" em vermelho.

**APIs**:
- `POST /auth/update-profile { name, userType, avatarUrl?, password?, phoneNumber? }` → `{ session: string }`.
- `DELETE /auth/account` → 204 No Content.

**Edge cases**:
- Trocar de `userType` manualmente não está no MVP (remover opção "trocar para Proxy/Cliente" do protótipo — no backend é um campo real, não um modo).
- Documentos de Proxy: se `isVerified === false`, badge "Pendente".

---

## 9. Próximos passos

### 9.1 Gaps remanescentes
1. **Estados `accepted` / `on_the_way`** — continuam órfãos no enum do backend. Decisão **mantida (Opção A)**: ignorar na UI.
2. **3DS no `POST /tasks/start`**: o backend pode retornar `requires_action`. O app precisa implementar o fluxo de `confirmPayment` com `@stripe/stripe-react-native` — não é opcional se quisermos aceitar cartões com 3DS habilitado (a maioria dos cartões brasileiros).
3. **Geocoding** para `POST /tasks/create`: backend exige `state`, `zipCode`, `lat`, `lng`. Decidir entre form manual ou integração com geocoder (ex.: `expo-location` + Google Geocoding).
4. **Push notifications** (futuro, não MVP): "Sua tarefa foi aceita", "Aguardando validação", "Pagamento liberado".

### 9.2 Ordem sugerida de implementação
1. Estrutura de rotas + layouts + guard de auth + SecureStore.
2. Cliente HTTP + interceptor de erros + tratamento de 401/429.
3. Auth (Splash, Escolher perfil, Cadastro, Login, Recuperar senha).
4. Cartões (com `@stripe/stripe-react-native`) — pré-requisito para criar tarefa.
5. Home Cliente + Criar tarefa (happy path, sem 3DS).
6. Home Proxy + Detalhe de tarefa (`GET /tasks/:id`) + Start (com 3DS).
7. Finalizar tarefa (foto via `expo-image-picker`) + Validar (cliente, com rating).
8. Carteira + Stripe Connect onboarding.
9. Histórico + Perfil + exclusão de conta.
10. Polish: skeletons, animações Reanimated, haptics, deep links, refetch via webhook (poll após ações).

### 9.3 Decisões em aberto
- Biblioteca de toast: `sonner-native` (recomendado, idiomático React) vs `burnt` (mais nativo).
- Data fetching: `@tanstack/react-query` **fortemente recomendado** — caching, retry exponencial em 429, invalidação por chave após mutations.
- Tokenização de cartão: **`@stripe/stripe-react-native`** (SDK oficial — necessário também para 3DS).
- Geolocalização: `expo-location` para distância na lista do Proxy; decidir geocoder ainda.
- Push notifications (futuro): `expo-notifications` + deep link `proxyapp://tasks/:id`.
