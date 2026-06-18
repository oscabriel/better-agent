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
A durable, scoped environment for one bounded body of thinking work. A Thinkspace begins as a draft the moment the user starts shaping it with the Curator, and becomes active when its Goal and first Agent Profile revision are activated together.
_Avoid_: Chat, thread, project, workspace, agent

**Goal**:
The bounded, assessable outcome a Thinkspace is created to pursue.
_Avoid_: Task, objective, prompt, request

**Curator**:
The thin product-level agent role, one per user, that helps users create, find, configure, and route between Thinkspaces, and that protects the user's Attention by maintaining and surfacing the cross-Thinkspace Review Queue.
_Avoid_: Coordinator, Jarvis, personal assistant, global agent, universal agent, orchestration dashboard

**Thinkspace Agent**:
The dedicated agent role configured for one Thinkspace's bounded purpose.
_Avoid_: Better Agent, Curator, global assistant

**Agent Profile**:
The descriptor of one Thinkspace Agent's identity and behavior — its name, instructions, and model behavior, plus references to the enabled tools, Skills, and Routines the user sees and shapes with the Curator. Each referenced piece remains owned and governed by its own concept; a Permission is never granted through the Agent Profile. A revision being shaped with the Curator is a draft until the user activates it; activations are recorded in the Audit Trail, and past work remains attributable to the revision it ran under.
_Avoid_: persona, character, agent config, settings, system prompt, Permission

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

**Routine**:
A recurring instruction a Thinkspace Agent performs on a schedule in service of the Thinkspace's Goal.
_Avoid_: task, job, cron, scheduled task, automation, Skill

**Artifact**:
A durable output produced or maintained by a Thinkspace.
_Avoid_: Source, memory, chat response, document

**Local Node**:
A trusted user-controlled machine that can provide scoped access to local resources for a Thinkspace.
_Avoid_: Agent host, local runtime, full machine access, laptop

**Audit Trail**:
The user-facing history of meaningful actions and changes within a Thinkspace.
_Avoid_: Logs, telemetry, debugging output, transcript

**Sitting**:
A live, streamed, back-and-forth session in which a Thinkspace owner works directly with one Thinkspace Agent, on top of the agent's full durable history — reading what it produced while they were away, pushing back, and iterating toward a decision. A Sitting is the primary surface where the user's Attention is applied; it changes who may reach the runtime, never what the agent may do.
_Avoid_: session, chat, thread, conversation

**Attention**:
The user's finite, serial judgement capacity — the scarce resource Better Agent is architected around and cannot parallelize or clone.
_Avoid_: Time, availability, focus mode, bandwidth-as-a-metric, agent slots

