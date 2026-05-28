# MCP TypeScript SDK / protocol study for Better Agent MCP salvage

_Date: 2026-05-27_

## Executive summary

Better Chat has useful MCP catalog and connection code, but it currently models MCP enablement as a **user/global chat setting** and automatically exposes enabled MCP tools to every completion. For Better Agent, salvage this as a **product-level MCP server catalog/connection registry**, not as Thinkspace tool access. ADR 0004 requires that catalog items are not exposed to any Thinkspace Agent by default and are enabled only for a Thinkspace Goal under Permissions/Approval policy (`docs/adr/0004-thinkspace-scoped-tool-enablement.md:3`). ADR 0003 requires external mutations to become drafts or explicit Approvals even when a Permission exists (`docs/adr/0003-draft-or-approval-for-external-mutations.md:3`).

Concretely:

- Keep the built-in server metadata, custom-server CRUD, and MCP client adapter ideas.
- Remove Better Chat's default `context7` auto-enable everywhere (`apps/server/src/features/tools/mcp/types.ts:26`, `apps/server/src/db/d1/schema/settings.ts:11`, `apps/server/src/features/settings/types.ts:21`).
- Do not store arbitrary MCP headers as plaintext JSON (`apps/server/src/db/d1/schema/settings.ts:38`, `apps/server/src/features/tools/mcp/mutations.ts:25`). Treat API keys/tokens like Connected Account credentials or encrypted secrets, with redacted UI.
- Replace global `enabledMcpServers` / `enabled` with two boundaries:
  1. **Catalog/connectivity boundary**: which MCP servers exist and which credentials are connected at product/user/org scope.
  2. **Thinkspace enablement boundary**: which specific server tools are exposed to one Thinkspace Agent for one Goal, governed by Permissions and Approval policies.
- Prefer current production SDK line `@modelcontextprotocol/sdk` v1.x / AI SDK's current `createMCPClient` integration until MCP TS SDK v2 stabilizes. The TypeScript SDK `main` branch is v2 pre-alpha, split into `@modelcontextprotocol/client` and `@modelcontextprotocol/server`, and its README says v1.x remains recommended for production until stable v2 (Q1 2026 target). Better Chat is currently on `@modelcontextprotocol/sdk` `^1.24.3` and `@ai-sdk/mcp` `^0.0.12` (`apps/server/package.json`).

## Upstream MCP SDK and protocol findings

### Version/package alignment

- Latest SDK source `main` is v2 pre-alpha and split packages (`@modelcontextprotocol/client`, `@modelcontextprotocol/server`); README explicitly warns that v1.x remains recommended for production while v2 is in development.
- Better Chat currently imports official v1 package paths such as `@modelcontextprotocol/sdk/client/streamableHttp.js` and AI SDK's MCP adapter (`apps/server/src/features/tools/mcp/client.ts:1-5`).
- PRD implication: make the dependency decision explicit:
  - **Near-term salvage**: keep v1-compatible imports and AI SDK adapter if the target Better Agent AI runtime remains AI SDK.
  - **Future migration**: track v2 split-package migration separately; do not bake v2 pre-alpha APIs into a PRD as immediate implementation requirements.

### Client/transports

Official current patterns:

- MCP protocol defines two standard transports: stdio and Streamable HTTP; Streamable HTTP uses HTTP POST for messages and optional GET/SSE for server-to-client messages. Clients should support stdio where possible, but for a web/server product, remote production integrations should be HTTP.
- TypeScript SDK v2 client guide imports `Client`, `StreamableHTTPClientTransport`, `SSEClientTransport`, and `StdioClientTransport` (`docs/client.md:15-31` in upstream clone). Remote HTTP connection pattern is `new Client(...); new StreamableHTTPClientTransport(new URL(...)); await client.connect(transport)` (`docs/client.md:36-45`).
- SDK docs recommend trying Streamable HTTP first and falling back to legacy SSE for backwards compatibility (`docs/client.md:65-87`). Protocol docs likewise describe legacy HTTP+SSE as deprecated/backwards-compatible and recommend Streamable HTTP first.
- SDK Streamable HTTP transport options include `authProvider`, `requestInit`, custom `fetch`, reconnection options, `sessionId`, and `protocolVersion` (`packages/client/src/client/streamableHttp.ts:111-164`). It injects bearer tokens from `authProvider.token()` on every request, session id, and negotiated protocol version headers (`packages/client/src/client/streamableHttp.ts:212-231`). It also sends `content-type: application/json` and ensures `accept: application/json, text/event-stream` on POST (`packages/client/src/client/streamableHttp.ts:543-557`).
- The transport captures `mcp-session-id` from responses (`packages/client/src/client/streamableHttp.ts:559-563`) and supports explicit session termination via DELETE (`packages/client/src/client/streamableHttp.ts:701-748`). SDK client docs recommend `await transport.terminateSession(); await client.close()` for Streamable HTTP shutdown (`docs/client.md:89-100`).

