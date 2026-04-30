# Claude Code Prompt — Mobile Hygiene Pass (Logging, Startup)

_Targets: `apps/mobile/src/api/client.ts`, `apps/mobile/App.tsx`, `apps/mobile/src/utils/network.ts`. Run in a fresh Claude Code session with `/clear`. **Use Sonnet** — three small, isolated changes. Bundled because they're all in the same "mobile startup + transport" surface area and small enough that splitting them is more overhead than value._

---

## Context

Three small issues identified in code review, grouped because they're all in the mobile startup + transport layer and individually too small to justify their own session.

1. **`client.ts` logs every request and response with `console.log`** while using `logger.warn` for actual problems. Inconsistent and noisy in production.
2. **`App.tsx` does a health-check fetch to `https://vergo-app.fly.dev/health` on every cold start**, blocking 0–5s on Fly.io cold starts, and only logs the result.
3. **`initNetwork()` calls `checkIsConnected()` *and* subscribes to `NetInfo`** on startup. The `NetInfo` listener fires on subscribe with the same value, so the explicit check is redundant.

## Task

### 1. Logging consistency in `client.ts`

In `apps/mobile/src/api/client.ts`:
- Find the `console.log` calls in the request and response interceptors (there will be one or two — typically logging method/URL on request and status on response).
- Replace each with `logger.debug(...)` using the existing `logger` import (or add the import if missing). Keep the same message content.
- Do **not** change `logger.warn`, `logger.error`, or any other existing logger usage.
- Do **not** add new log lines.

If `logger.debug` doesn't exist on the logger utility, check `apps/mobile/src/utils/logger.ts`. If only `log`/`warn`/`error` exist, add a `debug` method that no-ops in production (similar to whatever `log` does, but at debug level). If that adds friction, fall back to `logger.log` instead of inventing a new method — but flag the choice in the wrap-up note.

### 2. Remove startup health check

In `apps/mobile/App.tsx`:
- Find the block that calls `fetch('https://vergo-app.fly.dev/health')` (or similar) during app initialization.
- Remove it entirely. Do not replace it with a deferred version — the result was only logged, so it provides no functional value.
- If the surrounding code uses the result (e.g. branches on it), confirm there are no consumers and remove cleanly.

### 3. Remove redundant connectivity check

In `apps/mobile/src/utils/network.ts`:
- Find `initNetwork()` and the `checkIsConnected()` call inside it.
- The `NetInfo.addEventListener` subscription fires once on subscribe with the current state — relying on that is sufficient. Remove the explicit `await checkIsConnected()` call inside `initNetwork()`.
- **Do not delete the `checkIsConnected()` function itself** — it may be called elsewhere (e.g. for explicit "are we online right now" checks in offline action queue replay). Verify there are other call sites; if none exist, you can delete the function. If there are, leave it.
- Update any types or return values affected by removing the await — the function should still resolve in a way that doesn't break callers of `initNetwork()`.

## Verification

1. From `apps/mobile`: `npm run typecheck` and `npm run lint` — must pass clean.
2. From `apps/mobile`: `npm test` — must pass clean.
3. Skim `App.tsx` and confirm no fetch to `/health` remains.
4. Skim `client.ts` and confirm no `console.log` remains in interceptors.
5. Skim `network.ts` and confirm `initNetwork` doesn't `await checkIsConnected`.

## Out of scope

- Don't touch the response interceptor's refresh logic (handled by the single-flight prompt).
- Don't change the `BackendResponse` shape or any API contract.
- Don't refactor the logger utility beyond optionally adding a `debug` method.
- Don't add Sentry breadcrumbs, performance traces, or any other observability — separate concern.
- Don't remove `console.error` or `console.warn` anywhere; they're not in scope.

## Deliverable

Edits to:
- `apps/mobile/src/api/client.ts`
- `apps/mobile/App.tsx`
- `apps/mobile/src/utils/network.ts`
- (optionally) `apps/mobile/src/utils/logger.ts` if `debug` needs adding

Brief note at the end of the run on:
- Whether `logger.debug` already existed or was added.
- Whether `checkIsConnected` had other call sites and was retained, or had none and was deleted.
- Confirmation that no `App.tsx` startup logic now depends on a `/health` result.
