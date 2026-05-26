# Product Thesis

## Better Chat → Better Agent

Better Chat was built in an earlier agent landscape: the dominant mental model was still “chat with a frontier model,” with MCP servers as the main visible advancement in capability.

The modern landscape is different. Agents now have:

- tools;
- MCP servers;
- skills;
- shell/file/browser access;
- subagents;
- memory;
- background task loops;
- scheduled work;
- local and cloud execution environments;
- multiple client surfaces;
- persistent state.

But many products have responded by building “do anything everywhere” agents that are risky, noisy, difficult to configure, and socially invasive.

Better Agent should evolve differently.

## The thesis

> Better Agent is a web-first orchestration product for creating focused, scoped, durable agents inside **Thinkspaces**.

A Thinkspace is a bounded environment for serious thinking work. It has a purpose, sources, memory, tools, capabilities, tasks, artifacts, and a dedicated agent configured for that scope.

The Better Agent coordinator helps the user create and manage these Thinkspaces. It does not pretend to be a singular all-knowing AI companion.

## What Better Agent is

Better Agent is:

- a web-native agent cockpit;
- a coordinator/orchestrator;
- a creator of bespoke Thinkspace agents;
- a system for deep research and project understanding;
- a home for inspectable, pruneable, scoped memory;
- a tool for planning before implementation;
- a way to monitor bounded situations with bounded tools;
- a bridge to local machines, accounts, notes, and coding agents through explicit grants;
- a product that helps humans be better citizens of the web.

## What Better Agent is not

Better Agent is not:

- Jarvis;
- a “do anything” agent;
- a singular unified AI entity with a “soul”;
- a social media bot;
- an autonomous pest that opens issues, PRs, comments, or messages people without careful human intent;
- a replacement for specialized coding agents;
- a giant global memory store of everything the user has ever said or done;
- a local-machine-first harness that assumes broad filesystem/shell access;
- a multi-channel messaging gateway whose main achievement is living everywhere.

## Target user

Better Agent is for people doing thoughtful, open-ended, project-shaped work:

- researchers;
- technical founders;
- product thinkers;
- maintainers;
- homelab operators;
- software-adjacent builders;
- architects;
- strategists;
- writers of PRDs, ADRs, plans, briefs, and runbooks;
- people who want AI help forming richer understanding before acting.

It can serve builders, but its center of gravity is not “write code for me.” It is more:

> “Help me think through this deeply, accumulate understanding, monitor the right signals, and prepare high-quality next actions or handoffs.”

## Core positioning

Better Agent sits between chat apps, coding agents, and everywhere-agents:

| Category                    | Center                   | Strength                                     | Weakness                                              |
| --------------------------- | ------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| ChatGPT / Claude web        | chat                     | broad conversation                           | weak project scoping and durable tool use             |
| OpenClaw                    | local gateway + channels | lives everywhere                             | difficult setup, large blast radius, social pest risk |
| Hermes Agent                | technical harness        | self-improving agent workflows               | technical setup and broad runtime complexity          |
| OpenCode / Claude Code      | terminal/repo            | code implementation                          | repo/local-machine-centric                            |
| Devin / cloud coding agents | cloud dev env            | autonomous coding tasks                      | coding silo and opaque autonomy                       |
| **Better Agent**            | **web Thinkspaces**      | **deep project thinking with scoped agents** | intentionally not “do everything everywhere”          |

## Product promise

> Create a Thinkspace, grant only what it needs, and build durable understanding with a focused agent that helps you think, research, plan, monitor, and hand off work responsibly.