Local Better Chat alignment/gaps:

- Local code uses `StreamableHTTPClientTransport` for `type === "http"`, passing headers through `requestInit.headers`, and a plain AI SDK SSE config otherwise (`apps/server/src/features/tools/mcp/client.ts:131-147`). This is aligned with HTTP-first production guidance but lacks automatic Streamable HTTP -> legacy SSE fallback.
- Local client cleanup is present via `closeMCPClients` and called in stream `onFinish` (`apps/server/src/features/tools/mcp/client.ts:221-237`, `apps/server/src/features/ai/completion.ts:173-199`). Risk: if stream errors before `onFinish`, clients may leak; a PRD should require cleanup on abort/error/cancel as well as normal finish.
- Current web UI correctly labels HTTP as recommended and SSE as legacy-compatible (`apps/web/src/routes/settings/-components/tools/add-mcp-server-dialog.tsx:95-114`).

### Tool listing/calling

Official protocol/API patterns:

- Tools are **model-controlled**: language models can discover and invoke them automatically, though applications choose their own UX. This makes scoped enablement and user-visible boundaries essential.
- Protocol `tools/list` is paginated and returns tool entries with `name`, optional `title`, `description`, `inputSchema`, optional `outputSchema`, and annotations. Protocol `tools/call` invokes one tool with arguments and returns `content`, optional `structuredContent`, and `isError`.
- SDK client guide says to loop on `nextCursor` for `listTools`, then call `client.callTool({ name, arguments })` (`docs/client.md:214-238`). SDK `Client.listTools()` caches tool metadata/output schema validators (`packages/client/src/client/client.ts:961-994`). SDK `Client.callTool()` validates structured output when a tool declares `outputSchema`, and distinguishes `result.isError` tool-level failures from thrown protocol/SDK errors (`packages/client/src/client/client.ts:823-909`).
- AI SDK `createMCPClient`/`experimental_createMCPClient` is a lightweight adapter designed for tool conversion. AI SDK docs say `tools()` fetches tools and converts them to AI SDK tools, `schemas` can restrict to explicit tools, and clients should be closed after use. AI SDK docs also warn the lightweight client does not support all full-client features such as notifications/session/resumable streams.

Local Better Chat alignment/gaps:

- Local `getMCPTools()` calls `client.tools()` or `client.tools({ schemas })`, then prefixes tool names with `${serverId}_${toolName}` to avoid collisions (`apps/server/src/features/tools/mcp/client.ts:172-204`). Good salvage: keep deterministic namespace/prefixing, but maintain original server/tool identity for audit and Permission matching.
- Local `schemas` support exists in `MCPServerConfig` (`apps/server/src/features/tools/mcp/types.ts:11`) and in `getMCPTools()` (`apps/server/src/features/tools/mcp/client.ts:179-184`). For Better Agent, this becomes an important allowlist seam: Thinkspace tool enablement should prefer explicit tool definitions/schemas instead of exposing a whole server catalog by default.
- Local schema normalization is model-provider workaround code (`apps/server/src/features/tools/mcp/client.ts:8-109`). It may be salvageable, but the PRD should treat it as an adapter layer under tests, not domain logic. Acceptance should verify output remains valid AI SDK tool schema for Google/Gemini and does not mutate stored catalog schemas.

## Secure header/storage concerns

Current Better Chat behavior stores custom MCP headers as JSON text in `user_mcp_servers.headers` (`apps/server/src/db/d1/schema/settings.ts:38`) and inserts `JSON.stringify(server.headers ?? {})` directly (`apps/server/src/features/tools/mcp/mutations.ts:25`). The add-server dialog accepts arbitrary header key/value pairs and renders the full values back in the browser (`apps/web/src/routes/settings/-components/tools/add-mcp-server-dialog.tsx:130-164`). This is not acceptable for Better Agent credentials.

Better Chat already has an encrypted API-key path for provider keys: `apiKeys` are encrypted with `API_ENCRYPTION_KEY` when present (`apps/server/src/features/settings/mutations.ts:71-90`) and decrypted/migrated on read (`apps/server/src/features/settings/queries.ts:19-28`). Salvage the encryption approach, not the plaintext MCP header storage.

Protocol/security implications:

