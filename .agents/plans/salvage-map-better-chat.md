# Better Chat Salvage Map

This map describes the inverse migration strategy for PRD #3: use `/Users/oscargabriel/Developer/projects/better-agent` as the new working base, then port only the target-aligned code worth salvaging from the current `better-chat` repo.

The aim is speed and cleanliness. Instead of migrating the chat-first codebase toward the scaffold, build Better Agent in the scaffold-shaped repo and treat Better Chat as a source of proven infrastructure, UI pieces, and deployment knowledge.

## Strategy

Use `better-agent` as the real implementation base.

- It already has the newer dependency baseline.
- It already has the desired package seams: `api`, `auth`, `db`, `env`, `infra`, `ui`, and `config`.
- It is not burdened by Better Chat's product core.
- It gives PRD #3 a cleaner place to implement Thinkspaces as the top-level product container.

Use `better-chat` as a salvage yard.

- Port only code that accelerates the Better Agent target.
- Do not port generic chat behavior for compatibility.
- Do not port request-scoped AI completion as a primary product path.
- Do not port old conversation storage or migrations.
- Do not port code only to avoid rewriting small pieces.

After the new base has the required behavior, replace the old `better-chat` repo contents whole-cloth while preserving the repository identity, issue tracker, and deployment ownership.

## Product Guardrails

PRD #3 remains the product source of truth.

- Better Agent is the product, not Better Chat.
- Thinkspaces are the top-level container.
- A Thinkspace is created around a Goal.
- The first slice includes a Thinkspace dashboard, creation/review flow, detail shell, and archive behavior.
- Sources, Memory, Skills, Permissions, Approvals, Audit Trail, and Artifacts should be visible as first-class empty-state surfaces.
- The first slice does not include real Coordinator LLM behavior, full Thinkspace Agent runtime, real external tools, Approval execution workflows, Local Node support, old conversation migration, or backward-compatible chat APIs.

The ADRs remain binding.

- ADR-0001: target runtime is Cloudflare-native, with one Thinkspace Agent runtime per Thinkspace later.
- ADR-0002: D1 stores product indexes and authorization metadata, not runtime-local agent state.
- ADR-0003: external mutations default to drafts or explicit Approvals.
- ADR-0004: tools and Skills are explicitly enabled per Thinkspace, never globally inherited by default.

## Salvage Criteria

Port a Better Chat module only if it passes all of these checks.

- It supports Better Agent infrastructure or product concepts.
- It can be moved behind an existing `better-agent` package seam without preserving chat-first assumptions.
- It does not require old conversation compatibility.
- It does not make D1 the owner of runtime-local messages, tool runs, Memory changes, Approvals, or Audit Trail.
- It can be tested or verified through the new Better Agent surface.
- It is cheaper to port than to rebuild in the scaffold.

If a module fails any of these checks, delete it from the migration plan or record it as non-salvageable reference material.

## Port First

These are the highest-value Better Chat pieces to salvage into `better-agent`.

