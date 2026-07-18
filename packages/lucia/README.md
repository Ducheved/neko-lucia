# @ducheved/neko-lucia

The session-only core of [neko-lucia](https://github.com/Ducheved/neko-lucia). It runs as one ESM package on Node.js 22.23.1, 24.18.0, and 26.x plus Deno 2.9+, with zero runtime dependencies.

```bash
pnpm add @ducheved/neko-lucia
```

```ts
import { Lucia } from "@ducheved/neko-lucia";

const lucia = new Lucia(adapter, {
  sessionTokenVersion: 2,
  sessionCookie: {
    name: "__Host-auth_session"
  }
});

const created = await lucia.createSession(userId, { country: "US" });
const header = lucia.createSessionCookie(created.token).serialize();
const token = lucia.readSessionCookie(request.headers.get("cookie") ?? "");
const result = token === null
  ? { session: null, user: null }
  : await lucia.validateSession(token);
```

Deno imports the same package:

```ts
import { Lucia } from "npm:@ducheved/neko-lucia";
```

## Legacy IDs

Moving a Lucia v3 app? `generateIdFromEntropySize(size)` is available from the package root. Pass the number of random bytes and it returns lowercase Base32 without padding, just like Lucia 3.2. Stick to a positive integer in app code.

## Token modes

`sessionTokenVersion` picks the writer. The reader always understands both formats.

- `1` writes stock Lucia v3 credentials. The 40-character session ID is also the bearer secret.
- `2` writes `<id>.<secret>`. The database gets a public 22-character ID and a 32-byte SHA-256 secret hash, never the raw secret.

Bad grammar stops before the adapter call. A wrong secret or version mismatch cannot refresh or delete a row. Cleanup happens only after the presented credential authenticates.

Session IDs and tokens are readonly and non-enumerable. Cookie values are non-enumerable too. They can still leak if you log them directly, so do not do that.

## Cookies

Defaults are `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. `HttpOnly` is library-owned. `SameSite=None`, `__Host-`, and `__Secure-` combinations are checked at construction time. Duplicate target-cookie names return `null` because guessing which credential wins is a bad game.

Use `__Host-auth_session` for a fresh app. Keep `auth_session` only while rolling over existing Lucia v3 cookies.

## Typed attributes

```ts
const lucia = new Lucia(adapter, {
  sessionTokenVersion: 2,
  getSessionAttributes(attributes) {
    return { country: attributes.country };
  },
  getUserAttributes(attributes) {
    return { username: attributes.username };
  }
});

declare module "@ducheved/neko-lucia" {
  interface Register {
    Lucia: typeof lucia;
    UserId: string;
    DatabaseSessionAttributes: {
      country: string;
    };
    DatabaseUserAttributes: {
      username: string;
    };
  }
}
```

Map a real allowlist. Returning a whole user row is an easy way to leak password hashes, reset tokens, or other private columns.

The no-logout Lucia v3 rollout and release policy live in the [root README](https://github.com/Ducheved/neko-lucia#lucia-v3-migration).

## License

MIT. This is an independent fork, not an official Lucia release. See `NOTICE` in the package.
