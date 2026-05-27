# TanStack Router / Query / Start study for Better Agent web

Date: 2026-05-27

## Executive summary

Better Agent should keep the TanStack stack already present in `apps/web`: file routes, Router context for oRPC + QueryClient, route loaders that pre-warm TanStack Query with oRPC `queryOptions`, and TanStack Start server functions for same-origin user/session access. Better Chat's settings UI is salvageable, but should be ported as UI and query/mutation patterns, not as product language: rename chat/workspace/task concepts to Thinkspace/Goal/Permission/Connected Account per `CONTEXT.md`, and avoid carrying Better Chat route/copy strings.

Key shaping recommendations:

1. Model app-private areas as a pathless authenticated layout (for example `routes/_authenticated.tsx`) with child routes for Thinkspaces and settings. TanStack Router file naming supports `_` pathless layout files; `beforeLoad` runs top-down and can stop children before they load.
2. Put the auth redirect in `beforeLoad`, not a subsequent `loader`. Better Agent's current `/dashboard` route fetches `getUser()` in `beforeLoad` but redirects from `loader`; docs identify `beforeLoad` as the route guard stage and state that throwing there prevents child loading.
3. Use loader + Query integration consistently: route loader calls `context.queryClient.ensureQueryData(context.orpc.*.queryOptions(...))`, component reads the same query via `useSuspenseQuery` or `useQuery`. Better Chat already uses this pattern on settings models/usage, and Better Agent already configures `defaultPreloadStaleTime: 0` plus `setupRouterSsrQueryIntegration`.
4. Treat Start server functions as protected RPC endpoints, not protected-by-route UI helpers. Route guards are UX only; enforce auth in `createServerFn` middleware/handler for every sensitive function and keep CSRF/same-origin concerns explicit.
5. Align versions before a PRD becomes implementation work. Better Agent has newer Router/Start/Query ranges than Better Chat; Better Chat lacks `@tanstack/react-start` and `@tanstack/react-router-ssr-query`. Do not salvage Better Chat's router wiring wholesale into Start SSR without adding the Start document/root requirements.

## Evidence from latest TanStack source/docs

### Router: file routes, context, loaders, auth guards

- File-based routing is the recommended Router mode. Latest Router docs call it the “preferred and recommended” route configuration and require each route file to export a named `Route`; `createFileRoute(path)` is generated/updated by `tsr generate`/`tsr watch` (`docs/router/routing/file-based-routing.md:5-17`, `docs/router/api/router/createFileRouteFunction.md:5-17`).
- File naming matters: `__root.tsx` is root; `.` nests; `$` creates params; `_` prefix creates pathless layout routes; `index` matches the parent exactly; `(folder)` groups without URL effect; `-` excludes files/folders from routing (`docs/router/routing/file-naming-conventions.md:5-18`).
- Router creation should import generated `routeTree` and register the router type via module augmentation (`docs/router/guide/creating-a-router.md:33-76`). Both Better Agent and Better Chat follow this broadly: Better Agent imports `routeTree` and registers `ReturnType<typeof getRouter>` (`better-agent/apps/web/src/router.tsx:5-30`); Better Chat imports `routeTree` and registers `typeof router` (`better-chat/apps/web/src/main.tsx:8-40`).
- Loader lifecycle: route matching runs top-down, `beforeLoad` runs serially, then `loader` and `component.preload` run in parallel (`docs/router/guide/data-loading.md:12-27`). Loader args include `abortController`, `context`, `deps`, `location`, `params`, `preload`, and more (`docs/router/guide/data-loading.md:80-98`).
- Auth guard best practice: `beforeLoad` receives the same args as loaders, is the correct place to check auth, runs before child `beforeLoad`s, and throwing in `beforeLoad` stops children from loading (`docs/router/guide/authenticated-routes.md:10-28`). The docs' redirect pattern throws `redirect({ to: '/login', search: { redirect: location.href } })` and explicitly says to use `location.href` for the post-login target (`docs/router/guide/authenticated-routes.md:30-54`).
- Context is the dependency injection seam. Typed root context uses `createRootRouteWithContext<T>()`; initial context is passed to `createRouter({ context: ... })`; objects returned by parent `beforeLoad` merge into descendant loader context (`docs/router/guide/data-loading.md:322-429`).