| Better Chat Source                                     | Target In Better Agent                                                     | Salvage Intent                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/lib/auth.ts`                          | `packages/auth/src/index.ts`                                               | Preserve richer Better Auth setup: social providers, email OTP, session KV, cookie/session behavior.                           |
| `apps/server/src/db/d1/schema/auth.ts`                 | `packages/db/src/schema/auth.ts`                                           | Reconcile auth schema if Better Chat's schema is more complete or matches current production auth needs.                       |
| `apps/server/src/db/d1/schema/settings.ts`             | `packages/db/src/schema/settings.ts` or redesigned product settings schema | Salvage only target-aligned settings: model/BYOK, MCP catalog metadata, theme if still needed. Drop chat-specific settings.    |
| `apps/server/src/features/models/*`                    | `packages/api` plus a model configuration module                           | Preserve model catalog, provider metadata, available model logic, and BYOK handling for future Thinkspace Agent configuration. |
| `apps/server/src/features/tools/mcp/*`                 | `packages/api` plus MCP catalog/config module                              | Preserve global MCP catalog/config infrastructure while preventing default Thinkspace inheritance.                             |
| `apps/server/src/lib/crypto.ts`                        | `packages/api`, `packages/db`, or a small utility package if needed        | Preserve encryption/decryption support for stored API keys or MCP headers.                                                     |
| `apps/web/src/routes/settings/-components/providers/*` | `apps/web` or `packages/ui`                                                | Salvage provider/BYOK settings UI if it can be reworded as product-level model configuration.                                  |
| `apps/web/src/routes/settings/-components/tools/*`     | `apps/web` or `packages/ui`                                                | Salvage MCP settings UI if it can be reworded as catalog configuration, not Thinkspace enablement.                             |
| `apps/web/src/routes/auth/-components/*`               | `apps/web` or `packages/ui`                                                | Salvage sign-in/social UI only where better than the scaffold forms.                                                           |
| `apps/web/src/components/ui/*`                         | `packages/ui/src/components`                                               | Salvage only primitives that are missing or better than the scaffold UI package.                                               |
| `alchemy.run.ts`                                       | `packages/infra/alchemy.run.ts`                                            | Preserve production deployment knowledge: stage env files, state store, D1/KV settings, custom domains, API routes.            |

## Port Later Or Quarantine

These may be useful later, but should not block the first Thinkspace slice.

| Better Chat Source                                         | Decision                   | Reason                                                                                              |
| ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/server/src/features/usage/*`                         | Quarantine                 | Usage accounting may matter later, but it is not core to Thinkspace creation/list/open/archive.     |
| Markdown/code renderers in chat UI                         | Quarantine as UI reference | Useful for future Thinkspace interaction surfaces, but not needed for the first shell.              |
| Tool-call/reasoning renderers                              | Quarantine as UI reference | Useful after real Thinkspace Agent runtime exists. Do not port as product architecture.             |
| `apps/server/src/features/ai/types.ts` and message helpers | Quarantine                 | May help future runtime message rendering, but should not preserve request-scoped chat assumptions. |
| Profile/settings route shells                              | Port selectively           | Useful only if the new Better Agent dashboard needs the same account/settings affordances.          |

Quarantine means copying nothing initially. Keep a note that the code exists in Better Chat and revisit when the future slice needs it.

## Do Not Port

These Better Chat modules should not enter the new base.

| Better Chat Source                              | Reason                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/src/routes/chat/*`                    | Encodes chat as the primary product surface.                                           |
| `apps/server/src/features/chat/routes.ts`       | Conversation APIs preserve the old product model.                                      |
| `apps/server/src/features/ai/routes.ts`         | Request-scoped AI completion is out of scope for the first slice.                      |
| `apps/server/src/features/ai/completion.ts`     | Couples AI turns to conversations, user DO storage, tools, and usage.                  |
| `apps/server/src/db/do/user-durable-object.ts`  | Current DO identity is per-user chat storage, not per-Thinkspace Agent runtime.        |
| `apps/server/src/db/do/schema/chat.ts`          | Old conversations/messages schema should not be migrated.                              |
| `apps/server/src/db/do/migrations/*`            | Old conversation migrations are not needed because the PRD rejects old chat migration. |
| Chat landing page copy and Better Chat branding | Conflicts with target product language.                                                |
| Chat-specific settings such as `chatWidth`      | Preserves the wrong product concept.                                                   |
| Conversation title generation                   | Tied to chat threads, not Thinkspace Goals.                                            |

## New Work To Build In Better Agent

The scaffold does not yet implement the PRD domain. Build these directly in `better-agent`; do not port them from Better Chat.

### Thinkspace Product Index

Add D1 schema under `packages/db` for account-owned Thinkspace metadata.

Minimum fields should support:

- stable Thinkspace ID;
- owner user ID;
- Goal;
- initial instructions/configuration summary;
- status: active or archived;
- created/updated/archived timestamps;
- placeholders for selected Skills/tools, requested Permissions, Approval defaults, and Memory governance defaults if those belong in product metadata.

Keep this index product-level. Do not store messages, tool runs, Memory changes, Approval execution records, or Audit Trail entries here.

### Thinkspace Lifecycle Module

Own creation, ownership checks, archive behavior, and invariant checks behind a small interface.

Route handlers should delegate to this module. The module should be directly testable without web UI or Cloudflare runtime complexity.

### Thinkspace Configuration Module

Own reviewable creation configuration:

- Goal;
- initial instructions;
- selected Skill/tool placeholders;
- requested Permission placeholders;
- Approval defaults;
- Memory governance defaults.

This provides a deterministic creation/review flow before a real Coordinator runtime exists.

### Permission Policy Module

Own placeholder safety semantics:

- Permission defines possible access;
- Approval consents to an action within a Permission;
- default external mutations are draft-or-Approval-gated;
- archived Thinkspaces conceptually disable active Permissions, enabled Skills/tools, and scheduled/background work.

### Thinkspace API Router

Add typed oRPC procedures in `packages/api`:

- create Thinkspace;
- list Thinkspaces;
- get Thinkspace;
- archive Thinkspace.

These procedures should enforce authentication and ownership, but not contain lifecycle rules inline.

### Thinkspace Web Shell

Build in `apps/web`:

- authenticated Thinkspace dashboard;
- create/review flow;
- Thinkspace detail route;
- archive action;
- explicit empty states for Sources, Memory, Skills, Permissions, Approvals, Audit Trail, and Artifacts;
- Better Agent branding and domain vocabulary.

## Salvage Sequence

### Phase 1: Prepare The New Base

- Copy PRD/domain docs and ADRs into `better-agent` so the new base carries the target language.
- Rename package scopes, app name, metadata, and product-facing strings if needed.
- Confirm the scaffold builds and typechecks before any salvage work.
- Create a short inventory issue or checklist for every Better Chat module considered for salvage.

### Phase 2: Port Auth And Environment Infrastructure

- Move Better Chat's richer Better Auth options into `packages/auth`.
- Add required env bindings to `packages/env` and `packages/infra`.
- Preserve OAuth, email OTP, KV secondary storage, and cookie/session behavior where still desired.
- Verify sign-in, sign-out, protected route loading, and session persistence in the new base.

### Phase 3: Port D1 Schemas And Product Settings

- Reconcile auth schema between the two repos.
- Port only target-aligned settings schema.
- Drop chat-specific columns and defaults.
- Add Thinkspace product-index schema and migrations.
- Verify migrations against a local/dev D1 database.

### Phase 4: Port Model/BYOK And MCP Catalog Infrastructure

- Move model catalog/provider/BYOK logic behind the new package seams.
- Move MCP catalog/config logic behind the new package seams.
- Ensure no globally configured model/tool becomes enabled for a Thinkspace by default.
- Update API routes and web settings UI to use Better Agent language.

### Phase 5: Build The First Thinkspace Slice

- Implement Thinkspace lifecycle/configuration/policy/repository modules.
- Implement create/list/get/archive API procedures.
- Implement the dashboard, creation review, detail shell, and archive flow.
- Add empty states for Sources, Memory, Skills, Permissions, Approvals, Audit Trail, and Artifacts.
- Remove scaffold demo routes that no longer belong.

### Phase 6: Port Deployment Knowledge

- Adapt Better Chat's Alchemy state store, stage env loading, D1/KV resource definitions, custom domains, and API routes into `packages/infra`.
- Do not port the per-user chat Durable Object namespace unless a later slice introduces a new Thinkspace Agent runtime namespace with the correct identity.
- Confirm dev, staging, and production deployment commands against the new package layout.

### Phase 7: Whole-Cloth Repo Swap

- Once the new base is verified, replace the old `better-chat` repo contents with the new `better-agent` contents.
- Preserve repository identity, GitHub issues, and PRD tracking.
- Keep old Better Chat source available through git history or an archived local copy during the final verification window.
- Do not preserve old conversation compatibility unless a new explicit requirement appears.

## Post-Salvage Risk Mitigation

Do these after the salvage phases and before the whole-cloth swap is considered complete.

### Deployment Resource Risk

Risk: Alchemy state, Cloudflare resource names, D1 IDs, KV namespaces, custom domains, and API route patterns may still be tied to the old repo shape.

Mitigation steps:

- Compare old and new `alchemy.run.ts` bindings line by line.
- Create an explicit resource mapping table for D1, KV, Worker, web app, domains, and routes.
- Run a dev deployment first with non-production resource names.
- Run staging before production.
- Confirm no production route points at a Worker missing required bindings.

### Auth And Callback Risk

Risk: OAuth callbacks, Better Auth `baseURL`, `basePath`, trusted origins, cookies, and session KV behavior may break when moved into the new package layout.

Mitigation steps:

- Verify email/password or OTP sign-in locally.
- Verify Google and GitHub OAuth callbacks in staging.
- Verify session cookies across web and API origins.
- Verify protected oRPC procedures receive a session.
- Verify sign-out clears usable session state.

### D1 Migration Risk

Risk: The PRD rejects old conversation migration, but auth/settings data may still matter. A careless reset could destroy useful account infrastructure or accidentally preserve chat storage.

Mitigation steps:

- Separate schemas into keep, redesign, and drop groups.
- Keep auth tables unless deliberately resetting accounts.
- Redesign settings to remove chat-specific fields.
- Drop old conversation/message schema from the new base.
- Test migrations against a copied dev database before touching staging or production.

### Secret And Env Risk

Risk: Salvaged auth, Resend, model providers, MCP, encryption, and Cloudflare bindings may require secrets absent from the scaffold.

Mitigation steps:

- Build a required-env checklist from salvaged modules.
- Add validation or required-env helpers for every binding.
- Verify missing secrets fail at startup/deploy time, not during user actions.
- Confirm encryption keys exist before porting encrypted settings data.

### Package Boundary Risk

Risk: Ported Better Chat code may drag app-local imports, circular dependencies, or chat vocabulary into the new package graph.

Mitigation steps:

- Port one module family at a time.
- Reject imports from old `apps/server/src/features/chat` and old `apps/web/src/routes/chat`.
- Keep domain rules out of web routes and oRPC handlers.
- Run typecheck after each salvage family.
- Rename interfaces to Better Agent language while porting, not afterward.

### Product Regression Risk

Risk: A technically successful port could still leave Better Agent feeling like a renamed chat app.

Mitigation steps:

- Make Thinkspaces the authenticated landing surface before adding advanced settings.
- Remove scaffold demo routes and Better Chat routes from primary navigation.
- Check all visible copy for Better Agent vocabulary.
- Verify empty states explain target modules without pretending they are complete.

### Runtime Architecture Risk

Risk: Salvaged AI or Durable Object code could recreate request-scoped chat or per-user conversation storage.

Mitigation steps:

- Do not mount a primary `/ai` or `/chat` route in the first slice.
- Do not bind `UserDurableObject` in the new production path.
- Leave a clear future seam for one Thinkspace Agent runtime per Thinkspace.
- Keep runtime-local messages and tool runs out of D1.

### Verification Risk

Risk: The new repo may appear working but lack coverage for the new domain invariants.

Mitigation steps:

- Add pure tests for Thinkspace lifecycle, configuration validation, and Permission policy.
- Add API-level checks for create/list/get/archive and unauthorized access.
- Add web behavior checks for dashboard, review flow, detail empty states, and archive behavior.
- Run build and typecheck after dependency and salvage work.

## Final Swap Checklist

- New base builds and typechecks.
- Auth works locally and in staging.
- D1 migrations are verified against a copied database or disposable staging database.
- Thinkspace create/list/get/archive works through API and UI.
- Archived Thinkspaces are inert but inspectable.
- No `/chat` route is the primary product path.
- No old conversation compatibility layer exists.
- No globally configured MCP/tool catalog item is automatically enabled for a Thinkspace.
- Product-facing UI says Better Agent and uses Thinkspace/Goal/Permission/Approval language.
- Alchemy deployment maps old production resources deliberately or intentionally creates replacements.
- Old Better Chat source remains recoverable through git history or a local archive during the cutover.

## Recommendation

This inverse strategy is the cleaner path if the scaffold is truly working. Start from `better-agent`, salvage only proven infrastructure from `better-chat`, build the Thinkspace slice directly in the new architecture, then swap the repo contents once the new base is verified.

The default answer for Better Chat code should be no. Port it only when it clearly accelerates Better Agent without preserving the old chat product model.