- MCP Authorization says HTTP-based auth should follow OAuth 2.1/resource metadata; bearer access tokens must be sent in `Authorization: Bearer <access-token>` on every request and must not be in URI query strings. The SDK transport's `authProvider` is built for this pattern (`packages/client/src/client/streamableHttp.ts:111-129`, `212-217`).
- MCP security best practices warn server-side MCP clients about SSRF during OAuth discovery and recommend HTTPS, blocking private/reserved IP ranges, validating redirects, and egress controls.
- MCP security best practices forbid token passthrough: MCP servers must not accept tokens not issued for that MCP server. For Better Agent, never reuse a user's unrelated Connected Account token as a generic MCP bearer token unless it is explicitly minted/audience-bound for that MCP server.
- Streamable HTTP servers must validate Origin to prevent DNS rebinding, bind local servers to localhost, and implement auth. On the client/product side, adding arbitrary local/private URLs creates SSRF and local-network risk in a Cloudflare/server context.

PRD requirements:

- Store MCP credentials as encrypted secret records or Connected Account material, not in displayable `headers` JSON.
- UI should show only header names and redacted/last-four values; never echo full secret values after save.
- Prefer typed auth configuration: `none`, `bearerToken`, `apiKeyHeader`, `oauthProvider`, not arbitrary header bags. If arbitrary headers remain for advanced use, mark sensitive values and encrypt each value.
- Validate MCP server URLs: HTTPS by default; explicit dev-only exceptions for localhost; block private/link-local/metadata IPs for server-side Cloudflare deployment unless an admin allowlist exists.
- Use SDK `authProvider` for bearer/OAuth where possible rather than static `requestInit.headers`, so 401 refresh/upscope flows can be represented.

## Catalog vs Thinkspace enablement boundary

### What Better Chat does now

- Built-ins are global product metadata returned by `getBuiltInMCPServers()` (`apps/server/src/features/tools/mcp/catalog.ts:4-70`).
- User settings track `enabledMcpServers` globally (`apps/server/src/features/settings/types.ts:6-15`) and default to `context7` (`apps/server/src/features/tools/mcp/types.ts:26`; `apps/server/src/features/settings/types.ts:17-22`; `apps/server/src/db/d1/schema/settings.ts:11`).
- Custom servers have a row-level `enabled` boolean and default `enabled: true` on insert (`apps/server/src/features/tools/mcp/mutations.ts:26`, `apps/server/src/db/d1/schema/settings.ts:39`).
- Completion loads **all** globally enabled built-ins and enabled custom servers, converts their tools, merges with web search, and passes the whole set to `streamText` with `toolChoice: "auto"` (`apps/server/src/features/ai/completion.ts:74-107`, `137-144`).
- Settings UI toggles server enablement globally and warns only about context bloat (`apps/web/src/routes/settings/tools.tsx:180-214`).

### What Better Agent needs

Better Agent currently has only scaffold router entries (`/Users/oscargabriel/Developer/projects/better-agent/packages/api/src/routers/index.ts:1-8`); catalog/Permission routers are not implemented yet. Shape the PRD around adding these seams:

1. **MCP Server Catalog**
   - Product/org/user-scoped catalog of available MCP servers.
   - Contains metadata, transport type, URL, auth type, health/status, discovered capabilities, and discovered tools.
   - Built-ins live here, but no built-in is active in a Thinkspace by default.

2. **MCP Connection / Credential**
   - Product/user/Connected Account-like relationship containing encrypted credentials and OAuth state where applicable.
   - Connection means "Better Agent can connect/list this server for this user/org"; it does **not** grant any Thinkspace Agent access.

3. **Thinkspace Tool Enablement**
   - Per Thinkspace/Goal selection of specific server tools or constrained tool groups.
   - Generates the actual AI SDK toolset for that Thinkspace Agent.
   - Must support narrowing via explicit schemas/tool allowlist; default is empty.

4. **Permission**
   - Thinkspace-scoped allowance that constrains resource/action scope. For read-only docs MCPs, Permission may be "read documentation from server X/tool Y". For external mutation tools, Permission must specify resource and action.
   - A Connected Account or MCP Connection does not imply Permission, consistent with `CONTEXT.md` relationships.

5. **Approval**
   - Required for external mutations by default, even when Permission exists, unless a narrow standing Approval policy is configured (`docs/adr/0003-draft-or-approval-for-external-mutations.md:3-5`).
   - Tool calls should be classed as read-only vs mutating/risky. MCP `annotations` may help, but cannot be the only source of truth; admins/users may need to override risk classification.

## Approval / Permission implications by tool type