### Query: query options, ensure/prefetch, suspense, invalidation

- Prefer reusable `queryOptions(...)` factories or generated equivalents. TanStack Query docs say `queryOptions` preserves TypeScript inference while returning the passed object at runtime; source confirms `export function queryOptions(options: unknown) { return options }` (`docs/framework/react/guides/query-options.md:6-30`, `packages/react-query/src/queryOptions.ts:42-75`). oRPC's generated `orpc.*.queryOptions()` is the local equivalent and is already used in both projects.
- Use route loaders as preloading layers to avoid component waterfalls. Query docs show Router loaders using `queryClient.prefetchQuery(...)` and awaiting critical prefetches (`docs/framework/react/guides/prefetching.md:366-415`).
- Use `ensureQueryData` when a loader should return cached data if present and fetch only on cache miss. Docs state it ignores `staleTime` for available cache data; Query source reads `query.state.data`, calls `fetchQuery` only if undefined, and can background `prefetchQuery` with `revalidateIfStale` (`docs/framework/react/guides/prefetching.md:23-30`, `packages/query-core/src/queryClient.ts:140-161`).
- Suspense route pages can read warmed data with `useSuspenseQuery`; docs guarantee defined `data` and move loading/error handling to Suspense/error boundaries. Caveat: suspense queries cannot be conditionally enabled/disabled, and background refetch errors do not throw if stale data exists by default (`docs/framework/react/guides/suspense.md:6-58`, `packages/react-query/src/useSuspenseQuery.ts:23-32`).
- After mutations, invalidate precise related query keys. Docs recommend `queryClient.invalidateQueries` in mutation callbacks; returning/awaiting a Promise in `onSuccess` keeps the mutation pending until invalidation completes (`docs/framework/react/guides/invalidations-from-mutations.md:18-49`). Source shows invalidation marks matches invalid and refetches active queries by default (`packages/query-core/src/queryClient.ts:287-310`).
- SSR baseline is per-request QueryClient, prefetch in loader, dehydrate, and hydrate with `HydrationBoundary`; docs recommend `staleTime > 0` for SSR to avoid immediate client refetch (`docs/framework/react/guides/ssr.md:47-71`, `docs/framework/react/guides/ssr.md:168-180`, `docs/framework/react/guides/ssr.md:535-548`).

### Router + Query SSR integration

- Router's Query integration package is `@tanstack/react-router-ssr-query`. It provides QueryClient dehydration/hydration, streaming, redirect handling for redirects thrown by queries/mutations, and optional QueryClientProvider wrapping (`docs/router/integrations/query.md:5-24`).
- Recommended route pattern: put `queryClient` in router context, call `context.queryClient.ensureQueryData(postsQuery)` in a route loader, then read via `useSuspenseQuery(postsQuery)` in the component (`docs/router/integrations/query.md:149-178`).
- If an external cache such as TanStack Query handles loader freshness, set Router `defaultPreloadStaleTime: 0` so every preload/load/reload invokes the loader and lets Query dedupe (`docs/router/guide/data-loading.md:309-320`). Better Agent already does this (`better-agent/apps/web/src/router.tsx:13`).

### Start: server functions, security, root document

- TanStack Start is present in the Router monorepo and exports `createServerFn`, `createMiddleware`, `createStart`, `createCsrfMiddleware`, `Hydrate`, and related APIs from `@tanstack/react-start` (`packages/react-start/src/index.ts:1-29`). Better Agent already imports `createServerFn` from `@tanstack/react-start` for `getUser` (`better-agent/apps/web/src/functions/get-user.ts:1-7`).
- `createServerFn` supports only `GET | POST`, defaults missing `method` to `GET`, and is compiler/AST-transform managed; source comments note the handler signature changes due to Babel/plugin transformation (`packages/start-client-core/src/createServerFn.ts:77-126`, `packages/start-client-core/src/createServerFn.ts:386-544`).
- Start docs warn that server functions are same-origin RPC endpoints and browser requests should be verified with Fetch Metadata, `Origin`, or `Referer`; `createCsrfMiddleware` is shown in `createStart` request middleware (`docs/start/framework/react/guide/server-functions.md:25-46`).
- Auth must be enforced in the server function, not only the route. Router docs warn that route guards do not protect server functions; Start docs repeat that auth middleware must be applied to every server function needing auth (`docs/router/guide/authenticated-routes.md:6-8`, `docs/start/framework/react/guide/server-functions.md:398-400`).
- Start root documents should render `HeadContent` in `<head>` and `Scripts` before `</body>`; docs say `Scripts` should always be included for proper functionality (`docs/start/framework/react/guide/routing.md:74-135`). Better Agent's root route follows this Start document shape (`better-agent/apps/web/src/routes/__root.tsx:1-56` inspected; includes `HeadContent`, `Outlet`, and `Scripts`). Better Chat's current Vite-only root does not (`better-chat/apps/web/src/routes/__root.tsx:28-55`).

