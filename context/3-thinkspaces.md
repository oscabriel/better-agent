# Thinkspaces

A **Thinkspace** is the central product primitive of Better Agent.

It is a bounded, durable environment for thinking through a project, question, monitoring task, research effort, plan, or adjacent-to-coding workflow with a focused AI agent.

## Definition

> A Thinkspace is a scoped project environment with its own purpose, sources, memory, tools, capabilities, tasks, artifacts, and dedicated agent.

The Thinkspace agent is not the whole Better Agent product. It is a bespoke agent created for that Thinkspace.

The Better Agent coordinator helps the user configure, inspect, modify, and eventually retire Thinkspaces.

## Why Thinkspaces?

Thinkspaces solve several problems in modern agent products:

1. **Context leakage** — project context stays in the project.
2. **Tool overreach** — each Thinkspace gets only the capabilities it needs.
3. **Memory sprawl** — memory is inspectable and scoped.
4. **Social pest behavior** — outbound actions are deliberate, not globally available.
5. **Cognitive overload** — users configure one bounded project at a time.
6. **Long-term value** — understanding compounds across sessions.

## Example Thinkspaces

- “Reimagine Better Chat as Better Agent”
- “Monitor Cloudflare Agents SDK and Project Think”
- “Research AI agent security and permission models”
- “Plan homelab observability improvements”
- “Prepare a PRD for a local-node feature”
- “Track upstream issues related to D1 and Durable Objects”
- “Design an Obsidian-based research workflow”
- “Compare OpenClaw, Hermes, OpenCode, and Pi”

## Thinkspace setup flow

Creating a Thinkspace should itself be a quick conversation with the coordinator agent.

The coordinator asks enough to configure a focused agent:

1. What is this Thinkspace about?
2. What outcome are you hoping for?
3. What should the agent be especially good at here?
4. What sources should it know about?
5. What tools or accounts does it need?
6. Should it be allowed to monitor anything over time?
7. What actions require approval?
8. What should it never do?

The output is a configured Thinkspace agent.

## Thinkspace contents

A Thinkspace should contain:

```txt
Thinkspace
  Goal
  Instructions
  Agent profile/config
  Sources
  Memory
  Tasks
  Artifacts
  Capabilities
  Approvals
  Audit events
  Handoffs
```

## Thinkspace memory

Each Thinkspace should have memory layers:

- **Canonical Summary** — current best understanding.
- **Decisions** — choices made and why.
- **Assumptions** — beliefs to revisit.
- **Open Questions** — unresolved questions.
- **Source Notes** — notes tied to source material.
- **Task History** — what the agent tried and found.
- **Proposed Memory** — pending memories for user approval.

## Thinkspace capabilities

Capabilities are granted per Thinkspace.

Examples:

```txt
Capability: GitHub
Scope: oscargabriel/better-chat
Access: read repo, read issues, draft issues
Approval required: create issue, comment, open PR
Denied: merge, delete branch, force push
```

```txt
Capability: Local Node Filesystem
Node: Oscar MacBook
Root: ~/Developer/projects/better-chat
Access: read/search only
Approval required: write/edit/delete
Denied: read outside root
```

```txt
Capability: Monitoring
Source: Cloudflare changelog + GitHub releases
Access: read only
Schedule: daily
Output: digest artifact in Thinkspace
Denied: posting externally
```

## Thinkspace agent identity

A Thinkspace agent can have a role, but not a soul.

Good:

> “You are the research agent for this Thinkspace. Your job is to compare agent security models and maintain a source-backed decision log.”

Bad:

> “You are Better Agent, Oscar’s lifelong companion, with a persistent personality and total memory.”

The agent is functional, scoped, and replaceable.

## Thinkspace lifecycle

Thinkspaces should be lifecycle-managed:

1. Created.
2. Configured.
3. Used interactively.
4. Given tasks.
5. Accumulates memory/artifacts.
6. Reviewed/pruned.
7. Archived or reactivated.

Archiving a Thinkspace should preserve artifacts and audit history while disabling active capabilities and scheduled work.
