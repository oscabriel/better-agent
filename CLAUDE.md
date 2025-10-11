# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better-chat is an AI chat application built with a Clean Architecture pattern, featuring multi-model support, MCP (Model Context Protocol) integration, and user-specific chat history. The architecture uses Cloudflare Workers with Durable Objects for per-user data isolation and D1 for shared data.

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

### Clean Architecture (Layered Pattern)

Better Chat follows a **Clean Architecture** pattern with clear separation of concerns across five layers. This architecture is specifically chosen to be LLM-friendly—the clean boundaries make it easier to reason about data flows and pinpoint where changes need to be made.

#### The Five Layers

1. **API Layer** (`apps/server/src/api/`)
   - **oRPC Routers** (`api/orpc/`) — Type-safe RPC endpoints for most operations
     - `chat-router.ts` — Chat CRUD operations
     - `mcp-router.ts` — MCP server management
     - `models-router.ts` — Available models listing
     - `usage-router.ts` — Usage tracking and quotas
     - `user-settings-router.ts` — User preferences
     - `profile-router.ts` — Profile management
   - **HTTP Routes** (`api/http/`) — Direct HTTP endpoints for streaming
     - `ai-routes.ts` — AI streaming responses (cannot use oRPC due to streaming requirements)
   - **Purpose:** Request validation, authentication checks, input parsing
   - **Rules:** Never contains business logic; delegates to service layer

2. **Service Layer** (`apps/server/src/services/`)
   - **Purpose:** Business logic orchestration, workflow coordination
   - **Key Services:**
     - `ai/completion-service.ts` — Orchestrates full AI completion flow
     - `ai/message-service.ts` — Message validation and normalization
     - `ai/title-generation-service.ts` — Auto-generates conversation titles
     - `users/user-settings-service.ts` — User preferences management
     - `usage/usage-tracking-service.ts` — Token usage tracking
     - `mcp/mcp-client-service.ts` — MCP client connections
     - `providers/model-resolver.ts` — AI provider resolution
   - **Rules:** Coordinates repositories, enforces business rules, no direct database/API access

3. **Repository Layer** (`apps/server/src/repositories/`)
   - **Purpose:** Data access abstraction
   - **D1 Repositories** (`repositories/d1/`)
     - `settings-repository.ts` — User settings in D1
     - `usage-repository.ts` — Usage tracking in D1
     - `mcp-repository.ts` — Custom MCP servers in D1
   - **DO Repositories** (`repositories/do/`)
     - `conversation-repository.ts` — Per-user conversations in Durable Objects
   - **Rules:** Only layer that touches databases; returns domain entities

4. **Infrastructure Layer** (`apps/server/src/infra/`)
   - **Purpose:** External integrations, database connections, encryption
   - **Components:**
     - `db/` — D1 database setup and schema
     - `do/` — Durable Object implementation
     - `auth.ts` — Better Auth configuration
     - `crypto.ts` — API key encryption/decryption
     - `email.ts` — Email delivery (Resend)
   - **Rules:** Provides infrastructure primitives; no business logic

5. **Domain Layer** (`apps/server/src/domain/`)
   - **Purpose:** Core business entities, types, and validation rules
   - **Components:**
     - `models.ts` — Model definitions and capabilities
     - `conversations.ts` — Conversation types and validation
     - `usage.ts` — Usage limits and quota rules
     - `settings.ts` — User settings types
     - `mcp.ts` — MCP server definitions
     - `ui-messages.ts` — Message types for UI
   - **Rules:** Pure TypeScript; no external dependencies; framework-agnostic

#### Data Flow Example: AI Chat Completion

```
1. Frontend Request
   └─ POST /api/ai/ with messages and conversationId
      ↓

2. API Layer (api/http/ai-routes.ts)
   ├─ Validates authentication (requireUserDO middleware)
   ├─ Parses request body
   └─ Calls AICompletionService.streamCompletion()
      ↓

3. Service Layer (services/ai/completion-service.ts)
   ├─ Validates incoming messages (message-service)
   ├─ Loads user settings (UserSettingsService)
   ├─ Checks usage quotas (UsageTrackingService)
   ├─ Resolves AI provider (model-resolver)
   ├─ Creates model registry (user-registry-factory)
   ├─ Connects to MCP servers (mcp-client-service)
   ├─ Builds system prompt (prompt-service)
   ├─ Streams AI response with tool calling
   ├─ Saves conversation (ConversationRepository)
   ├─ Generates title (title-generation-service)
   ├─ Records usage (UsageTrackingService)
   └─ Closes MCP connections
      ↓

4. Repository Layer
   ├─ SettingsRepository: Gets user preferences from D1
   ├─ ConversationRepository: Saves messages to user's DO
   ├─ UsageRepository: Records token usage in D1
   └─ McpRepository: Gets custom MCP configs from D1
      ↓

5. Infrastructure Layer
   ├─ D1: User settings, usage tracking
   ├─ Durable Objects: Per-user conversation storage
   ├─ AI Providers: OpenAI, Anthropic, Google APIs
   ├─ MCP Servers: External tool providers
   └─ Encryption: API key security
      ↓

6. Domain Layer
   ├─ Message validation and types
   ├─ Usage limits and quotas
   ├─ Model definitions
   └─ Business constraints
      ↓

7. Streaming Response
   └─ Frontend receives real-time AI response with tool calls
```

**Key Architectural Patterns:**

