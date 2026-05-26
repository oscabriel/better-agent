# Safety and Permissions

Better Agent’s safety model should be built around scoped Thinkspaces, explicit capability grants, inspectable memory, and human approval for boundary-crossing actions.

## Threat model

Modern agents can leak or misuse data through:

- broad tool access;
- prompt injection in web pages, docs, issues, emails, or tool outputs;
- hidden or excessive memory;
- long-lived credentials;
- shared global context;
- multi-agent delegation without policy boundaries;
- social channels where strangers can influence the agent;
- shell/filesystem tools;
- transcript and audit logs containing secrets;
- automated external actions such as posting, commenting, emailing, or opening PRs.

Better Agent should assume the model can be manipulated. Safety should come from runtime policy, capability scoping, approval, and audit — not just prompt instructions.

## Capability grants

A capability grant is a scoped permission for a Thinkspace agent to access a resource or perform an action.

Capability grants should include:

```txt
Resource
Scope
Allowed actions
Denied actions
Approval policy
Expiration
Audit requirements
Credential source
Risk level
```

Example:

```txt
Capability: GitHub
Scope: repo oscargabriel/better-chat
Allowed: read code, read issues, draft issues
Requires approval: create issue, comment, open PR
Denied: merge, delete, force push, modify repo settings
Expires: when Thinkspace archived
```

Example:

```txt
Capability: Local Filesystem
Node: Oscar MacBook
Root: ~/Developer/projects/better-chat
Allowed: read, grep, list
Requires approval: write, edit, delete
Denied: access outside root
```

## Permission levels

Suggested action levels:

1. **None** — capability unavailable.
2. **Read** — agent can inspect but not mutate.
3. **Draft** — agent can prepare external changes but not apply them.
4. **Ask every time** — user approves each action.
5. **Allow within scope** — agent can act without approval inside a narrow grant.
6. **Scheduled within scope** — agent can run recurring work inside a narrow grant.

High-risk actions should default to draft or ask every time.

## Boundary-crossing actions

The following should require explicit approval by default:

- sending messages to humans;
- posting comments publicly;
- creating GitHub issues or PRs;
- editing files outside a cloud scratch workspace;
- running shell commands;
- writing to connected accounts;
- deleting anything;
- reading from sensitive local directories;
- promoting workspace memory to global memory;
- sharing artifacts externally.

## Pest prevention

Better Agent should explicitly help users avoid becoming pests on the web.

Default posture:

- no social posting tools by default;
- no public commenting by default;
- no unsolicited messages;
- no automated open source issue/PR spam;
- draft-first external communication;
- rate limits for external actions;
- clear identity and attribution if anything is posted;
- human review before contacting people.

Product rule:

> Better Agent helps the human be a good citizen of the web. It does not impersonate the human at scale.

## Memory safety

Memory should be:

- visible;
- editable;
- deletable;
- source-linked when possible;
- scoped to a Thinkspace by default;
- promoted to global only with user intent;
- excluded from unrelated Thinkspaces;
- reviewed before being used in high-risk actions.

Memory proposals should be a product surface:

```txt
The agent proposes saving:
“Cloudflare Agents SDK / Project Think is a core architectural bet for this product.”

Scope: Thinkspace only
Source: conversation on 2026-05-25

[Save] [Edit] [Reject]
```

## Secret handling

Secrets should not enter model context.

Preferred model:

- store credentials outside agent-readable memory;
- use credential brokers or scoped tokens where possible;
- never expose raw secrets to prompts, tool results, transcripts, or memory;
- redact tool outputs before persistence;
- keep capability metadata separate from credential material;
- issue short-lived/action-scoped credentials where possible.

A Thinkspace agent should know:

```txt
GitHub read access is available for repo X.
```

It should not know:

```txt
ghp_...
```

## Audit trail

Audit events should record:

- agent;
- Thinkspace;
- user;
- capability;
- action;
- inputs/parameters, redacted as needed;
- policy decision;
- approval decision;
- result;
- timestamp;
- external system touched;
- memory changes.

Audit should be visible in the Thinkspace UI, not only backend logs.

## Approval UX

Approvals should be clear and specific:

```txt
BA wants to create 4 GitHub issues.

Thinkspace: Better Agent Architecture
Repo: oscargabriel/better-chat
Capability: GitHub draft/create issues
Reason: These issues implement the approved Phase 1 plan.

[Review issue drafts]
[Approve once]
[Reject]
[Grant issue creation for this Thinkspace]
```

## Safer defaults

New Thinkspaces should default to:

- no external write access;
- no social/messaging access;
- read-only web search if enabled;
- read-only MCP/documentation tools;
- no local node access until granted;
- no shell access until granted;
- memory proposals requiring review;
- external actions as drafts.
