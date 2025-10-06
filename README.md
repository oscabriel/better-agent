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
- **Dual-Database Design**:
  - **D1 (SQLite)**: Shared/global data (auth, usage quotas)
  - **Durable Objects SQLite**: Per-user isolated storage (conversations, messages, settings, MCP servers)
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