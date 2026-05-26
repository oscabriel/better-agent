# Proposed Architecture

Better Agent should evolve from a request-scoped chat app into a Cloudflare-native agent orchestration system.

The key architectural shift:

```txt
Before:
  Web request owns the chat turn.
  Durable Object stores chat history.

After:
  Thinkspace agent owns the durable runtime.
  Web app is the control plane and primary client.
```

## Current Better Chat architecture

Current Better Chat has:

- React/Vite web app;
- Hono API Worker;
- oRPC for typed product APIs;
- Better Auth;
- D1 for auth/settings/usage/MCP configs;
- KV for session storage;
- a per-user Durable Object for conversation/message storage;
- AI SDK `streamText` called directly from `/api/ai`;
- MCP and web search tools assembled per request.

This architecture is simple and functional, but the Durable Object is mostly storage. It does not own the agent loop.

## Target Better Agent architecture

Better Agent should use Cloudflare Agents SDK and Project Think to make Durable Objects the active agent runtime.

```txt
apps/web
  Web cockpit:
    Thinkspaces
    Tasks
    Memory
    Sources
    Capabilities
    Approvals
    Audit
    Artifacts

apps/server
  Hono/oRPC product APIs
  Auth and account management
  Agents SDK routing
  Webhooks and connector APIs

Durable Objects / Agents
  CoordinatorAgent
  ThinkspaceAgent
  TaskAgent (later)
  LocalNodeConnectionAgent (later)

Storage
  D1: indexes, auth, settings, grants, account metadata, audit index
  Durable Object SQLite: agent state, messages, task state, tool runs
  R2: artifacts, uploads, exported files, larger source snapshots
  Vectorize / SQLite FTS: memory and source retrieval
```

## Agent roles

### CoordinatorAgent

The coordinator is the global product assistant.

It should stay thin.

Responsibilities:

- help create Thinkspaces;
- ask setup questions;
- suggest capabilities;
- route users to existing Thinkspaces;
- explain product state;
- manage global preferences;
- avoid becoming a giant all-purpose memory agent.

It is an orchestrator, not Jarvis.

### ThinkspaceAgent

The ThinkspaceAgent is the main runtime.

Likely implemented with Project Think:

```ts
class ThinkspaceAgent extends Think<Env, State, Props> {
  getModel() {}
  getSystemPrompt() {}
  getTools() {}
  configureSession(session) {}
  beforeToolCall() {}
  afterToolCall() {}
}
```

Responsibilities:

- own the interactive stream;
- maintain Thinkspace memory;
- use scoped capabilities;
- run bounded tasks;
- produce artifacts;
- request approvals;
- maintain audit trail;
- prepare handoffs to local coding agents.

### TaskAgent

May be introduced later for long-running or scheduled work.

Responsibilities:

- durable background task execution;
- status/progress;
- retries;
- scheduled monitoring;
- final reports;
- approvals.

Initially, tasks can live inside ThinkspaceAgent state.

### LocalNodeConnectionAgent

May be introduced later to manage local machine connections.

Responsibilities:

- node pairing;
- heartbeat;
- capability manifest;
- tool-call routing;
- secure execution channel;
- availability state.

## Data model sketch

### D1

D1 should store product-level indexes and authorization metadata:

```txt
users
user_settings
thinkspaces
thinkspace_memberships
capability_grants
connected_accounts
local_nodes
task_index
artifact_index
audit_event_index
usage_events
```

### Durable Object SQLite

Each ThinkspaceAgent can store runtime-local state:

```txt
messages
agent_state
memory_entries
task_runs
tool_runs
approval_requests
source_refs
session_snapshots
```

Project Think already provides useful durable runtime primitives around messages, streams, sessions, workspace, and recovery.

### R2

Use R2 for larger durable artifacts:

- uploaded documents;
- generated briefs;
- source bundles;
- exported audit logs;
- local-node snapshots;
- handoff packages.

## Tool architecture

Tools should be capability-governed.

A ThinkspaceAgent should not simply receive every tool the user has ever configured.

Tool assembly should follow:

```txt
Workspace goal
  + active capability grants
  + current approval policy
  + agent role
  + task context
  => available tools for this turn
```

Project Think hooks such as `beforeToolCall` and `afterToolCall` are important seams for policy enforcement and audit logging.

## Local node architecture

Better Agent should live in the web. Local machines should be optional capability providers.

```txt
Better Agent Cloud
  ThinkspaceAgent
  Capability broker
  Approval/audit layer

Secure channel / Tailscale / outbound tunnel

Better Node
  filesystem roots
  shell profiles
  local MCP stdio servers
  Obsidian vaults
  browser profiles
  homelab access
```

The local node exposes a manifest of capabilities. Thinkspaces request grants to specific capabilities.

The user should never grant “my whole machine.” They grant things like:

- read/search this folder;
- run this allowlisted command profile;
- access this local MCP server;
- index this Obsidian vault folder.

## Handoff architecture

Better Agent should integrate with specialized local coding agents instead of trying to replace them.

Possible handoff targets:

- OpenCode;
- Claude Code;
- Codex CLI;
- Pi;
- custom local harnesses.

A handoff artifact could include:

```txt
Goal
Context summary
Relevant files/sources
Constraints
Decisions
Implementation plan
Acceptance criteria
Suggested first task
```

The Thinkspace keeps the “why”; the coding agent performs the implementation.
