# Principles

## 1. Better Agent is not Jarvis

Better Agent should not pretend to be one unified entity that knows everything, remembers everything, and acts everywhere.

It should not have a product-level “soul.”

It is a coordinator that helps users create focused agents for bounded work.

## 2. Thinkspaces over chats

Chats are ephemeral. Thinkspaces are durable.

A Thinkspace has:

- a purpose;
- scoped context;
- sources;
- memory;
- tools;
- permissions;
- tasks;
- artifacts;
- audit history;
- a dedicated agent.

The primary product primitive should be the Thinkspace, not the chat thread.

## 3. Scope creates trust

Agents become safer and more useful when they are constrained by purpose.

Most memory, tools, accounts, MCPs, skills, and local access should be scoped to a Thinkspace.

Global state should be thin.

## 4. Memory is inspectable, pruneable, and scoped

Memory should not be a mysterious hidden model state.

Users should be able to:

- see memory;
- edit memory;
- delete memory;
- reject proposed memory;
- move memory between Thinkspaces;
- promote rare memories to global context;
- inspect where memories came from.

## 5. Better Agent helps humans be good web citizens

Better Agent should not normalize automated pest behavior.

It should avoid:

- unsolicited social posts;
- automated GitHub issue spam;
- low-quality AI-generated PRs;
- bot comments in open source repos;
- automated outreach to humans;
- impersonation of the user without explicit review.

The product should help humans think and act better, not flood the web with agent output.

## 6. Draft before external action

External mutations should usually produce drafts, previews, or proposed changes first.

Examples:

- draft GitHub issues before creating them;
- propose comments before posting them;
- generate patches before writing them;
- produce runbooks before executing commands;
- ask before sending anything to another human.

## 7. Least capability by default

A new Thinkspace should start with minimal access.

Capabilities should be granted deliberately and narrowly:

- specific repo, not all GitHub;
- specific folder, not the whole filesystem;
- read-only first;
- write with approval;
- shell with command allowlists;
- scoped MCP servers;
- bounded account permissions.

## 8. Local nodes are capability providers, not the home of the agent

Better Agent lives in the web.

Trusted machines can be connected as local nodes, preferably through safe networking such as Tailscale or outbound tunnels.

A local node exposes named capabilities to a Thinkspace. The agent does not simply “get the laptop.”

## 9. Handoff over monopoly

Better Agent does not need to be the best coding agent.

It can prepare excellent handoffs for specialized local agents such as OpenCode, Claude Code, Codex, or Pi.

Better Agent’s strength is understanding, planning, monitoring, memory, and orchestration.

## 10. Audit is a user feature

Every meaningful action should be traceable:

- what the agent tried to do;
- which capability it used;
- what data it accessed;
- what was approved;
- what changed;
- what memory was created;
- what external systems were touched.

Audit should not be hidden as logs only developers read. It should be part of the product surface.