## Local integration map

### Better Agent current seams

- `apps/web/src/router.tsx` creates the router with `{ orpc, queryClient }` context, generated `routeTree`, `scrollRestoration`, `defaultPreloadStaleTime: 0`, a default pending component, and `setupRouterSsrQueryIntegration` (`better-agent/apps/web/src/router.tsx:8-21`). This is the correct seam for Thinkspace loader prefetches.
- `apps/web/src/utils/orpc.ts` creates a singleton QueryClient with toast-on-query-error, oRPC RPCLink with `credentials: "include"`, and `createTanstackQueryUtils(client)` (`better-agent/apps/web/src/utils/orpc.ts` inspected). This gives every route typed `context.orpc.*.queryOptions()`.
- `apps/web/src/functions/get-user.ts` defines a Start server function with `authMiddleware` and returns `context.session` (`better-agent/apps/web/src/functions/get-user.ts:1-7`). Good security direction; ensure every sensitive server function/mutation uses equivalent middleware.
- `apps/web/src/routes/dashboard.tsx` currently uses `beforeLoad` to fetch session and `loader` to redirect if absent (`better-agent/apps/web/src/routes/dashboard.tsx:23-35`). Shift this to a single `beforeLoad` guard so child Thinkspace routes never load when unauthenticated and so the redirect can include `search: { redirect: location.href }`.
- `apps/web/src/routes/index.tsx` uses direct `useQuery(orpc.healthCheck.queryOptions())`; fine for non-critical home status. For Thinkspace pages, prefer loader prefetch plus component read to avoid flashes.

### Better Chat salvage seams

- Better Chat's router context already has `orpc`, `queryClient`, `authClient`, and `auth`, and wraps the tree in `QueryClientProvider` (`better-chat/apps/web/src/main.tsx:10-23`). This validates the local pattern of passing auth/query dependencies through Router context.
- Better Chat's root route declares typed context and global error/not-found components (`better-chat/apps/web/src/routes/__root.tsx:21-32`). If moving into Better Agent Start SSR, keep the typed context idea but use the Better Agent document root with `HeadContent`/`Scripts`.
- `lib/route-guards.ts` uses `queryClient.ensureQueryData` to dedupe `authClient.getSession()` and redirects unauthenticated users with `search.redirect` based on `location.href`/`pathname` (`better-chat/apps/web/src/lib/route-guards.ts:11-72`). This is worth salvaging conceptually, but adapt to Better Agent's Start `getUser`/session source and `/login` route unless auth routes are renamed.
- `routes/settings/route.tsx` is a good settings shell: authenticated `beforeLoad`, base `/settings` redirect to `/settings/profile`, `errorComponent`, `pendingComponent`, mobile sheet nav, desktop sticky nav, child `Outlet`, and `preload="intent"` on nav links (`better-chat/apps/web/src/routes/settings/route.tsx:24-40`, `:78-97`, `:127-140`). Salvage layout mechanics; rewrite copy and constants.
- Settings child pages show useful Query patterns:
  - Models route preloads models and settings in `loader` via `context.queryClient.ensureQueryData(context.orpc.*.queryOptions())` (`better-chat/apps/web/src/routes/settings/models.tsx:24-37`).
  - `useUserSettings` consolidates settings query with 5-minute `staleTime`, disabled refetch-on-focus/mount, and placeholder chat width (`better-chat/apps/web/src/hooks/use-user-settings.ts:24-67`). Salvage the consolidated settings query pattern; remove chat-specific default fields or rename them for Better Agent.
  - `useUpdateUserSettings` uses optimistic updates, rollback, and precise `setQueryData` for `orpc.settings.get.queryKey({})` (`better-chat/apps/web/src/hooks/use-user-settings.ts:72-133`). Salvage this mutation shape.

