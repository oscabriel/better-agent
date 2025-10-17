# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better-chat is an AI chat application built with a functional, feature-based architecture, featuring multi-model support, MCP (Model Context Protocol) integration, and user-specific chat history. The architecture uses Cloudflare Workers with Durable Objects for per-user data isolation and D1 for shared data.

## Development Commands

### Build & Type Checking
- `bun build` — Build all workspaces
- `bun typecheck` — TypeScript checks across all apps
- `bun check` — Run Biome format + lint
- `bun check:unsafe` — Run Biome with unsafe auto-fixes

### Database Operations (run from root)
- `bun db:push` — Push schema changes to D1 database
- `bun db:migrate` — Run D1 migrations
- `bun db:generate` — Generate Drizzle migration files for D1
- `bun db:studio` — Open Drizzle Studio for D1 (dev stage)
- `cd apps/server && bun do:generate` — Generate Durable Object migrations

### Deployment (Alchemy)
- `bun a:dev` — Start all apps in development mode with Alchemy (uses `.env.dev` files)
- `bun a:deploy` — Deploy to production with Alchemy (uses `.env.prod` files)
- `bun a:destroy` — Destroy production deployment
- `bun a:dev:destroy` — Destroy development deployment
- `bun a:clean` — Remove all `.alchemy` directories

### Individual App Development
- `bun dev:web` — Start web app only (runs on port 3001)
- `bun dev:server` — Start server only (runs on port 3000)
- `bun vite:dev` — Run both apps with Turbo (without Alchemy)

**IMPORTANT:** Do NOT start the dev server unless explicitly requested. Database operations and code changes do not require running servers.

## Architecture & Key Concepts

### Functional Feature-Based Architecture

Better Chat uses a **functional, feature-based architecture** with clear separation between routes, business logic, and data access. Each feature is self-contained with a consistent structure, making it easy to locate and modify code.

#### Standard Feature Structure

```
features/[feature]/
  ├── routes.ts      # API routes (thin, validation only)
  ├── handlers.ts    # Business logic orchestration (optional)
  ├── queries.ts     # Database reads
  ├── mutations.ts   # Database writes
  ├── utils.ts       # Pure utility functions
  ├── types.ts       # TypeScript types
  └── constants.ts   # Constants (optional)
```

#### Architecture Principles

1. **100% Functional** — No classes, only pure functions
2. **Thin Routes** — Routes validate input, call handlers, return response
3. **Separation of Concerns** — Clear split between reads (queries) and writes (mutations)
4. **Feature Colocation** — All related code lives together in one feature directory
5. **Consistent Naming** — Same file names across all features

#### Example: Settings Feature

```typescript
// routes.ts (thin API layer)
export const settingsRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    return await getUserSettings(context.session.user.id);
  }),
  update: protectedProcedure.input(schema).handler(async ({ context, input }) => {
    return await updateUserSettings(context.session.user.id, input);
  }),
};

// queries.ts (read operations)
export async function getUserSettings(userId: string) {
  // DB read logic
}

// mutations.ts (write operations)
export async function updateUserSettings(userId: string, updates) {
  // DB write logic
}

// utils.ts (pure helpers)
export function parseJson<T>(value, fallback) {
  // Pure function
}
```

#### Data Flow Example: AI Chat Completion

```
1. Frontend Request
   └─ POST /api/ai/ with messages and conversationId
      ↓

2. Routes Layer (features/ai/routes.ts)
   ├─ Validates authentication (requireUserDO)
   ├─ Parses request body (Zod schema)
   └─ Calls streamCompletion(userId, stub, body)
      ↓

3. Handler Layer (features/ai/handlers.ts)
   ├─ validateIncomingMessages() — validates messages
   ├─ getUserSettings() — loads user preferences
   ├─ requireAvailableQuota() — checks usage limits
   ├─ resolveModelProvider() — determines provider
   ├─ createUserProviderRegistry() — sets up AI SDK
   ├─ getCustomMcpServers() — fetches MCP configs
   ├─ getMCPTools() — connects to MCP servers
   ├─ buildSystemPrompt() — constructs prompt
   ├─ streamText() — streams AI response
   ├─ onFinish:
   │   ├─ userDOStub.appendMessages() — saves to DO
   │   ├─ maybeGenerateConversationTitle() — auto-title
   │   ├─ closeMCPClients() — cleanup
   │   └─ recordUsage() — tracks tokens
   └─ Returns streaming response
      ↓

4. Data Layer
   ├─ settings/queries.ts: getUserSettings() → D1
   ├─ usage/mutations.ts: recordUsage() → D1
   ├─ tools/mcp/queries.ts: getCustomMcpServers() → D1
   └─ DO: appendMessages(), listMessages() → per-user SQLite
      ↓

5. Infrastructure
   ├─ D1: Settings, usage tracking, MCP configs
   ├─ Durable Objects: Per-user conversation storage
   ├─ AI Providers: OpenAI, Anthropic, Google APIs
   ├─ MCP Servers: External tool providers
   └─ Crypto: API key encryption (crypto.ts)
```

**Key Patterns:**

