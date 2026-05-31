# Better Agent

Better Agent is the target product context for a web-native system that helps people create scoped agents for durable project thinking, research, planning, monitoring, and handoff work.

Better Agent is architected around the user's **Attention** as the scarce, serial resource. Agent supply is cheap and parallel; human judgement is not. The product's job is to make one person's judgement go further — by pacing, batching, and gating agent work — not to make spawning agents easier or to make the user feel busy.
_Avoid_ framing the product as: an orchestration dashboard, a multi-agent control center, a way to run many agents at once, anything that sells agent count over shipped, understood outcomes.

## Language

**Better Agent**:
The target product that coordinates scoped agents for bounded thinking work.
_Avoid_: Better Chat, Jarvis, personal assistant

**Better Chat**:
The predecessor product and codebase lineage that Better Agent evolves from.
_Avoid_: Using this as the target product name

**Thinkspace**:
A durable, scoped environment for one bounded body of thinking work.
_Avoid_: Chat, thread, project, workspace, agent

**Goal**:
The bounded, assessable outcome a Thinkspace is created to pursue.
_Avoid_: Task, objective, prompt, request

**Coordinator**:
The thin product-level agent role, one per user, that helps users create, find, configure, and route between Thinkspaces, and that protects the user's Attention by maintaining and surfacing the cross-Thinkspace Review Queue.
_Avoid_: Jarvis, personal assistant, global agent, universal agent, orchestration dashboard

**Thinkspace Agent**:
The dedicated agent role configured for one Thinkspace's bounded purpose.
_Avoid_: Better Agent, Coordinator, global assistant

**Permission**:
A Thinkspace-scoped allowance for an agent to access a resource or perform an action.
_Avoid_: Capability grant, tool access, account access, API key

**Approval**:
User consent for a proposed or policy-matched action within an existing Permission.
_Avoid_: Permission, review, confirmation, access grant

**Connected Account**:
A product-level relationship with an external service or identity.
_Avoid_: Permission, tool access, credential, integration

**Source**:
External or user-provided material made available to a Thinkspace.
_Avoid_: Memory, context, document dump, knowledge base

**Memory**:
Retained understanding accepted or maintained within a Thinkspace.
_Avoid_: Source, transcript, hidden model state, global memory

**Skill**:
A reusable procedure a Thinkspace Agent can follow for recurring work.
_Avoid_: Personality, hidden ability, global automation, tool permission

**Artifact**:
A durable output produced or maintained by a Thinkspace.
_Avoid_: Source, memory, chat response, document

**Local Node**:
A trusted user-controlled machine that can provide scoped access to local resources for a Thinkspace.
_Avoid_: Agent host, local runtime, full machine access, laptop

**Audit Trail**:
The user-facing history of meaningful actions and changes within a Thinkspace.
_Avoid_: Logs, telemetry, debugging output, transcript

**Attention**:
The user's finite, serial judgement capacity — the scarce resource Better Agent is architected around and cannot parallelize or clone.
_Avoid_: Time, availability, focus mode, bandwidth-as-a-metric, agent slots

**Review Queue**:
The batched, prioritized, cross-Thinkspace set of items awaiting the user's judgement — pending Approvals, drafts, Memory to accept, and Goal assessments.
_Avoid_: Inbox, notification feed, dashboard, task list, agent activity stream

**Backpressure**:
The system behavior that paces Thinkspace Agent production to the user's review rate, so produced work accumulates for review instead of auto-merging.
_Avoid_: Rate limit, throttle, queue depth, hard pause

## Relationships

- **Better Agent** evolves from **Better Chat**.
- **Better Agent** coordinates many **Thinkspaces**.
- A **Thinkspace** is separate from the agent, chat, **Sources**, **Memory**, **Skills**, **Artifacts**, and **Permissions** it contains or configures.
- A **Thinkspace** is created around one primary **Goal**.
- The **Coordinator** helps create and route between **Thinkspaces**.
- Each **Thinkspace** has one dedicated **Thinkspace Agent**.
- A **Connected Account** does not grant access to a **Thinkspace Agent** without a **Permission**.
- A **Permission** belongs to one **Thinkspace** and constrains what its **Thinkspace Agent** may access or do.
- A **Permission** may govern ongoing access to a live **Source**.
- An **Approval** authorizes an action that is already allowed by a **Permission**.
- A **Source** can inform **Memory**, but it is not itself **Memory**.
- **Memory** belongs to one **Thinkspace** by default.
- A **Skill** may exist in a product-level catalog, but it must be enabled for a **Thinkspace** before its **Thinkspace Agent** can use it.
- An **Artifact** may cite **Sources** and reflect **Memory**, but it is an output of the **Thinkspace**.
- A **Local Node** can provide resources governed by **Permissions**, but it does not host the **Thinkspace Agent**.
- An **Audit Trail** belongs to one **Thinkspace**.
- Better Agent is architected around the user's **Attention** as the single serial resource; agent supply is not the constraint.
- The **Coordinator** maintains one per-user **Review Queue** spanning all **Thinkspaces**.
- A **Review Queue** batches items that require the user's judgement, including pending **Approvals**, drafts, **Memory** to accept, and **Goal** assessments.
- **Backpressure** paces **Thinkspace Agent** production to the user's review rate; an **Approval** is a holdpoint that enters the **Review Queue** rather than auto-executing.
- A **Thinkspace** externalizes context into **Memory**, **Sources**, **Artifacts**, and the **Audit Trail** so the user does not reload it from memory on every return.

