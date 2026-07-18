<p align="center">
  <img src="./logo.png" width="180" alt="neko-lucia logo">
</p>

<h1 align="center">neko-lucia</h1>

<p align="center">Lucia v3 sessions, kept alive without dragging the old auth kitchen sink along.</p>

<p align="center">
  <a href="https://github.com/Ducheved/neko-lucia/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Ducheved/neko-lucia/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@ducheved/neko-lucia"><img alt="npm" src="https://img.shields.io/npm/v/%40ducheved%2Fneko-lucia?logo=npm"></a>
  <a href="https://www.npmjs.com/package/@ducheved/neko-lucia-adapter-drizzle"><img alt="adapter npm" src="https://img.shields.io/npm/v/%40ducheved%2Fneko-lucia-adapter-drizzle?label=adapter&logo=npm"></a>
  <img alt="Node 22, 24, and 26" src="https://img.shields.io/badge/Node-22.23.1%20%7C%2024.18.0%20%7C%2026-339933?logo=nodedotjs&logoColor=white">
  <img alt="Deno 2.9+" src="https://img.shields.io/badge/Deno-2.9%2B-000000?logo=deno&logoColor=white">
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

`neko-lucia` is an independent, session-only fork of [Lucia v3](https://github.com/lucia-auth/lucia/tree/v3). It keeps the familiar server-side session flow, adds split-secret v2 tokens, and ships the same ESM packages to Node and Deno. Password hashing, OAuth, JWTs, and app-specific identity logic stay in your app where they belong.

The release train starts at `0.1.0`. Current registry availability is shown by the npm badges above.

| Package | Job |
| --- | --- |
| [`@ducheved/neko-lucia`](./packages/lucia) | Session lifecycle, strict token parsing, cookies, and typed attributes |
| [`@ducheved/neko-lucia-adapter-drizzle`](./packages/adapter-drizzle) | Drizzle adapters for PostgreSQL, MySQL, and SQLite |

## What it supports

- Node.js 22.23.1, 24.18.0, and 26.x plus Deno 2.9+ from the same npm tarballs; CI pins both LTS baselines, the Node 26.0.0 floor, and Deno 2.9.3
- ESM only
- zero core runtime dependencies
- PostgreSQL 16 and 18, MySQL 8.4, and SQLite
- stock Lucia v3 session migration without a forced global logout
- strict TypeScript 7, Deno lint, and a CI ban on explicit `any`

## Install

```bash
pnpm add @ducheved/neko-lucia
pnpm add @ducheved/neko-lucia-adapter-drizzle drizzle-orm@0.45.2
```

Deno pulls those exact npm packages. No side build, no second package:

```ts
import { Lucia } from "npm:@ducheved/neko-lucia";
import { DrizzlePostgreSQLAdapter } from "npm:@ducheved/neko-lucia-adapter-drizzle";
```

The packages import and type-check in Deno. A live Deno database connection still depends on the Drizzle driver picked by your app.

## Quick start

```ts
import { Lucia } from "@ducheved/neko-lucia";
import { DrizzlePostgreSQLAdapter } from "@ducheved/neko-lucia-adapter-drizzle";

const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, userTable);

export const lucia = new Lucia(adapter, {
  sessionTokenVersion: 2,
  sessionCookie: {
    name: "__Host-auth_session"
  }
});

const created = await lucia.createSession(userId, {});
const setCookie = lucia.createSessionCookie(created.token).serialize();
const result = await lucia.validateSession(created.token);
```

`created.token` is the bearer credential. In v2, `created.id` is only the database key. Both fields are readonly. Session IDs, tokens, and cookie values stay readable but are non-enumerable, so an ordinary spread or `JSON.stringify()` does not copy them by accident.

That is a guardrail, not a force field. Keep tokens out of logs, traces, analytics, and audit payloads.

## Lucia v3 migration

The reader accepts two exact formats:

- v1: the stock Lucia v3 40-character lowercase Base32 credential
- v2: a 22-character public ID, a dot, and a 43-character secret

The writer mode is mandatory. Fresh apps use `sessionTokenVersion: 2`. Existing Lucia v3 apps use this order:

1. Audit every session consumer. Create cookies from `created.token`, validate the complete token read from the cookie or bearer input, and carry that input token through refresh code. Never rebuild a credential from `session.id`.
2. Add nullable `secret_hash` and non-null `token_version` with a default of `1` to the session table.
3. Deploy the whole fleet with those consumer changes and `sessionTokenVersion: 1`. The dual reader can now handle both formats, but new sessions still match Lucia v3.
4. Finish the rolling deploy and confirm no old process is left.
5. Switch the writer to `sessionTokenVersion: 2`.
6. Keep both columns and the dual reader until every v1 row has expired or been revoked.

The nasty bit: a v1 session ID is the bearer secret. Treat every ID as sensitive while mixed rows exist. A wrong v2 secret or token-version mismatch cannot refresh or delete the row. Expired and orphaned rows are cleaned up only after the token authenticates.

For rollback, keep this fork deployed and switch the writer back to v1. Do not roll back to stock Lucia after v2 rows exist unless those sessions have expired or been revoked. Custom legacy IDs are outside this compatibility path.

The exact Drizzle column shapes for PostgreSQL, MySQL, and SQLite are in the [adapter README](./packages/adapter-drizzle/README.md).

## Cookies

Defaults are `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. `HttpOnly` cannot be disabled through the constructor. `SameSite=None`, `__Host-`, and `__Secure-` settings are checked against browser rules. Duplicate copies of the session cookie are rejected instead of betting on first-wins or last-wins behavior.

Fresh apps should use `__Host-auth_session`. The `auth_session` fallback exists only to keep a Lucia v3 rolling migration from kicking everybody out.

## Release train

The repository stores an `x.y.0` release floor. A successful `main` CI run counts first-parent commits since the commit that introduced that floor and publishes `x.y.patch`. CI builds once, tests the exact tarballs in Node and Deno, uploads an immutable artifact, and the separate `Publish` workflow sends those same bytes to npm with provenance. It never checks out or rebuilds release code.

To start a minor line, manually change these four fields to the same next `x.y.0` value:

- root `package.json` version
- `packages/lucia/package.json` version
- `packages/adapter-drizzle/package.json` version
- the adapter's `@ducheved/neko-lucia` peer version

That commit publishes `.0`. Each successfully tested `main` head publishes the patch matching its first-parent position. Failed runs and batched pushes can leave gaps. Publish jobs are serialized; if an older run finishes late, it gets the `backfill` tag instead of moving `latest` backward.

For the one-time first publish, create a GitHub environment named `npm` and add `NPM_TOKEN` there. Once both packages exist on npm, configure each package's trusted publisher with owner `Ducheved`, repository `neko-lucia`, workflow `publish.yml`, and environment `npm`, then delete `NPM_TOKEN`. The workflow hard-fails if that bootstrap secret is still present after both package names exist, so later publishes cannot silently fall back from short-lived OIDC credentials.

## Working on it

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm verify
pnpm test:deno
pnpm audit --prod
```

`pnpm-lock.yaml` is the only workspace lockfile. Generated `dist`, `.test-dist`, tarballs, artifacts, and accidental npm lockfiles stay out of Git.

ESLint is deliberately on hold. The current stable `typescript-eslint` line does not support TypeScript 7, so a pretend-strict setup would buy noise instead of safety. Strict TypeScript, Deno lint, runtime contract tests, and the explicit-`any` gate are the rules for now.

Security reports go through [GitHub Security Advisories](https://github.com/Ducheved/neko-lucia/security/advisories/new). The short policy is in [SECURITY.md](./SECURITY.md).

## Thanks

Lucia was built by [pilcrowOnPaper](https://github.com/pilcrowonpaper). This fork starts from the [Lucia v3 codebase](https://github.com/lucia-auth/lucia/tree/v3), carries its MIT license, and owes the original project a real thank-you.

`neko-lucia` is maintained independently by [@Ducheved](https://github.com/Ducheved). It is not an official Lucia release and is not affiliated with the original project.
