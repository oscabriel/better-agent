# Vercel AI SDK model/BYOK study

Date: 2026-05-27

## Executive takeaways

- **Salvage the model catalog, BYOK settings shape, and provider-resolution concepts, not the chat endpoint.** Better Chat already has a static `provider:model` catalog with free vs BYOK access and capabilities (`apps/server/src/features/models/catalog.ts:3-257`), access helpers (`apps/server/src/features/models/utils.ts:4-124`), encrypted per-user API keys in settings (`apps/server/src/features/settings/types.ts:6-25`), and a per-user AI SDK registry factory (`apps/server/src/features/models/user-registry-factory.ts:275-328`). These are good raw material for a future Better Agent model configuration service.
- **Do not preserve `/ai` as an architectural boundary.** The current Better Chat `streamCompletion` is a request-scoped chat turn: it loads settings, builds a registry, fetches enabled tools, merges incoming messages with history, calls `streamText`, persists the response in `onFinish`, and records usage in one route-bound flow (`apps/server/src/features/ai/completion.ts:40-215`). ADR-0001 explicitly chooses one Thinkspace Agent runtime per Thinkspace, with messages/tool runs/approvals/memory owned by that runtime rather than request-owned chat turns (`docs/adr/0001-cloudflare-native-agent-runtime.md`).
- **Target AI SDK v6 patterns from Better Agent, but centralize them behind runtime model resolution.** Better Agent’s demo route already uses v6-style `streamText`, `convertToModelMessages`, `toUIMessageStreamResponse`, and `DefaultChatTransport` (`better-agent/apps/server/src/index.ts:73-89`; `better-agent/apps/web/src/routes/ai.tsx:14-18`). Keep those as API-shape references only, not as product architecture.
- **Upgrade/version alignment is mandatory.** Better Chat currently uses `ai@^5.0.112` and v5-generation provider packages (`apps/server/package.json:20-30`), while Better Agent’s catalog pins `ai@^6.0.3` (`better-agent/package.json:9-21`). AI SDK migration docs require aligned v6 generations: `ai@^6.0.0`, `@ai-sdk/provider@^3.0.0`, `@ai-sdk/provider-utils@^4.0.0`, and `@ai-sdk/*@^3.0.0` (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:19-23`). Do not mix v5 core with v6/v7 providers.

## AI SDK v6 patterns relevant to model/BYOK

### Provider registries and model IDs

- The SDK’s intended multi-provider seam is `createProviderRegistry({ openai, anthropic, google, gateway })` plus `registry.languageModel('provider:model')`. Docs specify provider registry IDs are `providerId:modelId` by default, with a configurable separator (`vercel/ai content/docs/03-ai-sdk-core/45-provider-management.mdx:177-229`; `content/docs/07-reference/01-ai-sdk-core/40-provider-registry.mdx:8-47`).
- `customProvider` is the right abstraction for application aliases, limiting exposed models, and preconfigured model settings; it supports maps for language/embedding/image/etc. models plus a `fallbackProvider`, and resolves configured models before falling back or throwing `NoSuchModelError` (`vercel/ai packages/ai/src/registry/custom-provider.ts:26-45`, `54-111`, `113-239`).
- Local Better Chat already uses both primitives: `baseAppRegistry`/`registry` create OpenAI, Anthropic, and Google providers with `customProvider` for curated model exposure (`apps/server/src/features/models/providers.ts:20-53`), and `createUserProviderRegistry` builds per-user registries with BYOK providers (`apps/server/src/features/models/user-registry-factory.ts:275-328`). This is salvageable as a model resolver, but should be detached from `features/ai`.

### Provider factories and BYOK

- OpenAI: use `openai` or `createOpenAI({ apiKey, baseURL, organization, project, headers, fetch })`; default auth falls back to `OPENAI_API_KEY` and `OPENAI_BASE_URL` in normal environments (`vercel/ai packages/openai/src/openai-provider.ts:108-181`). `openai(modelId)` defaults to the Responses API in current docs/source; use `.chat()` only when deliberately depending on Chat Completions behavior (`vercel/ai content/providers/01-ai-sdk-providers/03-openai.mdx:100-150`).
- Anthropic: use `anthropic` or `createAnthropic({ apiKey, authToken, baseURL, fetch })`; provider auth supports `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` and exposes callable `anthropic(modelId)` plus `.chat/.messages/.files/.skills/.tools` (`vercel/ai packages/anthropic/src/anthropic-provider.ts:20-45`, `50-133`, `146-178`).
- Google: in v6/latest docs, the factory is `createGoogle`; `createGoogleGenerativeAI` remains only as a deprecated alias (`vercel/ai packages/google/src/index.ts:1-45`). Use `createGoogle({ apiKey })` for Gemini BYOK; provider options are under `providerOptions.google`, and the API key is sent via `x-goog-api-key`, defaulting to `GOOGLE_GENERATIVE_AI_API_KEY` outside Workers (`vercel/ai packages/google/src/google-provider.ts:112-130`, `158-166`).
- Cloudflare Workers caveat: direct providers support custom `fetch` and have edge tests, but Workers bindings should be passed explicitly as `apiKey: env.X` rather than relying on Node-style environment lookup (`vercel/ai packages/google/openai/anthropic package.json test:edge evidence; provider source passes `options.fetch`into models). Better Agent’s demo follows the explicit binding pattern with`env.GOOGLE_GENERATIVE_AI_API_KEY` (`better-agent/apps/server/src/index.ts:76-82`).

