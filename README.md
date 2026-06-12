# Better Agent

> WIP. Better-Agent is the successor to [better-chat](https://github.com/oscabriel/better-chat).

Better Agent is a web-native system for creating scoped agents that do durable project thinking, like research, planning, monitoring, with you. Instead of a chat window, you compose a **Thinkspace**: a bounded environment with one **Goal**, its own references, memory, skills, and permissions, and a dedicated agent. You set it up, let it rip, and come back to review the output and continue to iterate until you consider the goal to be completed.

## Purpose

The product is architected around the idea that, while agents are cheap and infinitely parallelizable, your human attention and judgement are a scarce, serial resource. So Better Agent paces and batches agent output through a cross-Thinkspace **Review Queue** rather than encouraging you to spawn and watch more agents burn tokens. It is deliberately not an orchestration dashboard. See `CONTEXT.md` for the full domain model and `PRODUCT.md` for design principles.

## Background

Better Agent evolves from Better Chat's codebase lineage but replaces the chat-first model with Thinkspaces. The agent runtime is built on **[Cloudflare's Project Think](https://github.com/cloudflare/think)** (`@cloudflare/think`)—Durable Object-backed agent loops, session storage, recovery, and tool execution—with one durable Agent per Thinkspace (see `.agents/docs/adr/0006`). The rest of the stack: Cloudflare Workers, Hono + oRPC, Better Auth, Drizzle/D1, TanStack Start, and [Alchemy](https://alchemy.run) for IaC, organized as a Turborepo monorepo (`apps/web`, `apps/server`, `packages/*`).

## Local development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev  # web + server managed via alchemy.run
```

Other useful scripts: `bun run check-types`, `bun run check` / `bun run fix` (Ultracite lint/format), `bun run db:studio:local`, and `bun run deploy` (Alchemy).