## Recommended route shape for Thinkspace dashboard/create/detail

Use file routes that reflect domain language. Avoid user-facing “chat”, “workspace”, “project”, or “task” names from Better Chat lineage.

Suggested Start/Router tree:

```text
routes/__root.tsx                         # Start document: HeadContent, Outlet, Scripts
routes/index.tsx                          # public landing / coordinator entry
routes/login.tsx                          # auth, or routes/auth/sign-in.tsx if product chooses auth/*
routes/_authenticated.tsx                 # pathless auth layout; beforeLoad gets session
routes/_authenticated/thinkspaces.route.tsx      # /thinkspaces shell/dashboard layout
routes/_authenticated/thinkspaces.index.tsx      # /thinkspaces list/dashboard
routes/_authenticated/thinkspaces.create.tsx     # /thinkspaces/create creation flow
routes/_authenticated/thinkspaces.$thinkspaceId.tsx # /thinkspaces/$thinkspaceId detail shell
routes/_authenticated/settings.route.tsx          # /settings salvaged settings shell
routes/_authenticated/settings.profile.tsx        # /settings/profile etc., or nested directory equivalent
```

Alternate directory form is also acceptable:

```text
routes/_authenticated/thinkspaces/route.tsx
routes/_authenticated/thinkspaces/index.tsx
routes/_authenticated/thinkspaces/create.tsx
routes/_authenticated/thinkspaces/$thinkspaceId.tsx
```

Implementation notes:

- The `_authenticated` file/folder gives a pathless layout (no URL segment) and centralizes the auth guard. It should return `{ session }` from `beforeLoad` so descendants can read it from route context.
- `beforeLoad` should redirect unauthenticated users to `/login` with `search: { redirect: location.href }`.
- Thinkspace detail should validate params/search and preload critical queries:
  - `thinkspace.byId` / `thinkspace.summary`
  - permissions for the Thinkspace
  - current artifacts/audit summary if the shell needs them above the fold
- Creation flow should be named around creating a Thinkspace around a **Goal**, not creating a “chat”, “task”, or “agent”. Route copy should say “Create Thinkspace”, “Goal”, “Sources”, “Permissions”, “Coordinator”, and “Thinkspace Agent”.
- Use `getRouteApi('/_authenticated/thinkspaces/$thinkspaceId')` or route-local `Route.useLoaderData()` for route data to avoid circular imports where shared components need route APIs.

## Settings/auth UI salvage guidance

Salvage from Better Chat:

- Settings shell responsive layout and nav behavior.
- Profile/account page structure, session manager, sign out/delete account controls if auth APIs match.
- Providers/API-key rows as a starting point for **Connected Accounts** and product-level credentials.
- Model rows as a starting point for model availability/preferences, but frame as available models for Thinkspace Agents, not “chat models”.
- Tools/MCP UI as a starting point for **Permissions** and local/resource access, but split product-level Connected Account setup from Thinkspace-scoped Permission grants.
- Optimistic settings update hook and query invalidation patterns.

Do not salvage unchanged:

- `better-chat:open-settings` custom event name in settings shell (`better-chat/apps/web/src/routes/settings/route.tsx:59-69`). Rename or remove.
- “Chat Width”, “conversation layout”, “web search for current events”, “No MCP Servers Configured ... documentation search capabilities”, and any “Better Chat” copy. These collide with Better Agent domain language.
- Better Chat route names `/chat`, `/auth/sign-in`, and settings constants without a naming review. Better Agent currently uses `/login` and `/dashboard`; the PRD should choose one auth URL and Thinkspace routes deliberately.
- Global `queryClient.invalidateQueries()` after many settings mutations where precise query keys exist. Prefer targeted invalidation or direct `setQueryData` for settings, models, permissions, and Thinkspace lists.

## Dependency/version risks