### Reasoning/thinking settings

- OpenAI reasoning uses `providerOptions.openai.reasoningEffort`. Latest source accepts values beyond Better Chat’s current union, including `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`, with model-specific caveats (`vercel/ai packages/openai/src/responses/openai-responses-language-model-options.ts:234-244`; `content/providers/01-ai-sdk-providers/03-openai.mdx:200-208`). Local Better Chat only exposes `off|low|medium|high` (`apps/server/src/features/settings/types.ts:4`) and applies OpenAI reasoning only to model IDs starting with `o` (`apps/server/src/features/models/providers.ts:103-116`; `user-registry-factory.ts:62-75`).
- Anthropic thinking uses `providerOptions.anthropic.thinking`, either adaptive/disabled/enabled budget forms; latest source maps `budgetTokens` to Anthropic `budget_tokens`, defaults enabled missing budget to 1024, and adds thinking budget to max tokens (`vercel/ai packages/anthropic/src/anthropic-language-model-options.ts:81-108`; `anthropic-language-model.ts:420-460`, `597-641`). Better Chat’s budget mapping is salvageable but should become per-model policy rather than hard-coded by provider/model substring (`apps/server/src/features/models/user-registry-factory.ts:36-47`, `78-95`, `169-215`).
- Google thinking uses `providerOptions.google.thinkingConfig`; latest source allows `thinkingBudget`, `includeThoughts`, and Gemini 3 `thinkingLevel` (`vercel/ai packages/google/src/google-language-model-options.ts:56-67`; `content/providers/01-ai-sdk-providers/15-google.mdx:266-310`). **Current Better Chat Google BYOK is risky** because it creates Google BYOK via OpenAI compatibility (`createOpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })`) but still wraps with `providerOptions.google` (`apps/server/src/features/models/providers.ts:73-79`, `142-164`; `user-registry-factory.ts:221-245`, `296-300`). An OpenAI-compatible provider will not be the native Google provider for Google-specific options; prefer `createGoogle({ apiKey })`.

### Streaming and UI messages

- Server streaming pattern: convert UI messages to model messages, call `streamText`, return `result.toUIMessageStreamResponse()` (`vercel/ai content/cookbook/00-guides/01-rag-chatbot.mdx:490-507`). Better Agent matches this minimal pattern (`better-agent/apps/server/src/index.ts:83-88`).
- v6 migration removes `CoreMessage` and `convertToCoreMessages`; use async `convertToModelMessages` and `ModelMessage` (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:130-143`, `250-263`). Better Agent awaits conversion (`better-agent/apps/server/src/index.ts:83-85`); Better Chat currently calls `convertToModelMessages(mergedForModel)` without `await` (`apps/server/src/features/ai/completion.ts:137-145`), which should be audited during v6 upgrade.
- For persisted/resumable UI messages, pass `originalMessages` to `toUIMessageStreamResponse` to prevent duplicate assistant message IDs, and use `consumeSseStream: consumeStream` if abort-aware `onFinish` persistence is required (`vercel/ai content/docs/09-troubleshooting/13-repeated-assistant-messages.mdx:39-68`; `content/docs/09-troubleshooting/14-stream-abort-handling.mdx:10-44`, `59-70`). Better Chat already passes `originalMessages` and message metadata but does not show `consumeSseStream` (`apps/server/src/features/ai/completion.ts:148-173`).
- Client `useChat` v6 no longer accepts direct hook-level `headers/body/credentials`; use `new DefaultChatTransport(...)`, and pass dynamic values per `sendMessage` request to avoid stale captured values (`vercel/ai content/docs/09-troubleshooting/11-use-chat-custom-request-options.mdx:12-35`, `62-95`; `content/docs/09-troubleshooting/17-use-chat-stale-body-data.mdx:49-79`). Better Agent’s demo uses `DefaultChatTransport` (`better-agent/apps/web/src/routes/ai.tsx:14-18`).
- Structured generation changed in v6: `generateObject`/`streamObject` are deprecated in favor of `generateText`/`streamText` with `output: Output.object(...)` and `partialOutputStream` (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:152-248`). This matters for future Thinkspace artifacts/planning outputs.

