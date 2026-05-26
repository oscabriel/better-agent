# Roadmap

This roadmap is a product and architecture direction, not a committed implementation plan.

## Phase 0 — Preserve Better Chat while adding context

Goal: keep the existing app stable while documenting the Better Agent direction.

Tasks:

- keep current Better Chat routes and AI streaming path;
- document product thesis and architecture;
- identify reusable modules:
  - auth;
  - model registry;
  - BYOK keys;
  - MCP server management;
  - usage tracking;
  - web search;
  - chat rendering;
  - tool-call rendering.

## Phase 1 — Introduce Thinkspace model

Goal: add the product primitive before replacing the runtime.

Features:

- D1 `thinkspaces` table;
- create/list/archive Thinkspaces;
- Thinkspace goal/instructions;
- Thinkspace source list;
- Thinkspace memory records;
- Thinkspace artifacts;
- Thinkspace capability grants, initially simple;
- UI: Thinkspace dashboard.

This can initially use the current AI route, but organized around Thinkspaces instead of generic chats.

## Phase 2 — Project Think runtime experiment

Goal: prove Cloudflare Agents SDK / Project Think as the durable runtime.

Features:

- add `agents` and `@cloudflare/think`;
- create `ThinkspaceAgent extends Think`;
- one Durable Object per Thinkspace or per active Thinkspace session;
- route web client to ThinkspaceAgent;
- preserve existing model registry and BYOK settings;
- feed existing MCP/web search tools through Thinkspace-scoped tool assembly;
- use Think hooks for audit and policy:
  - `beforeToolCall`;
  - `afterToolCall`;
  - `onStepFinish`;
  - `onChatError`;
- compare Think streaming/recovery with existing AI SDK endpoint.

Success criteria:

- durable streaming works;
- messages persist in agent runtime;
- tool calls are visible;
- Thinkspace-scoped tools work;
- interrupted sessions can recover or resume better than current flow.

## Phase 3 — Capability grants and approval UX

Goal: make scoped permissions a first-class feature.

Features:

- capability grant data model;
- grant UI per Thinkspace;
- read/draft/ask/allow permission levels;
- approval requests;
- approval timeline;
- policy checks in `beforeToolCall`;
- audit events;
- external action previews.

Initial capabilities:

- web search;
- built-in MCP docs servers;
- custom MCP HTTP servers;
- GitHub read-only or draft issue mode;
- cloud workspace artifacts.

## Phase 4 — Inspectable Thinkspace memory

Goal: make memory a user-governed artifact.

Features:

- memory dashboard;
- canonical summary;
- decisions;
- assumptions;
- open questions;
- source notes;
- proposed memories;
- edit/delete/promote/archive memory actions;
- memory search;
- source-linked memory where possible.

Default:

- memory is Thinkspace-scoped;
- global memory is thin and explicit;
- promotion to global requires user approval.

## Phase 5 — Tasks and monitoring

Goal: support work that persists beyond a chat turn.

Features:

- task objects inside Thinkspaces;
- task statuses:
  - queued;
  - running;
  - waiting for approval;
  - completed;
  - failed;
  - canceled;
- task timeline;
- final reports/artifacts;
- scheduled monitoring tasks;
- bounded signals/sources;
- daily/weekly digests inside Thinkspace.

Examples:

- monitor Cloudflare Agents SDK releases;
- watch GitHub issues in a repo;
- periodically summarize changes in a source set;
- maintain a living research brief.

## Phase 6 — Local node alpha

Goal: allow Thinkspaces to touch trusted machines through narrow grants.

Features:

- `better-agent node` package;
- login/pairing flow;
- node heartbeat;
- capability manifest;
- Tailscale-friendly or outbound connection mode;
- filesystem root read/search;
- local MCP stdio bridge;
- shell profile with command allowlist;
- approval for writes/shell;
- audit of local-node actions.

Non-goals initially:

- full machine access;
- unrestricted shell;
- arbitrary home-directory read;
- browser automation;
- social messaging;
- background local autonomy without clear grants.

## Phase 7 — Handoffs to coding agents

Goal: make Better Agent excellent at preparing implementation work for specialized agents.

Features:

- handoff artifact format;
- export to markdown;
- local node command to launch or prepare:
  - OpenCode;
  - Claude Code;
  - Codex CLI;
  - Pi;
- acceptance criteria generation;
- implementation slice planning;
- post-implementation review checklist.

Better Agent should preserve the project understanding and delegate code changes when appropriate.

## Phase 8 — Skills / procedures

Goal: let Thinkspaces accumulate procedural memory.

Features:

- workspace-scoped skills;
- skill editor;
- skill required capabilities;
- skill run history;
- skill proposal after repeated workflows;
- versioning;
- approval before use of new skill with elevated capabilities.

Skills should be practical runbooks, not personality modules.

## Phase 9 — Selective connected accounts

Goal: add useful external accounts without becoming a pest.

Likely candidates:

- GitHub;
- Cloudflare;
- Notion or Obsidian via local node;
- Linear;
- read-only docs/source feeds.

Avoid initially:

- social posting;
- email sending;
- Discord/Telegram/iMessage bots;
- broad Slack access;
- automated public comments.

## North star demo

A user creates a Thinkspace:

> “Reimagine Better Chat as Better Agent.”

The coordinator helps configure it with:

- repo source;
- Cloudflare Agents SDK research;
- OpenClaw/Hermes/OpenCode competitive sources;
- scoped GitHub draft issue access;
- no public posting;
- no local writes.

The Thinkspace agent:

- builds a research-backed product thesis;
- maintains decisions and open questions;
- drafts an architecture plan;
- proposes issues;
- asks before creating anything externally;
- prepares handoff packages for a coding agent.