## Example dialogue

> **Dev:** "Should this new glossary describe Better Chat or Better Agent?"
> **Domain expert:** "Use **Better Agent** for the target product; **Better Chat** is only the predecessor lineage."

> **Dev:** "Are 'Reimagine Better Agent' and 'Monitor Cloudflare Agents SDK' two chats in one project?"
> **Domain expert:** "No — they are separate **Thinkspaces** because they have different Goals, Memory, Artifacts, and Permissions."

> **Dev:** "Is 'monitor Cloudflare Agents SDK releases' a task?"
> **Domain expert:** "Treat it first as a **Goal** and sharpen it until the **Thinkspace** has a bounded, assessable outcome."

> **Dev:** "Should the Coordinator do the research after it creates a Thinkspace?"
> **Domain expert:** "No — the **Coordinator** helps set up the **Thinkspace**; the **Thinkspace Agent** performs the bounded work inside it."

> **Dev:** "If GitHub is connected, can every Thinkspace Agent create issues anywhere?"
> **Domain expert:** "No — a **Permission** must grant access to a specific resource and action for that **Thinkspace**."

> **Dev:** "If Oscar connects GitHub once, does every Thinkspace inherit GitHub tools?"
> **Domain expert:** "No — the **Connected Account** exists at the product level, but each **Thinkspace** needs its own **Permission**."

> **Dev:** "If a Permission allows GitHub issue creation, can the agent create issues immediately?"
> **Domain expert:** "Not by default — an **Approval** is still needed unless the Permission includes a narrow standing approval policy."

> **Dev:** "Is an uploaded PDF memory?"
> **Domain expert:** "No — the PDF is a **Source**; any retained interpretation accepted into the Thinkspace is **Memory**."

> **Dev:** "If a Thinkspace Agent learns a repeatable monitoring workflow, is that just memory?"
> **Domain expert:** "No — if it is a reusable procedure for recurring work, model it as a **Skill** scoped to that **Thinkspace**."

> **Dev:** "Is a generated handoff package a source or memory?"
> **Domain expert:** "No — it is an **Artifact**, because it is a durable output produced by the **Thinkspace**."

> **Dev:** "If I connect my MacBook, does the Thinkspace Agent run there?"
> **Domain expert:** "No — the **Local Node** only provides scoped local resources through **Permissions**."

> **Dev:** "Can we just keep agent tool history in backend logs?"
> **Domain expert:** "No — meaningful actions belong in the **Audit Trail** so the user can inspect what happened inside the **Thinkspace**."

> **Dev:** "Should the home screen show how many agents are running right now?"
> **Domain expert:** "No — running agent count is producer-side vanity. Surface the **Review Queue**: what needs the user's judgement, batched and prioritized."

> **Dev:** "Can we let users spin up as many Thinkspaces in parallel as they want and show them all live?"
> **Domain expert:** "You can create many, but design for **Backpressure** — scale visible, in-progress work to the user's review rate, because **Attention** is the bottleneck, not Thinkspace count."

> **Dev:** "A draft is ready and the Thinkspace has a Permission — can we just merge it to save the user a step?"
> **Domain expert:** "No — that holdpoint enters the **Review Queue** for an **Approval**. Auto-merging spends the user's judgement without their consent and accrues cognitive debt."

## Flagged ambiguities

- "Better Chat" and "Better Agent" were both used around the repo; resolved: **Better Agent** is the target product context, while **Better Chat** names the predecessor lineage only.
- "chat", "project", "workspace", and "agent" can all sound like the main container; resolved: **Thinkspace** is the canonical top-level work container.
- "task", "run", and "job" sounded like user-facing work concepts; resolved: use **Goal** for the scoped outcome and defer execution-shaped terms until the product surface needs them.
- "agent" can mean the whole product, the setup helper, or the bounded worker; resolved: **Better Agent** is the product, **Coordinator** is the setup/routing role, and **Thinkspace Agent** is the bounded worker role.
- "capability grant" described the underlying permission object in planning docs; resolved: use **Permission** as the canonical domain term.
- "connected account" sounded like agent access; resolved: a **Connected Account** is only a product-level relationship, while **Permission** grants scoped Thinkspace access.
- "permission" and "approval" were easy to collapse; resolved: **Permission** defines what can be allowed, while **Approval** consents to an action within that allowance.
- "source", "memory", and "context" were easy to blur; resolved: **Source** is material the Thinkspace can consult, while **Memory** is retained understanding.
- "skill" could imply a magical agent ability or global automation; resolved: a **Skill** is a reusable procedure scoped to a Thinkspace by default.
- "document" sounded too narrow for generated outputs; resolved: use **Artifact** because outputs may include diagrams, bundles, exports, snapshots, scripts, and handoff packages.
- "local machine" sounded like the agent runtime location; resolved: a **Local Node** is only an optional provider of scoped local resources.
- "logs" sounded like developer-only implementation data; resolved: **Audit Trail** is a user-facing Thinkspace history.
- "orchestration", "dashboard", and "running agents" framed the product as a producer-side control center; resolved: Better Agent is architected around **Attention** as the scarce serial resource, and the consumer-side **Review Queue** plus **Backpressure** are the canonical framing.
- "inbox" and "notifications" sounded like the right surface for pending work; resolved: use **Review Queue** — a batched, prioritized set of items needing judgement, not a real-time feed.
- "busy" vs "productive" blurred in early messaging; resolved: agent count and live activity are not the value; shipped, understood outcomes gated by the user's judgement are.
