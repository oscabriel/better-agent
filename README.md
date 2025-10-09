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

### Architecture

#### Layered Architecture Overview

Better Chat follows a **Clean Architecture** pattern with clear separation of concerns across five distinct layers: oRPC router layer, service layer, repository layer, infrastructure layer, and domain layer.

#### Data Flow: AI Chat Completion

Here's how an AI chat completion flows through all layers, demonstrating the full power of the layered architecture:

```
1. Frontend Request
   └─ POST /api/ai/ with messages and conversationId
      ↓

2. HTTP Router Layer (/api/http/ai-routes.ts)
   ├─ Validates authentication (requireUserDO)
   ├─ Parses request body
   └─ Calls AI completion service
      ↓

3. Service Layer (/services/ai/completion-service.ts)
   ├─ Validates incoming messages
   ├─ Loads user settings (model, API keys, MCP servers)
   ├─ Checks usage quotas
   ├─ Resolves AI provider and creates model registry
   ├─ Connects to MCP servers and loads tools
   ├─ Builds system prompt with available tools
   ├─ Streams AI response with tool calling
   ├─ Saves conversation messages to DO
   ├─ Generates conversation title
   ├─ Records usage statistics
   └─ Closes MCP connections
      ↓

4. Repository Layer
   ├─ Settings Repository: Gets user preferences and API keys
   ├─ Conversation Repository: Saves messages to user's DO
   ├─ Usage Repository: Records token usage in D1
   └─ MCP Repository: Manages custom MCP server configs
      ↓

5. Infrastructure Layer
   ├─ D1 Database: User settings, usage tracking
   ├─ Durable Objects: Per-user conversation storage
   ├─ AI Providers: OpenAI, Anthropic, Google APIs
   ├─ MCP Servers: External tool providers
   └─ Encryption: API key security
      ↓

6. Domain Layer
   ├─ Message types and validation
   ├─ Usage limits and quota rules
   ├─ Model definitions and capabilities
   └─ Business constraints
      ↓

7. Streaming Response
   └─ Frontend receives real-time AI response with tool calls
```

**Note**: While the AI completion uses an HTTP router layer (`/api/http/ai-routes.ts`) for streaming responses, most operations in Better Chat use the oRPC router layer for type-safe API calls. For example, updating user settings would flow through:

```
1. Frontend: api.settings.update({ theme: "dark" })
2. oRPC Router: Validates input, checks auth via protectedProcedure, extracts userId
3. Service Layer: Orchestrates business logic
4. Repository Layer: Queries database
5. Infrastructure Layer: Database connections
6. Domain Layer: Business rules
7. Response: Typed response back to frontend
```

The service layer remains unchanged regardless of the API layer used, demonstrating how the architecture allows different API patterns while maintaining consistent business logic.

#### Why This Architecture?

There's many benefits to adopting Clean Architecture, including separation of concerns, scalability, data security, and flexibility to swap things out within a layer, but honestly the main reason I've chosen this (technically more complex) route is that I've found Clean Architecture to be incredibly LLM-friendly.

The clean boundaries between concerns makes it very easy for an LLM to reason about your codebase, understand the data flows involved, and pinpoint exactly where changes need to be made within a layer without sacrificing everything that's already working in other layers. Defining clear interfaces, creating well-named functions and classes, and establishing consistent, repeatable patterns all do wonders for telling an LLM to model a new feature or make a very specific business logic tweak.

Obviously, there's downsides to CA, too. Keeping the over-engineering in check and trying to make sure the LLM doesn't lose focus when making changes across multiple layers are clear challenges. But for whatever reason, I've found CA to be easy to read and reason about myself, too, which means I have a better chance of following along as the LLM works. So even as this app has gotten more complex, I've been able to hang onto the reins and understand the direction we're going the whole way. 

#### Database Architecture

- **D1 (SQLite)**: Shared/global data (auth, usage quotas, user settings)
- **Durable Objects SQLite**: Per-user isolated storage (conversations, messages)
- **Per-User Isolation**: Each user gets their own Durable Object instance with dedicated SQLite database
- **Cloudflare Workers**: Edge-native serverless runtime
- **Better Auth**: Email OTP and social authentication (Google, GitHub)
- **KV Sessions**: Distributed session storage with rate limiting

### User Features
- **Chat Management**: Create, view, and manage conversations with persistent history
- **API Key Management**: Securely store encrypted BYOK API keys
- **Usage Tracking**: Monitor token usage and quotas across models
- **Customizable Settings**: Configure models, providers, MCP servers, and appearance preferences
- **Profile Management**: Account settings, session management, and deletion

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

## Environment Setup

Create stage-specific environment files:
- `.env.dev` (development)
- `.env.prod` (production)

Required variables: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`, `API_ENCRYPTION_KEY`, and provider-specific API keys.

See `.env.example` files in root and app directories for complete configuration.

## License

MIT