- **Thin Routes** — Routes are <50 lines, just validation + handler call
- **Handler Functions** — Pure functions that orchestrate operations
- **Queries vs Mutations** — Clear read/write separation
- **Per-User Isolation** — Each user's data in their own Durable Object
- **Feature Colocation** — All AI logic in `features/ai/`

### Dual-Database Architecture

This project uses **two separate databases** with different purposes:

1. **D1 (Central Database)** — `apps/server/src/db/d1/`
   - **Purpose:** Shared/global data (auth, usage quotas, user settings, custom MCP servers)
   - **Schema:** `apps/server/src/db/d1/schema/` (auth.ts, usage.ts, settings.ts)
   - **Migrations:** `apps/server/src/db/d1/migrations/`
   - **Accessed via:** Feature queries/mutations (e.g., `settings/queries.ts`, `usage/mutations.ts`)

2. **Durable Object SQLite (Per-User Database)** — `apps/server/src/db/do/`
   - **Purpose:** User-specific data (conversations, messages)
   - **Schema:** `apps/server/src/db/do/schema/chat.ts`
   - **Migrations:** `apps/server/src/db/do/migrations/`
   - **Accessed via:** `UserDurableObject` instance
   - **Helper:** `apps/server/src/db/do/get-user-stub.ts` provides `getUserStub()` for DO access

### Per-User Durable Objects

- Each user's chat data lives in their own Durable Object instance with its own SQLite database
- User is identified via `getUserStub()` in `apps/server/src/db/do/get-user-stub.ts`
- All chat operations go through the DO stub (e.g., `stub.appendMessages()`, `stub.listMessages()`)
- DO migrations run automatically on first access per instance
- Data is completely isolated between users

### Authentication & Sessions

- **Better Auth** for authentication (`apps/server/src/lib/auth.ts`)
- Email OTP plugin enabled (OTPs log to console in dev mode)
- Sessions stored in Cloudflare KV (`SESSION_KV` binding)
- Social providers: Google, GitHub
- Auth routes: `/api/auth/*`
- Session validation: `apps/server/src/lib/auth-guards.ts` (`requireUserDO`, `requireUserId`)

### API & Routing Structure

- **Server entry:** `apps/server/src/index.ts`
- **oRPC Setup:**
  - Server procedures: `apps/server/src/lib/orpc.ts` (defines `publicProcedure`, `protectedProcedure`)
  - Router aggregation: `apps/server/src/lib/router.ts` (exports `appRouter`)
  - Web client: `apps/web/src/lib/orpc.ts` (creates typed client with TanStack Query utils)
- **Context Creation:** `apps/server/src/lib/context.ts` provides request context (session, env, DO stubs)
- **AI Integration:** Uses Vercel AI SDK v5
  - Multiple providers: Anthropic, OpenAI, Google
  - Streaming via `streamText()` with `smoothStream()` for better UX
  - Extended thinking/reasoning mode support
  - Tool calling for MCP integration

### MCP (Model Context Protocol)

- Built-in MCP servers: `apps/server/src/features/tools/mcp/catalog.ts`
- Custom MCP servers: Stored in D1 via `features/tools/mcp/queries.ts` and `mutations.ts`
- MCP client connections: `features/tools/mcp/client.ts`
- Tools exposed to AI models during chat interactions
- Server management UI: `apps/web/src/routes/settings/tools.tsx`

### Frontend Structure

- **React 19** with TanStack Router (`apps/web/`)
- **File-based routing:** Route files in `apps/web/src/routes/`
  - `__root.tsx` — Root layout
  - `index.tsx` — Home page
  - `chat/route.tsx` — Chat layout
  - `chat/$chatId.tsx` — Individual chat view
  - `settings/` — Settings pages (appearance, models, providers, tools, usage, profile)
- **oRPC Client:** `apps/web/src/lib/orpc.ts` provides typed API client
- **Key Hooks:**
  - `apps/web/src/hooks/use-user-settings.ts` — User preferences
  - `apps/web/src/hooks/use-mcp-servers.ts` — MCP server management
  - `apps/web/src/routes/chat/-hooks/use-chat-model-selector.ts` — Model selection
- **Chat Components:** `apps/web/src/routes/chat/-components/`
  - `chat-shell.tsx` — Main chat interface
  - `message-renderer.tsx` — Displays messages with markdown, code blocks, reasoning
  - `model-selector.tsx` — Model picker UI
  - `tool-call-block.tsx` — Displays MCP tool invocations
  - `reasoning-block.tsx` — Shows AI reasoning steps
  - `code-block.tsx` — Syntax-highlighted code with copy button
- **shadcn/ui** components in `apps/web/src/components/ui/`
- **Markdown rendering:** react-markdown with remark-gfm, shiki for syntax highlighting

## Environment Configuration

### Multi-Stage Setup (Alchemy)

- **Stage variable:** `ALCHEMY_STAGE` (defaults to `dev`)
- **Dev:** Uses `.env.dev`, `apps/web/.env.dev`, `apps/server/.env.dev`
- **Prod:** Uses `.env.prod`, `apps/web/.env.prod`, `apps/server/.env.prod`
- **Config file:** `alchemy.run.ts` loads stage-specific env files

