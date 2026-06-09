# Product

## Register

product

## Users

Software engineers, OpenClaw users, and developers exploring Cloudflare Agents and project-level thinking tools. They want something more refined and focused than existing chat-with-AI surfaces. They open Better Agent to set up a Thinkspace around a specific Goal, configure it properly, and return later to review what the agent produced — not to watch it work in real time.

## Product Purpose

Better Agent gives one person's judgement more leverage by making agent delegation intentional rather than casual. Each Thinkspace has a bounded Goal, scoped Permissions, and its own Sources, Memory, Skills, and Artifacts. The product's job is clarity of purpose, ease of delegation, and intuitive results — not orchestration, not multitasking, not encouraging users to spin up more agents.

## Brand Personality

Precision. Intentionality. Grounded.

The voice is direct and specific, never promotional. It names what something does, not what it promises. It trusts the user to understand scope and tradeoffs without hand-holding or encouragement loops.

## Anti-references

- **Generic chat window with sidebar.** Better Agent is not a conversation list with a text input bar at the bottom. The input surface should feel like a full-page note or brief, not a chat prompt.
- **Complex dashboards with agent metrics.** No running-agent counts, no throughput graphs, no encouragement to scale up. Activity is not the value; reviewed outcomes are.
- **Zapier-style node graphs.** No visual pipelines, no drag-and-drop orchestration. Delegation is a single intentional act, not a wiring diagram.
- **Busy multi-panel layouts.** The user focuses on one Thinkspace at a time. Switching is discrete (tabs, sidebar), not simultaneous.

## Design Principles

1. **One surface, one purpose.** Every screen answers one question. The Thinkspace view shows the Goal and what the agent produced. The creation flow shapes intent. The Review Queue surfaces what needs judgement. No screen tries to do two jobs.
2. **Delegation is a composition act.** Creating a Thinkspace is writing a brief — choosing the Goal, attaching Sources, granting Permissions, enabling Skills. The product treats this as thoughtful composition, not a quick prompt.
3. **Discrete, not simultaneous.** Switching between Thinkspaces is a deliberate context change (tabs, sidebar), not a split view or a stream of interleaved activity. The user is in one place at a time.
4. **Show the work, not the worker.** Surface Goals, Artifacts, Memory, and the Audit Trail. Don't surface agent status, token counts, or execution metrics unless the user asks. The agent is infrastructure; the output is the product.
5. **Grounded in specifics.** Labels name what they do. Empty states explain what goes here and how to fill it. Errors say what happened and what to try. No aspirational copy, no abstraction for its own sake.

## Accessibility & Inclusion

WCAG AA as the floor. All interactive elements keyboard-navigable with visible focus indicators. Respect `prefers-reduced-motion` and `prefers-color-scheme`. Sufficient contrast on all text (4.5:1 body, 3:1 large text). No information conveyed by color alone.