**Sitting**:
A deliberate, live working session in which the user gives one Thinkspace their full Attention — reading the Thinkspace Agent's findings, conversing with it in real time, iterating, discarding, and molding the work toward a decision or an Artifact. The Sitting is the primary judgement surface; what Better Agent rejects is concurrent interactivity, not interactivity.
_Avoid_: session, chat, thread, review (a Sitting is deep work, not queue processing)

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
- A **Thinkspace** is created around one primary **Goal**; sharpening the **Goal** until it is bounded and assessable is part of the **Curator** session that shapes the draft.
- A draft **Thinkspace** preserves the judgement already spent in its **Curator** session; abandoning curation never silently discards it.
- The **Curator** helps create and route between **Thinkspaces**.
- Each **Thinkspace** has one dedicated **Thinkspace Agent**.
- Each **Thinkspace Agent** is described by one **Agent Profile**.
- The **Curator** assembles an **Agent Profile** with the user; the **Agent Profile** references enabled tools and **Skills** but never grants **Permissions**.
- An **Agent Profile** revision takes effect only when the user activates it; drafts are resumable and activations enter the **Audit Trail**.
- A **Connected Account** does not grant access to a **Thinkspace Agent** without a **Permission**.
- A **Permission** belongs to one **Thinkspace** and constrains what its **Thinkspace Agent** may access or do.
- Enablement makes a tool present; a **Permission** makes it potent. Safe built-in tools need only enablement, while tools reaching protected resources are inert without their **Permission**.
- An **Agent Profile** draft may carry requested **Permissions**, but only the user grants them; the **Curator** proposes and never grants.
- A **Permission** may govern ongoing access to a live **Source**.
- An **Approval** authorizes an action that is already allowed by a **Permission**.
- A **Source** can inform **Memory**, but it is not itself **Memory**.
- **Memory** belongs to one **Thinkspace** by default.
- A **Skill** may exist in a product-level catalog, but it must be enabled for a **Thinkspace** before its **Thinkspace Agent** can use it.
- A **Routine** belongs to one **Thinkspace** and may invoke **Skills**; what a Routine produces enters the **Review Queue** like any other agent production, subject to **Backpressure**.
- An **Artifact** may cite **Sources** and reflect **Memory**, but it is an output of the **Thinkspace**.
- A **Local Node** can provide resources governed by **Permissions**, but it does not host the **Thinkspace Agent**.
- An **Audit Trail** belongs to one **Thinkspace**.
- Better Agent is architected around the user's **Attention** as the single serial resource; agent supply is not the constraint.
- The **Curator** maintains one per-user **Review Queue** spanning all **Thinkspaces**.
- A **Review Queue** batches items that require the user's judgement, including pending **Approvals**, drafts, **Memory** to accept, and **Goal** assessments.
- **Backpressure** paces **Thinkspace Agent** production to the user's review rate; an **Approval** is a holdpoint that enters the **Review Queue** rather than auto-executing.
- A **Thinkspace** externalizes context into **Memory**, **Sources**, **Artifacts**, and the **Audit Trail** so the user does not reload it from memory on every return.
- A **Sitting** is one owner working live with one **Thinkspace Agent** over its full durable history; the user enters it deliberately, holds their **Attention** there, and leaves with conclusions, redirections, or an **Artifact** ready to take off-app. Every Sitting turn is governed identically to a submitted turn and is attributed to the **Agent Profile** revision it ran under.
- A **Sitting**, not the **Review Queue**, is the primary surface for applying **Attention**; the **Review Queue** stays the cross-Thinkspace doorbell that tells the user which **Thinkspace** is ripe for a **Sitting** — the deep surface is the **Thinkspace** itself, not the queue.
- Work a **Thinkspace Agent** produces between **Sittings** (from submissions and **Routines**) accumulates under **Backpressure** for the next **Sitting**; an **Approval** granted during a **Sitting** can execute live, while one raised between **Sittings** holds until the user returns.

## Example dialogue

> **Dev:** "Should this new glossary describe Better Chat or Better Agent?"
> **Domain expert:** "Use **Better Agent** for the target product; **Better Chat** is only the predecessor lineage."

> **Dev:** "Are 'Reimagine Better Agent' and 'Monitor Cloudflare Agents SDK' two chats in one project?"
> **Domain expert:** "No — they are separate **Thinkspaces** because they have different Goals, Memory, Artifacts, and Permissions."

> **Dev:** "Is 'monitor Cloudflare Agents SDK releases' a task?"
> **Domain expert:** "Treat it first as a **Goal** and sharpen it until the **Thinkspace** has a bounded, assessable outcome."

> **Dev:** "Should the Curator do the research after it creates a Thinkspace?"
> **Domain expert:** "No — the **Curator** helps set up the **Thinkspace**; the **Thinkspace Agent** performs the bounded work inside it."

> **Dev:** "If GitHub is connected, can every Thinkspace Agent create issues anywhere?"
> **Domain expert:** "No — a **Permission** must grant access to a specific resource and action for that **Thinkspace**."

> **Dev:** "If Oscar connects GitHub once, does every Thinkspace inherit GitHub tools?"
> **Domain expert:** "No — the **Connected Account** exists at the product level, but each **Thinkspace** needs its own **Permission**."

> **Dev:** "If I revoke the GitHub Permission, do I have to edit the Agent Profile too?"
> **Domain expert:** "No — the **Permission** belongs to the **Thinkspace**. The **Agent Profile** may still list the tool, but it goes inert without a **Permission**."