## What to salvage from Better Chat

1. **Static catalog as a seed, not truth.** Keep `ModelDefinition` fields for `id`, display name, provider, access (`free|byok`), capabilities, context window, max output, and costs (`apps/server/src/features/models/types.ts`; `catalog.ts:3-257`). Add version/source metadata and review dates because model IDs/prices drift quickly.
2. **Access filtering and provider resolution.** Keep the `getUserAvailableModels`, `validateModelAccess`, and `resolveModelProvider` intent (`apps/server/src/features/models/utils.ts:20-109`). Rename around Better Agent domain: product-level model catalog + user/organization key availability + Thinkspace model policy, not “chat model picker.”
3. **Encrypted BYOK persistence.** Settings already stores `apiKeys: Record<string,string>` and migrates/encrypts them when `API_ENCRYPTION_KEY` exists (`apps/server/src/features/settings/types.ts:6-25`; `queries.ts`; `mutations.ts`; `utils.ts`). Salvage as a credential-source mechanism, but future domain should model this as Connected Account / credential reference plus Thinkspace Permission, not direct Thinkspace inheritance.
4. **Registry construction concept.** `createUserProviderRegistry` is close to the correct shape: build per-principal providers from app keys plus BYOK keys, wrap reasoning defaults, expose `provider:model` lookup (`apps/server/src/features/models/user-registry-factory.ts:275-328`). Refactor into a pure `resolveLanguageModel(config, credentialSource, env)` function usable by a Thinkspace Agent runtime.
5. **Usage metadata idea.** Better Chat attaches model ID and usage to UI stream metadata and records usage on finish (`apps/server/src/features/ai/completion.ts:153-209`). Preserve usage accounting as a runtime event/Audit Trail input, not as chat-route-only metadata.

## What to quarantine or discard

- **Quarantine `apps/server/src/features/ai/completion.ts` and `routes.ts`.** They embody the current request-scoped chat architecture: one HTTP request assembles model, tools, history, system prompt, persistence, title generation, usage, and cleanup (`completion.ts:40-215`; `routes.ts`). Use only as a behavior inventory.
- **Quarantine Better Agent `/ai` demo.** It is useful as a v6 smoke test, but it is explicitly a demo route at `app.post('/ai')` with a hard-coded Gemini model (`better-agent/apps/server/src/index.ts:73-89`) and a demo UI route (`better-agent/apps/web/src/routes/ai.tsx`). Do not promote it to the product runtime.
- **Quarantine global/default provider hacks.** `globalThis.AI_SDK_DEFAULT_PROVIDER = google` in production (`apps/server/src/features/models/providers.ts:12-14`) is not a safe model-resolution seam. Runtime code should receive explicit providers/credentials.
- **Replace Google OpenAI-compat BYOK.** The current Google BYOK implementation via `createOpenAI({ baseURL: generativelanguage.../openai/ })` (`providers.ts:73-79`; `user-registry-factory.ts:226-230`) conflicts with native Google provider options. Use `createGoogle({ apiKey })` unless a specific OpenAI-compatible mode is intentionally exposed as a separate provider.
- **Avoid chat-named persistent concepts.** `conversationId`, chat width/theme, UI chat transcript, and prompt-building should not define Thinkspace state. ADR-0001 and ADR-0002 place runtime-local messages, tool runs, approvals, and memory in the Thinkspace Agent runtime/DO, not a central request API.

## Future Thinkspace Agent runtime consumption model

Recommended PRD shape:

1. **Product control plane** exposes model catalog, available providers, BYOK/Connected Account setup status, and organization/user defaults.
2. **Thinkspace configuration** stores a model policy: selected `modelId`, allowed fallback model IDs, reasoning profile, token/output caps, cost/quota guardrails, and credential reference. It should not store raw API keys in the Thinkspace runtime state.
3. **Permission boundary** determines whether a Thinkspace Agent can use a user BYOK credential. A Connected Account/API key being present at product level is insufficient by itself; this follows the domain model and ADR-0004/0003 approval posture.
4. **Runtime model resolver** lives with or is called by the Thinkspace Agent runtime. It takes `(thinkspaceId, user/org identity, model policy, env bindings)` and returns an AI SDK `LanguageModel` plus metadata (`provider`, `modelId`, access source, reasoning config, context limits, cost class).
5. **Streaming stays runtime-owned.** The Thinkspace Agent runtime may use AI SDK `streamText`/`generateText`, tools, and UI message streams internally, but HTTP request handlers should only attach a client to a runtime session or subscribe to runtime events. They should not own the agent loop.
6. **Tool/model coupling remains scoped.** Enabled MCP servers/Skills/Connected Accounts should be resolved per Thinkspace per ADR-0004, then provided to `streamText` by the runtime, not inherited from global user settings.

