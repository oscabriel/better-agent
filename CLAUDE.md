# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better-chat is an AI chat application built on Better-T-Stack, featuring multi-model support, MCP (Model Context Protocol) integration, and user-specific chat history. The architecture uses Cloudflare Workers with Durable Objects for per-user data isolation and D1 for shared data.

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
- `bun db:studio:prod` — Open Drizzle Studio for D1 (prod stage)
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

### Dual-Database Architecture
This project uses **two separate databases** with different purposes:

1. **D1 (Central Database)** — `apps/server/src/db/`
   - **Purpose:** Shared/global data (auth, usage quotas)
   - **Schema:** `apps/server/src/db/schema/` (auth.ts, usage.ts)
   - **Migrations:** `apps/server/src/db/migrations/`
   - **Config:** `drizzle.db.config.ts`
   - **Accessed via:** `db` from `apps/server/src/db/index.ts`

2. **Durable Object SQLite (Per-User Database)** — `apps/server/src/do/`
   - **Purpose:** User-specific data (conversations, messages, settings, MCP servers)
   - **Schema:** `apps/server/src/do/schema/chat.ts`
   - **Migrations:** `apps/server/src/do/migrations/`
   - **Config:** `drizzle.do.config.ts`
   - **Accessed via:** Durable Object instance in `user-durable-object.ts`
   - **Key Classes:**
     - `UserDurableObject` — Main DO class with per-user SQLite storage
     - Each user gets their own isolated DO instance and database

### Per-User Durable Objects
- Each user's chat data lives in their own Durable Object instance with its own SQLite database
- User is identified via `getUserStub()` in `apps/server/src/lib/do.ts`
- All chat operations (create conversation, send message, list chats) go through the DO
- DO migrations run automatically on first access per instance
- API keys are encrypted at rest in the DO using `crypto.ts` utilities

### Authentication & Sessions
- **Better Auth** for authentication (`apps/server/src/lib/auth.ts`)
- Email OTP plugin enabled (OTPs log to console in dev mode)
- Sessions stored in Cloudflare KV (`SESSION_KV` binding)
- Social providers: Google, GitHub
- Auth routes: `/api/auth/*`

### API & Routing Structure
- **Server entry:** `apps/server/src/index.ts`
- **Routes (Hono):** `apps/server/src/routes/` — Direct HTTP routes for streaming AI responses, chat operations, MCP management
  - `ai.ts` — AI model interactions and streaming
  - `chat.ts` — Chat CRUD operations (proxies to Durable Objects)
  - `mcp-management.ts` — MCP server management
  - `models.ts` — Available models listing
  - `usage.ts` — Usage tracking and quotas
  - `user-settings.ts` — User preferences
- **tRPC Routers:** `apps/server/src/routers/` (if used)
- **Web tRPC client:** `apps/web/src/utils/trpc.ts`
- **AI Integration:** Uses AI SDK v5 with Vercel AI package
  - Multiple providers: Anthropic, OpenAI, Google, DeepSeek
  - Streaming responses via `streamText()` from AI SDK
  - Extended thinking mode support for supported models

### MCP (Model Context Protocol)
- Built-in MCP servers configured in `apps/server/src/mcp/client.ts`
- Users can enable/disable built-in servers and add custom HTTP/SSE MCP servers
- MCP tools exposed to AI models during chat interactions
- Server management UI in web app (`apps/web/src/components/chat/mcp-servers-dialog.tsx`)

### Frontend Structure
- **React 19** with TanStack Router (`apps/web/`)
- **File-based routing:** Route files in `apps/web/src/routes/`
- **Chat components:** `apps/web/src/components/chat/`
  - `chat-shell.tsx` — Main chat interface
  - `message-renderer.tsx` — Displays messages with markdown, code blocks, reasoning
  - `model-selector.tsx` — Model picker UI
  - `tool-call-block.tsx` — Displays MCP tool invocations
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
- Auth: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`
- API encryption: `API_ENCRYPTION_KEY` (for BYOK storage)
- Email: `RESEND_API_KEY` (production only)
- Social auth: `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, etc.
- AI providers: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, etc.

## Code Style & Conventions

- **TypeScript** with 2-space indentation, no semicolons (Biome-enforced)
- **Naming:**
  - `camelCase` for variables/functions
  - `PascalCase` for React components/types
  - `kebab-case` for filenames
- **Exports:** Prefer named exports; default exports only for pages/routes
- **Components:** Co-locate by feature; server-only code stays in `apps/server/`
- **Database:**
  - D1 schema changes: edit schema → `bun db:generate` → `bun db:migrate`
  - DO schema changes: edit schema → `cd apps/server && bun do:generate` → migrations run automatically on DO access

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
- Cloudflare Workers bindings configured in `alchemy.run.ts`:
  - `DB` (D1), `SESSION_KV` (KV), `USER_DO` (Durable Object Namespace)

## Key Files Reference

- **Alchemy config:** `alchemy.run.ts`
- **Server index:** `apps/server/src/index.ts`
- **Auth setup:** `apps/server/src/lib/auth.ts`
- **DO class:** `apps/server/src/do/user-durable-object.ts`
- **DO helper:** `apps/server/src/lib/do.ts`
- **Web router:** `apps/web/src/routes/`
- **D1 schema:** `apps/server/src/db/schema/`
- **DO schema:** `apps/server/src/do/schema/chat.ts`