> **Dev:** "The Curator enabled web search and GitHub issue creation — do both need Permissions?"
> **Domain expert:** "No — read-only built-in search needs only enablement in the **Agent Profile**; issue creation reaches a **Connected Account**, so it is inert until the user grants the **Permission**."

> **Dev:** "If a Permission allows GitHub issue creation, can the agent create issues immediately?"
> **Domain expert:** "Not by default — an **Approval** is still needed unless the Permission includes a narrow standing approval policy."

> **Dev:** "Is an uploaded PDF memory?"
> **Domain expert:** "No — the PDF is a **Source**; any retained interpretation accepted into the Thinkspace is **Memory**."

> **Dev:** "If a Thinkspace Agent learns a repeatable monitoring workflow, is that just memory?"
> **Domain expert:** "No — if it is a reusable procedure for recurring work, model it as a **Skill** scoped to that **Thinkspace**."

> **Dev:** "Is 'every Monday, check for new releases and draft notes' a Skill?"
> **Domain expert:** "No — the trigger and instruction form a **Routine**; the reusable drafting procedure it invokes is a **Skill**, and the draft awaits the **Review Queue**."

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

> **Dev:** "If the Review Queue is the surface, is live chat with a Thinkspace Agent off the table?"
> **Domain expert:** "No — the **Sitting** is where judgement actually happens: the user sits down with one **Thinkspace**, reads deeply, pushes back, and iterates live. What we reject is twenty concurrent streams, not conversation."

> **Dev:** "Is a Sitting just processing the Review Queue faster?"
> **Domain expert:** "No — the **Review Queue** is the doorbell that says which **Thinkspace** is ripe; the **Sitting** is the deep work inside it, ending in real conclusions or an **Artifact** the user takes off-app."

## Flagged ambiguities

- "Better Chat" and "Better Agent" were both used around the repo; resolved: **Better Agent** is the target product context, while **Better Chat** names the predecessor lineage only.
- "chat", "project", "workspace", and "agent" can all sound like the main container; resolved: **Thinkspace** is the canonical top-level work container.
- "task", "run", and "job" sounded like user-facing work concepts; resolved: use **Goal** for the scoped outcome and defer execution-shaped terms until the product surface needs them. Later resolved further: recurring scheduled instructions are **Routines**; "scheduled task" stays an implementation term inside the runtime substrate.
- "agent" can mean the whole product, the setup helper, or the bounded worker; resolved: **Better Agent** is the product, **Curator** is the setup/routing role, and **Thinkspace Agent** is the bounded worker role.
- "Coordinator" and "curator" both described the setup/routing role; resolved: the role is renamed **Curator** (ADRs 0001 and 0005 predate the rename and still say "Coordinator"). Guided Thinkspace creation is a Curator capability, not a separate role — whether it runs as a stateless endpoint or a durable per-user agent is an implementation detail.
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
- "tool enablement" and "Permission" were easy to collapse; resolved: enablement is an Agent Profile scoping decision that makes a tool present, while a **Permission** is the Thinkspace-owned security boundary that makes protected tools potent.
- "agent config", "profile", and "settings" blurred during runtime planning; resolved: **Agent Profile** is the user-facing descriptor of a Thinkspace Agent's identity and behavior. It owns only the pieces with no other home (name, instructions, model behavior) and references the rest — tools, **Skills**, and **Permissions** keep their own ownership and governance.
- "Review Queue as the primary surface" and "streaming last" over-rotated early docs toward a batch dashboard; resolved: the **Sitting** — the deliberate live working session with one **Thinkspace** — is the primary judgement surface, and the **Review Queue** is the ripeness signal that routes Attention to it. The product rejects *concurrent* interactivity, not interactivity.
- "session", "chat", and "thread" all described the live deliberate working session, but "session" collides with both Project Think's runtime Session and the Better Auth session; resolved: **Sitting** is the canonical term for the live owner↔Thinkspace Agent session surface, while "session" stays an implementation term in the runtime substrate. Authenticated live surfaces move from "last" to "now" in the unlock sequence: the Sitting, not the Review Queue, is the primary judgement surface.
