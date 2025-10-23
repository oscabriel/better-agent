# Better Chat

A modern AI chat application with multi-model support, MCP integration, and per-user data isolation using Cloudflare Workers and Durable Objects.

## Features

### Multi-Model Support
- **Free Models**: GPT-4o mini, GPT-4.1 mini/nano, Gemini 2.5 Flash Lite
- **BYOK (Bring Your Own Key) Models**:
  - OpenAI: GPT-4o, GPT-4.1, GPT-5, o3/o4-mini, o3, o3-pro
  - Anthropic: Claude Opus 4, Sonnet 4.5/4/3.7, Haiku 3.5
  - Google: Gemini 2.5 Flash/Pro
- **Advanced AI Capabilities**: Streaming responses, extended thinking/reasoning mode, tool calling, vision/image support

### MCP (Model Context Protocol) Integration
- Built-in MCP servers with enable/disable controls
- Custom MCP server support (HTTP/SSE)
- MCP tools exposed to AI models during conversations
- Visual tool call rendering with results

### User Features
- **Chat Management**: Create, view, and manage conversations with persistent history
- **API Key Management**: Securely store encrypted BYOK API keys
- **Usage Tracking**: Monitor token usage and quotas across models
- **Customizable Settings**: Configure models, providers, MCP servers, and appearance preferences
- **Profile Management**: Account settings, session management, and deletion

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

**Architecture Principles:**
- **100% Functional** — No classes, only pure functions
- **Thin Routes** — Routes validate input, call handlers, return response
- **Query/Mutation Split** — Clear separation between reads and writes
- **Feature Colocation** — All related code lives together in one feature directory
- **Consistent Naming** — Same file names across all features

#### Data Flow: AI Chat Completion

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
   │   ├─ maybeGenerateConversationTitle() — create title
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
   └─ Crypto: API key encryption
```

**Example: Updating User Settings**

Most operations use oRPC for type-safe API calls:

```
1. Frontend: api.settings.update({ theme: "dark" })
2. Routes: settingsRouter.update validates input via Zod schema
3. Handlers: updateUserSettings(userId, input) orchestrates logic
4. Mutations: Writes updated settings to D1 database
5. Response: Typed response back to frontend via oRPC
```

#### Why This Architecture?

Benefits of functional feature-based architecture:
- **Simplicity**: No layers, classes, or abstractions — just functions
- **Predictability**: Same structure across all features
- **Discoverability**: Need usage logic? Check `features/usage/`
- **Maintainability**: Changes isolated to one feature directory
- **LLM-Friendly**: Clear boundaries, consistent patterns, easy to reason about
- **Performance**: Thin routes and pure functions optimize cold starts

This architecture strikes a balance: structured enough to scale, simple enough to understand quickly. Features are self-documenting through consistent file naming, making it easy for both humans and LLMs to navigate the codebase and make targeted changes without unintended side effects. 

#### Database Architecture

- **D1 (SQLite)**: Shared/global data (auth, usage quotas, user settings)
- **Durable Objects SQLite**: Per-user isolated storage (conversations, messages)
- **Per-User Isolation**: Each user gets their own Durable Object instance with dedicated SQLite database
- **Cloudflare Workers**: Edge-native serverless runtime
- **Better Auth**: Email OTP and social authentication (Google, GitHub)
- **KV Sessions**: Distributed session storage with rate limiting

## Tech Stack

### Frontend
- **React 19** with React Server Components support
- **TanStack Router** for file-based routing
- **TanStack Query** for data fetching and caching
- **oRPC** for type-safe API calls
- **Tailwind CSS 4** for styling
- **shadcn/ui** for UI components
- **Vercel AI SDK** for streaming AI responses
- **React Markdown** with syntax highlighting (Shiki)

### Backend
- **Cloudflare Workers** for serverless compute
- **Hono** for HTTP routing
- **oRPC** for type-safe RPC
- **Drizzle ORM** for database operations
- **Better Auth** for authentication
- **Vercel AI SDK** for AI provider integration
- **Resend** for email delivery (production)

### Infrastructure
- **Cloudflare D1**: Central SQLite database
- **Cloudflare Durable Objects**: Per-user stateful storage
- **Cloudflare KV**: Session and cache storage
- **Alchemy**: Multi-stage deployment and orchestration

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed development instructions, architecture documentation, and code conventions.

### Quick Start

```bash
# Install dependencies
bun install

# Start development environment (uses .env.dev)
bun a:dev

# Individual apps
bun dev:web     # Web app only (port 3001)
bun dev:server  # Server only (port 3000)
```

### Database Management

```bash
# D1 (Central Database)
bun db:generate  # Generate migrations
bun db:migrate   # Run migrations
bun db:push      # Push schema changes
bun db:studio    # Open Drizzle Studio (dev)

# Durable Objects (Per-User Database)
cd apps/server && bun do:generate  # Generate DO migrations
```

### Deployment

```bash
# Deploy to production (uses .env.prod)
bun a:deploy

# Destroy deployment
bun a:destroy
```

## CI/CD

Automated deployment via GitHub Actions on push to `main` or `staging` branches.

### Branch-Based Deployment

- **main** → production environment (`prod` stage)
- **staging** → staging environment (`staging` stage)

### Required GitHub Configuration

**Environment Variables** (Settings → Secrets and variables → Actions → Variables):
- `VITE_SERVER_URL` - Server URL (e.g., `https://chat.oscargabriel.dev`)
- `VITE_WEB_URL` - Web app URL (e.g., `https://chat.oscargabriel.dev`)
- `CUSTOM_WEB_DOMAIN` - Custom domain (e.g., `chat.oscargabriel.dev`)
- `CORS_ORIGIN` - CORS origin (e.g., `https://chat.oscargabriel.dev`)
- `BETTER_AUTH_URL` - Auth URL (e.g., `https://chat.oscargabriel.dev`)
- `API_ROUTE_PATTERN` - API route pattern (e.g., `chat.oscargabriel.dev/api/*`)

**Secrets** (Settings → Secrets and variables → Actions → Secrets):
- `ALCHEMY_PASSWORD` - Alchemy state encryption password
- `ALCHEMY_STATE_TOKEN` - Alchemy state token
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_EMAIL` - Cloudflare account email
- `BETTER_AUTH_SECRET` - Better Auth secret key
- `API_ENCRYPTION_KEY` - User API key encryption key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GH_CLIENT_ID` - GitHub OAuth client ID
- `GH_CLIENT_SECRET` - GitHub OAuth client secret
- `RESEND_API_KEY` - Resend email API key
- `OPENAI_API_KEY` - OpenAI API key (for free models)
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI API key (for free models)

**Environment Setup** (Settings → Environments):
- Create `production` environment
- Create `staging` environment (if using staging branch)

### Workflow Details

`.github/workflows/deploy.yml`:
1. Triggers on push to `main` or `staging`
2. Creates stage-specific `.env` files from GitHub vars/secrets
3. Deploys via Alchemy CLI to Cloudflare
4. Prevents concurrent deployments with concurrency groups

## Environment Setup

Create stage-specific environment files:
- `.env.dev` (development)
- `.env.prod` (production)

Required variables: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`, `API_ENCRYPTION_KEY`, and provider-specific API keys.

See `.env.example` files in root and app directories for complete configuration.

## License

MIT