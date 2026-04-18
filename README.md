# Proxy App

App mobile do **Proxy** — marketplace de serviços que conecta clientes que precisam resolver tarefas a proxies que as executam. Construído com Expo e React Native, consome a API [proxy-api](https://github.com/) (NestJS).

## Stack

- [Expo](https://expo.dev) SDK 54 · React Native 0.81 · React 19
- TypeScript (strict)
- [NativeWind](https://www.nativewind.dev) 4 (Tailwind CSS para React Native)
- ESLint + Prettier

## Pré-requisitos

- Node.js 20+
- npm
- [Expo Go](https://expo.dev/go) no celular (iOS/Android) **ou** simulador iOS / emulador Android configurados

## Começando

```bash
# 1. Instale as dependências
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env
# edite .env com a URL do backend na sua rede

# 3. Rode o dev server
npm start
```

Abra o QR code no Expo Go (celular) ou use `i` / `a` no terminal para iOS / Android simulador.

## Variáveis de ambiente

| Variável | Descrição | Exemplo |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | URL base da API proxy-api | `http://192.168.2.93:3333` |

> O prefixo `EXPO_PUBLIC_` é obrigatório para variáveis acessíveis no runtime do app.

## Scripts

```bash
npm start              # Dev server Expo
npm run ios            # Abre no simulador iOS
npm run android        # Abre no emulador Android
npm run web            # Preview web
npm run lint           # ESLint
npm run lint:fix       # ESLint com auto-fix
npm run format         # Prettier
npm run type-check     # tsc --noEmit
```

## Estrutura

```
proxy-app/
├── App.tsx              # Entry point
├── global.css           # Tailwind base
├── tailwind.config.js   # Design tokens
├── babel.config.js      # Babel + NativeWind
├── metro.config.js      # Metro + NativeWind
└── src/                 # (a evoluir) screens, components, lib, types
```

## Design system

Tokens definidos em [tailwind.config.js](./tailwind.config.js) — paleta principal em verde-escuro com acento lima, cores específicas para os estados de tarefa (`status-available`, `status-accepted`, `status-onway`, `status-progress`, `status-validating`, `status-done`, `status-cancelled`).

Todo conteúdo do app é em **português do Brasil** e valores monetários em **BRL** (`R$ 1.234,56`).

## Backend

Este app consome a API [proxy-api](../proxy-api) (NestJS + Prisma + PostgreSQL + Stripe). Autenticação via JWT RS256 (Bearer token). Veja a documentação do backend para o contrato completo dos endpoints.