- **Discovery/listing** (`initialize`, `tools/list`) belongs to catalog/connection management. It should not be performed in the Thinkspace Agent prompt path unless needed. Discovery does not itself expose tools to the model.
- **Read-only tools** (documentation lookup, search) can be enabled for a Thinkspace with a Permission for that Source/resource. Calls should be logged to the Thinkspace Audit Trail, including server id, original tool name, prefixed model tool name, arguments (redacted), and result metadata.
- **Tools that can exfiltrate sensitive Thinkspace data** should require user-visible confirmation or stricter Permission even if read-only from the server's perspective, because MCP docs advise clients to show tool inputs before calling to avoid malicious/accidental data exfiltration.
- **External mutation tools** (write GitHub, send email, change infra, create tickets, update DB, invoke API) require a Permission plus an Approval/draft flow. Permission is not immediate execution authority (`docs/adr/0003-draft-or-approval-for-external-mutations.md:3`).
- **Unknown/unclassified tools** default to disabled or approval-required. The PRD should not trust remote tool descriptions as safety policy.

## Defaults to remove / change

Remove or change these Better Chat defaults during salvage:

- Remove `DEFAULT_ENABLED_MCP_SERVERS = ["context7"]` (`apps/server/src/features/tools/mcp/types.ts:26`). Default built-in enablement must be `[]`.
- Remove DB default `enabled_mcp_servers` = `["context7"]` (`apps/server/src/db/d1/schema/settings.ts:11`).
- Remove settings default that copies the default enabled list into each user (`apps/server/src/features/settings/types.ts:17-22`; `apps/server/src/features/settings/mutations.ts:18-20`).
- Remove custom MCP auto-enable on add (`apps/server/src/features/tools/mcp/mutations.ts:26`) or reinterpret it as "connected/catalog active", not Thinkspace exposed.
- Remove global chat/settings toggles as the determinant for runtime tool exposure. UI can configure catalog connections, but Thinkspace tool editor must separately enable tools for one Goal.
- Remove plaintext header echoing and storage (`apps/web/src/routes/settings/-components/tools/add-mcp-server-dialog.tsx:130-164`; `apps/server/src/db/d1/schema/settings.ts:38`).

## Salvage risks

- **SDK churn**: MCP TS SDK v2 is pre-alpha and split-package. Better Chat uses v1 import paths; pin versions and avoid unplanned v2 migration in the initial salvage PRD.
- **AI SDK lightweight client limits**: AI SDK MCP client is convenient for tool conversion but does not provide all full MCP client capabilities (notifications/session/resumable streams). If Better Agent needs tool list change notifications, resources/prompts, OAuth, or resumable long-running calls, PRD should specify whether to use full official `Client` for catalog discovery and AI SDK adapter only for final tool execution.
- **Client cleanup**: Better Chat closes clients on normal stream finish only. Better Agent must close/terminate on finish, error, abort, and timeout.
- **Credential leakage**: current arbitrary header UI/storage leaks secrets. This is the highest salvage blocker.
- **Global enablement semantics**: current `enabledMcpServers` and custom `enabled` booleans conflict with ADR 0004. Do not port unchanged.
- **Tool identity drift**: prefixed names are good for model collision avoidance, but permissions/audit must store canonical `{serverId, toolName}` plus model-facing alias.
- **Risk classification**: MCP tool metadata is descriptive, not sufficient as an authorization policy. Need product-level classification and admin/user overrides.
- **SSRF/local network exposure**: adding arbitrary remote MCP URLs from a server-side Cloudflare worker can target private networks or metadata endpoints during auth discovery or direct requests. Require URL/egress policy.

## Concrete acceptance criteria for PRD

1. **Catalog data model**
   - Product has an MCP server catalog with built-in and custom entries.
   - Built-ins from Better Chat can be represented, including Context7/Cloudflare/AWS/MS Learn/etc. metadata, but all have `enabledByDefaultForThinkspaces = false`.
   - Catalog entry stores transport type (`http`/legacy `sse`, future `stdio` only for Local Node), URL, description, health, discovered capabilities, and discovered tools.

2. **No default Thinkspace exposure**
   - New user/org/Thinkspace has zero MCP tools exposed until explicitly selected for a Thinkspace Goal.
   - Tests assert Context7 is not present in a new Thinkspace Agent toolset without explicit enablement.

3. **Connection/credential security**
   - MCP auth material is encrypted at rest or represented as a Connected Account/OAuth token record.
   - Saved headers/tokens are never returned in full through API or rendered in UI.
   - Arbitrary header support, if retained, stores each sensitive value encrypted and redacted.
   - HTTP auth uses `authProvider`/bearer semantics where possible; tokens are not placed in URLs.