## Version/breaking-change risks

- **v5 to v6 migration:** Better Chat’s `ai@^5.0.112` stack must be upgraded as a unit (`apps/server/package.json:20-30`). Use AI SDK’s v6 codemod and migration guide; replace removed `CoreMessage`/`convertToCoreMessages`, await `convertToModelMessages`, and audit renamed embedding APIs (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:16-49`, `130-143`, `416-418`).
- **Latest source is ahead of v6.** The studied `vercel/ai` repo was `7.0.0-canary.155`; v6 migration docs remain the stable baseline. Do not copy v7-canary-only APIs without checking installed versions.
- **Provider defaults changed:** OpenAI default calls use Responses API, not Chat Completions; Azure default also moved to Responses and requires `.chat()` for Chat Completions dependence (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:636-664`). This supports avoiding a legacy `/ai` chat-completion architecture.
- **Strict JSON schema:** OpenAI `strictJsonSchema` defaults true for JSON outputs/tool calls in v6; future structured artifact generation must handle schema rejection or opt out deliberately (`vercel/ai content/docs/08-migration-guides/24-migration-guide-6-0.mdx:580-625`).

## PRD acceptance criteria

1. **Model catalog service**
   - Lists free and BYOK models with provider, capabilities, context/output limits, cost metadata, source/review metadata, and v6-compatible provider IDs.
   - Does not expose raw API keys or request clients to model listing consumers.

2. **Credential/BYOK model resolution**
   - Given a user/org credential set and Thinkspace model policy, resolver returns the correct AI SDK `LanguageModel` for OpenAI, Anthropic, and Google using native provider factories (`createOpenAI`, `createAnthropic`, `createGoogle`).
   - BYOK models are unavailable without a matching credential/Permission; free/app-provided models use explicit Cloudflare env bindings.
   - Google native BYOK supports `providerOptions.google.thinkingConfig`; OpenAI and Anthropic reasoning options are provider-native.

3. **Runtime boundary**
   - No new product requirement depends on `POST /ai` owning model selection, message persistence, tool selection, title generation, or usage accounting.
   - Thinkspace Agent runtime owns streaming/generation and emits durable runtime events for messages, usage, tool runs, approvals, and Audit Trail.

4. **AI SDK v6 compliance**
   - Installed `ai` and all `@ai-sdk/*` packages are aligned on the v6 major generation.
   - Server code uses `streamText`/`generateText`, `convertToModelMessages` with v6 async semantics, `toUIMessageStreamResponse` only where UI stream transport is needed, and `DefaultChatTransport` on any React chat surface.
   - Structured outputs use `Output.object(...)` with `generateText`/`streamText`, not deprecated `generateObject`/`streamObject`.

5. **Tests/validation**
   - Unit tests cover model ID parsing, unknown model rejection, free/BYOK access filtering, provider-specific credential selection, and reasoning option mapping.
   - Integration/smoke tests prove one app-provided Google model, one OpenAI BYOK model, one Anthropic BYOK model, and one Google BYOK model can be resolved and used for a minimal `generateText`/`streamText` call behind mocked or test credentials.
   - Regression test confirms no Google BYOK model is resolved through OpenAI compatibility unless explicitly configured as a separate compatibility provider.
   - Typecheck catches v5/v6 API drift, especially `convertToModelMessages` and provider package major mismatches.

## Citation index

- Local Better Chat model/catalog/settings: `apps/server/src/features/models/catalog.ts`, `providers.ts`, `user-registry-factory.ts`, `utils.ts`; `apps/server/src/features/settings/*`.
- Local Better Chat request-scoped AI route: `apps/server/src/features/ai/completion.ts`, `routes.ts`.
- Local Better Agent v6 demo: `/Users/oscargabriel/Developer/projects/better-agent/apps/server/src/index.ts`, `/apps/web/src/routes/ai.tsx`, root `package.json` catalog.
- Vercel AI SDK docs/source inspected via replicant: `vercel/ai` latest main/canary plus v6 migration docs, especially provider management, provider registry, migration guide 6.0, OpenAI/Anthropic/Google provider docs and source files cited above.