- **oRPC vs HTTP Routes:** Most operations use oRPC for type safety. Only streaming AI responses use direct HTTP routes since oRPC cannot handle streaming.
- **Service Layer Independence:** Services don't know if they're called from oRPC or HTTP—they have the same interface regardless.
- **Per-User Isolation:** Each user's chat data lives in their own Durable Object with isolated SQLite storage.
- **Repository Abstraction:** Swapping D1 for another database would only require changing the repository layer.

### Dual-Database Architecture

This project uses **two separate databases** with different purposes:

1. **D1 (Central Database)** — `apps/server/src/infra/db/`
   - **Purpose:** Shared/global data (auth, usage quotas, user settings, custom MCP servers)
   - **Schema:** `apps/server/src/infra/db/schema/` (auth.ts, usage.ts, settings.ts)
   - **Migrations:** `apps/server/src/infra/db/migrations/`
   - **Accessed via:** Repository layer (D1 repositories)

2. **Durable Object SQLite (Per-User Database)** — `apps/server/src/infra/do/`
   - **Purpose:** User-specific data (conversations, messages)
   - **Schema:** `apps/server/src/infra/do/schema/chat.ts`
   - **Migrations:** `apps/server/src/infra/do/migrations/`
   - **Accessed via:** Durable Object instance in `user-durable-object.ts`
   - **Key Classes:**
     - `UserDurableObject` — Main DO class with per-user SQLite storage
     - Each user gets their own isolated DO instance and database
   - **Helper:** `apps/server/src/infra/do/user-do-helper.ts` provides `getUserStub()` for DO access

### Per-User Durable Objects

- Each user's chat data lives in their own Durable Object instance with its own SQLite database
- User is identified via `getUserStub()` in `apps/server/src/infra/do/user-do-helper.ts`
- All chat operations go through the DO via `ConversationRepository`
- DO migrations run automatically on first access per instance
- Data is completely isolated between users

### Authentication & Sessions

- **Better Auth** for authentication (`apps/server/src/infra/auth.ts`)
- Email OTP plugin enabled (OTPs log to console in dev mode)
- Sessions stored in Cloudflare KV (`SESSION_KV` binding)
- Social providers: Google, GitHub
- Auth routes: `/api/auth/*`
- Session validation in service layer (`services/auth/session-guard.ts`)

### API & Routing Structure

- **Server entry:** `apps/server/src/index.ts`
- **oRPC Setup:**
  - Server procedures: `apps/server/src/lib/orpc.ts` (defines `publicProcedure`, `protectedProcedure`)
  - Router aggregation: `apps/server/src/api/orpc/index.ts` (exports `appRouter`)
  - Web client: `apps/web/src/lib/orpc.ts` (creates typed client with TanStack Query utils)
- **Context Creation:** `apps/server/src/lib/context.ts` provides request context (session, env, DO stubs)
- **AI Integration:** Uses Vercel AI SDK v5
  - Multiple providers: Anthropic, OpenAI, Google, DeepSeek
  - Streaming via `streamText()` with `smoothStream()` for better UX
  - Extended thinking/reasoning mode support
  - Tool calling for MCP integration

### MCP (Model Context Protocol)

- Built-in MCP servers managed in `apps/server/src/services/mcp/mcp-server-manager.ts`
- Custom MCP servers stored in D1 via `repositories/d1/mcp-repository.ts`
- MCP client connections in `services/mcp/mcp-client-service.ts`
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
- **Layered Architecture Rules:**
  - API layer → delegates to service layer
  - Service layer → coordinates repositories
  - Repository layer → only layer touching databases
  - Infrastructure layer → provides primitives
  - Domain layer → pure types and validation

### Database Workflows

- **D1 schema changes:**
  1. Edit schema in `apps/server/src/infra/db/schema/`
  2. Run `bun db:generate` to create migration
  3. Run `bun db:migrate` to apply migration
  4. Migration files in `apps/server/src/infra/db/migrations/`

- **DO schema changes:**
  1. Edit schema in `apps/server/src/infra/do/schema/chat.ts`
  2. Run `cd apps/server && bun do:generate` to create migration
  3. Migrations run automatically on DO access
  4. Migration files in `apps/server/src/infra/do/migrations/`

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
- Encryption utilities in `apps/server/src/infra/crypto.ts`

## Key Files Reference

### Configuration
- **Alchemy config:** `alchemy.run.ts`
- **TypeScript:** `tsconfig.json` (root), per-app configs
- **Biome:** `biome.json`

### Server Architecture
- **Entry point:** `apps/server/src/index.ts`
- **oRPC setup:** `apps/server/src/lib/orpc.ts`
- **Context:** `apps/server/src/lib/context.ts`
- **Auth:** `apps/server/src/infra/auth.ts`
- **DO helper:** `apps/server/src/infra/do/user-do-helper.ts`
- **DO class:** `apps/server/src/infra/do/user-durable-object.ts`

### Database
- **D1 schema:** `apps/server/src/infra/db/schema/`
- **D1 migrations:** `apps/server/src/infra/db/migrations/`
- **DO schema:** `apps/server/src/infra/do/schema/chat.ts`
- **DO migrations:** `apps/server/src/infra/do/migrations/`

### Frontend
- **oRPC client:** `apps/web/src/lib/orpc.ts`
- **Auth client:** `apps/web/src/lib/auth-client.ts`
- **Routes:** `apps/web/src/routes/`
- **Components:** `apps/web/src/components/` and `apps/web/src/routes/[route]/-components/`