### Required Environment Variables

See `.env.example` files in root and app directories. Key variables:

- **Auth:** `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`
- **API encryption:** `API_ENCRYPTION_KEY` (for BYOK storage in DO)
- **Email:** `RESEND_API_KEY` (production only)
- **Social auth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- **AI providers:** `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`
- **Alchemy:** `VITE_SERVER_URL`, `VITE_WEB_URL`, `CUSTOM_WEB_DOMAIN`, `API_ROUTE_PATTERN`

### Cloudflare Workers Bindings

Configured in `alchemy.run.ts`:
- `DB` — D1 database instance
- `SESSION_KV` — KV namespace for sessions
- `USER_DO` — Durable Object namespace for per-user storage

## Code Style & Conventions

- **TypeScript** with 2-space indentation, no semicolons (Biome-enforced)
- **Naming:**
  - `camelCase` for variables/functions
  - `PascalCase` for React components/types
  - `kebab-case` for filenames
- **Exports:** Prefer named exports; default exports only for pages/routes
- **Components:** Co-locate by feature; server-only code stays in `apps/server/`
- **Architecture Rules:**
  - Routes → thin, validation only
  - Handlers → business logic orchestration
  - Queries → database reads only
  - Mutations → database writes only
  - Utils → pure functions

### Database Workflows

- **D1 schema changes:**
  1. Edit schema in `apps/server/src/db/d1/schema/`
  2. Run `bun db:generate` to create migration
  3. Run `bun db:migrate` to apply migration
  4. Migration files in `apps/server/src/db/d1/migrations/`

- **DO schema changes:**
  1. Edit schema in `apps/server/src/db/do/schema/chat.ts`
  2. Run `cd apps/server && bun do:generate` to create migration
  3. Migrations run automatically on DO access
  4. Migration files in `apps/server/src/db/do/migrations/`

## Testing & Quality

- Type-safety and integration testing prioritized over unit tests
- If adding tests, use Vitest (`*.test.ts` or `*.test.tsx` beside sources)
- **Minimum PR requirements:**
  - `bun typecheck` must pass
  - `bun check` must pass

## Commit & PR Guidelines

- **Conventional Commits:** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- PRs must include:
  - Clear scope/summary
  - Linked issues (`Closes #123`)
  - Screenshots for UI changes
  - Notes on env/DB schema changes

## Security Notes

- Do not commit secrets; use stage-specific env files
- API keys for BYOK are encrypted in DO storage using `API_ENCRYPTION_KEY`
- In dev mode, OTP codes log to console (treat logs as sensitive)
- Encryption utilities in `apps/server/src/lib/crypto.ts`

## Key Files Reference

### Configuration
- **Alchemy config:** `alchemy.run.ts`
- **TypeScript:** `tsconfig.json` (root), per-app configs
- **Biome:** `biome.json`

### Server Architecture
- **Entry point:** `apps/server/src/index.ts`
- **oRPC setup:** `apps/server/src/lib/orpc.ts` (defines `publicProcedure`, `protectedProcedure`)
- **Router aggregation:** `apps/server/src/lib/router.ts` (exports `appRouter` with: `chat`, `mcp`, `models`, `usage`, `settings`, `profile`)
- **Context:** `apps/server/src/lib/context.ts`
- **Auth:** `apps/server/src/lib/auth.ts`
- **Auth guards:** `apps/server/src/lib/auth-guards.ts` (`requireUserDO`, `requireUserId`)
- **DO helper:** `apps/server/src/db/do/get-user-stub.ts`
- **DO class:** `apps/server/src/db/do/user-durable-object.ts`

### Database
- **D1 schema:** `apps/server/src/db/d1/schema/`
- **D1 migrations:** `apps/server/src/db/d1/migrations/`
- **DO schema:** `apps/server/src/db/do/schema/chat.ts`
- **DO migrations:** `apps/server/src/db/do/migrations/`

### Features (following standard pattern)
Each feature follows the functional pattern: routes.ts (thin API), handlers.ts (business logic), queries.ts (reads), mutations.ts (writes), utils.ts (helpers), types.ts

- **AI:** `apps/server/src/features/ai/` (routes, handlers, messages, prompts, types)
- **Chat:** `apps/server/src/features/chat/` (routes, types)
- **Models:** `apps/server/src/features/models/` (routes, catalog, utils, providers, types)
- **Profile:** `apps/server/src/features/profile/` (routes)
- **Settings:** `apps/server/src/features/settings/` (routes, queries, mutations, utils, types)
- **Tools/MCP:** `apps/server/src/features/tools/mcp/` (routes, queries, mutations, utils, client, catalog, types)
- **Usage:** `apps/server/src/features/usage/` (routes, handlers, queries, mutations, types)

### Frontend
- **oRPC client:** `apps/web/src/lib/orpc.ts`
- **Auth client:** `apps/web/src/lib/auth-client.ts`
- **Routes:** `apps/web/src/routes/`
- **Components:** `apps/web/src/components/` and `apps/web/src/routes/[route]/-components/`