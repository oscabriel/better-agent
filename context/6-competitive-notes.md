# Competitive Notes

These notes summarize product lessons from the current agent landscape.

## OpenClaw

OpenClaw is a local-first, multi-channel personal assistant gateway.

Strengths:

- lives across many channels;
- powerful local tool access;
- skills and workspace model;
- memory files;
- browser, shell, filesystem, cron, nodes;
- multi-agent/session routing.

Problems and lessons:

- markets itself as broadly useful but has a deeply technical setup;
- setup can involve gateway auth, ports, local daemons, channel credentials, model tokens, config files, sandboxing, secrets, and pairing;
- non-technical users can misconfigure it;
- broad local access can leak secrets or expose too much filesystem/shell capability;
- messaging-channel access can make the agent a social pest if misused;
- “lives everywhere” increases the blast radius;
- security often depends on the operator understanding sandboxing, tool policy, DM policy, secrets, and channel pairing.

Better Agent response:

- live in the web by default;
- touch external surfaces only through explicit Thinkspace grants;
- avoid messaging/social channels as a core primitive;
- scope memory/tools per Thinkspace;
- make permission/audit visible in UI;
- help humans act responsibly rather than automate noisy behavior.

## Hermes Agent

Hermes is a technical agent harness with strong support for tools, MCP, skills, memory, cron, and multiple execution backends.

Strengths:

- aimed more honestly at technical users;
- rich tools and toolsets;
- self-improving skill loop;
- memory/session search;
- scheduled automations;
- multiple execution backends such as local, Docker, SSH, Modal, Daytona, Vercel Sandbox;
- MCP client/server support.

Lessons:

- skills are procedural memory;
- memory and workflow learning are core agent capabilities;
- technical users value explicit configuration;
- broad harness complexity is powerful but intimidating.

Better Agent response:

- adopt the value of skills and memory;
- avoid requiring users to configure a whole harness upfront;
- configure capabilities one Thinkspace at a time;
- make the web UI the main control plane.

## OpenCode / Claude Code / Codex CLI

Coding agents are strongest when they live near the codebase and terminal.

Strengths:

- filesystem access;
- shell execution;
- repo context;
- subagents;
- LSP/code search;
- MCP;
- test/build loops;
- implementation velocity.

Limits:

- repo/local-machine-centric;
- not ideal for broad research, project imagination, monitoring, or durable cross-project thinking;
- often optimized for implementation rather than pre-implementation understanding;
- can still create low-quality automated PRs/issues/comments if used carelessly.

Better Agent response:

- do not compete directly as the best coding agent;
- specialize in upstream and downstream work:
  - research;
  - planning;
  - architecture;
  - product shaping;
  - monitoring;
  - memory;
  - handoffs;
  - issue/PRD/ADR drafting;
- offload implementation to local coding agents through structured handoffs.

## ChatGPT / Claude web apps

Web chat apps are easy to understand and accessible.

Strengths:

- low-friction web UX;
- broad model capabilities;
- familiar chat metaphor;
- file uploads and some connectors;
- non-technical users understand them.

Limits:

- weak project scoping;
- memory can be opaque;
- tools/connectors are often too global;
- long-running project context gets buried in chats;
- not designed as a durable work environment.

Better Agent response:

- keep web-first accessibility;
- replace generic chat threads with Thinkspaces;
- make memory and tools scoped and inspectable;
- provide durable tasks/artifacts/audit.

## Devin / cloud coding agents

Cloud coding agents demonstrate long-running autonomous work.

Strengths:

- async tasks;
- cloud environments;
- implementation autonomy;
- can work while user is away.

Limits:

- coding-focused;
- often opaque;
- can be expensive;
- less about collaborative thinking and more about task execution.

Better Agent response:

- use durable task patterns;
- stay transparent and inspectable;
- emphasize thinking, research, monitoring, and handoff over opaque implementation.

## Market opening

There is room for a product that is:

- more durable and agentic than web chat;
- safer and more scoped than everywhere-agents;
- more web-native than terminal agents;
- more thoughtful than autonomous task bots;
- more project-centered than generic assistants.

That product is Better Agent.