- Replicant observed Router source package `@tanstack/react-router` `1.170.8`; Better Agent declares `^1.168.22` and `@tanstack/react-start` `^1.167.41`, while Better Chat declares older Router `^1.141.1` and no Start/SSR Query package (`better-agent/apps/web/package.json:19-23`, `better-chat/apps/web/package.json:26-28`, `:52-54`). Align Better Agent Router, Router plugin, Router devtools, Start, and `react-router-ssr-query` as a set.
- Replicant observed Query source package `@tanstack/react-query` `5.90.20`; Better Chat declares `^5.90.12`; Better Agent declares `^5.99.0` (`better-chat/apps/web/package.json:27`, `better-agent/apps/web/package.json:20`). Verify actual resolved lockfile versions before relying on new Query option types. TanStack Query docs warn type changes can ship in patch releases and recommend pinning exact patches if type stability matters (`docs/framework/react/typescript.md:8-13`).
- Deprecated Router class APIs: `Route` and `Router` classes are deprecated and will be removed next major; use `createRoute`/`createRouter` (`docs/router/api/router/RouteClass.md:5-8`, `docs/router/api/router/RouterClass.md:5-8`). Local code uses modern factory APIs.
- Splat params: v1 still accepts `*` for backward compatibility, but v2 will remove it; use `_splat` (`docs/router/routing/routing-concepts.md:238-250`). Avoid introducing `*` routes for Sources/files.
- Start server functions depend on compiler transforms; avoid deep imports or wrapper abstractions that hide `createServerFn(...).middleware(...).handler(...)` from the plugin (`packages/start-client-core/src/createServerFn.ts:120-126`).
- SSR QueryClient lifetime: Query SSR docs recommend per-request QueryClient. Better Agent currently exports a singleton `queryClient` from `utils/orpc.ts` and uses it in `getRouter()` (`better-agent/apps/web/src/router.tsx:6-20`). Confirm the Start app creates isolated router/query clients per request, or adjust before shipping authenticated SSR data.

## Concrete PRD acceptance criteria

1. **Routing/domain naming**
   - Routes for durable work use “Thinkspace” language in path/copy (`/thinkspaces`, `/thinkspaces/create`, `/thinkspaces/$thinkspaceId` or approved equivalent).
   - No new user-facing copy says “chat”, “thread”, “workspace”, “project”, “task”, or “agent” where `CONTEXT.md` prescribes Thinkspace/Goal/Coordinator/Thinkspace Agent.
   - File routes are generated by TanStack Router plugin/CLI and `routeTree.gen.ts` is not manually edited.

2. **Auth guards**
   - A pathless authenticated route/layout protects Thinkspace and settings routes via `beforeLoad`.
   - Unauthenticated access redirects to the chosen login route with a sanitized `redirect` search param based on `location.href`.
   - Sensitive Start server functions and oRPC procedures enforce auth server-side; tests or code review confirm route guards are not the only protection.

3. **Data loading and Query**
   - Critical Thinkspace dashboard/detail/settings data is prefetched in route loaders with `context.queryClient.ensureQueryData(context.orpc.*.queryOptions(...))`.
   - Components consume the same query options with `useSuspenseQuery` or `useQuery` without duplicate ad-hoc keys.
   - Mutations update/invalidate precise query keys; global `invalidateQueries()` is only used where intentionally broad.
   - Loader-dependent search params use `validateSearch`/`loaderDeps` rather than reading arbitrary search values inside loaders.

4. **Start/SSR integration**
   - Root document includes `HeadContent`, `Outlet`, and `Scripts` for Start SSR.
   - Query SSR integration is configured once with the app router and QueryClient; provider wrapping is not duplicated.
   - QueryClient/request isolation for authenticated SSR is explicitly verified.
   - CSRF/same-origin middleware is included for server functions or documented as handled by the deployment/runtime layer.

5. **Settings salvage**
   - Better Chat settings shell is ported with Better Agent branding and domain copy.
   - Product-level Connected Accounts are not presented as Thinkspace Permissions; Thinkspace Permission UI is scoped by Thinkspace.
   - Chat-specific settings defaults (chat width, selected chat model, web search wording) are either removed, renamed, or justified as Better Agent preferences.
   - Existing responsive behavior, loading skeletons, error components, and optimistic settings updates remain functional after port.

6. **Version alignment**
   - `@tanstack/react-router`, `@tanstack/router-plugin`, Router devtools, `@tanstack/react-start`, `@tanstack/react-router-ssr-query`, and `@tanstack/react-query` resolved versions are recorded in the PR/issue.
   - Any upgrade from Better Chat's Router `^1.141.1` patterns is tested with generated route types, loaders, redirects, and settings links.