4. **URL/SSRF controls**
   - Server-side MCP URL validation requires HTTPS by default.
   - Private, loopback, link-local, and cloud metadata IP ranges are blocked unless explicitly allowed for development/admin-controlled Local Node scenarios.
   - Redirects and OAuth metadata discovery are subject to the same policy.

5. **Tool discovery and allowlisting**
   - Discovery lists all pages of `tools/list` using cursor pagination or AI SDK equivalent.
   - Stored tool definitions include canonical server id/tool name, title/description, input schema, output schema, annotations, and discovered timestamp.
   - Thinkspace runtime only converts enabled canonical tools into AI SDK tools, with deterministic aliases and collision tests.

6. **Permission and Approval enforcement**
   - A Thinkspace tool cannot be used unless both enabled for that Thinkspace Goal and allowed by a Permission.
   - Mutating/risky tools produce drafts or Approval requests by default before execution.
   - Unknown risk tools default to disabled or approval-required.
   - Approval records include canonical tool id, arguments with secret redaction, user, timestamp, and resulting action/result.

7. **Runtime lifecycle**
   - MCP clients/transports close on normal completion, model/tool error, request abort, and timeout.
   - Streamable HTTP sessions call `terminateSession()` when the underlying transport supports it, then close.
   - Runtime has per-tool timeout/max timeout behavior and cancellation where supported.

8. **Audit trail**
   - Every MCP tool call visible to a Thinkspace Agent is recorded in the Thinkspace Audit Trail with server/tool identity, alias, arguments redacted, result status, error surface (`isError` vs protocol/SDK), and Approval id when applicable.

9. **Migration from Better Chat**
   - Existing Better Chat `enabledMcpServers` and custom `enabled` values are migrated only as catalog/connection preferences, not as Thinkspace tool grants.
   - Existing plaintext headers, if any, require migration into encrypted secret storage and immediate API redaction.

## Evidence / citations

- Better Chat built-in catalog: `apps/server/src/features/tools/mcp/catalog.ts:4-70`.
- Better Chat MCP adapter: `apps/server/src/features/tools/mcp/client.ts:111-237`.
- Better Chat default Context7 enablement: `apps/server/src/features/tools/mcp/types.ts:26`, `apps/server/src/db/d1/schema/settings.ts:11`, `apps/server/src/features/settings/types.ts:17-22`.
- Better Chat global runtime exposure: `apps/server/src/features/ai/completion.ts:74-107`, `apps/server/src/features/ai/completion.ts:137-144`.
- Better Chat plaintext headers: `apps/server/src/db/d1/schema/settings.ts:38`, `apps/server/src/features/tools/mcp/mutations.ts:25`, `apps/web/src/routes/settings/-components/tools/add-mcp-server-dialog.tsx:130-164`.
- Better Chat encrypted API-key path to salvage: `apps/server/src/features/settings/mutations.ts:71-90`, `apps/server/src/features/settings/queries.ts:19-28`.
- Better Agent domain: `CONTEXT.md` defines Connected Account, Permission, Approval, Thinkspace, and Audit Trail semantics.
- ADR 0003: `docs/adr/0003-draft-or-approval-for-external-mutations.md:3-5`.
- ADR 0004: `docs/adr/0004-thinkspace-scoped-tool-enablement.md:3-5`.
- Better Agent API scaffold: `/Users/oscargabriel/Developer/projects/better-agent/packages/api/src/routers/index.ts:1-8`.
- MCP TS SDK v2 README: `/tmp/pi-github-repos/modelcontextprotocol/typescript-sdk/README.md` notes main is v2 pre-alpha and v1.x is production-recommended.
- MCP TS SDK client guide: `/tmp/pi-github-repos/modelcontextprotocol/typescript-sdk/docs/client.md:36-100`, `114-167`, `214-270`.
- MCP TS SDK streamable HTTP source: `/tmp/pi-github-repos/modelcontextprotocol/typescript-sdk/packages/client/src/client/streamableHttp.ts:111-164`, `212-231`, `543-557`, `559-563`, `701-748`.
- MCP TS SDK client source: `/tmp/pi-github-repos/modelcontextprotocol/typescript-sdk/packages/client/src/client/client.ts:455-540`, `823-909`, `961-994`.
- Official MCP protocol docs: transports, lifecycle, tools, authorization, and security best practices fetched from `modelcontextprotocol.io` for 2025-06-18.
- AI SDK MCP docs: `createMCPClient`/`experimental_createMCPClient` docs describe lightweight tool conversion, schemas, HTTP/SSE/stdio transports, and cleanup requirements.
