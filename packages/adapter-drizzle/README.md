# @ducheved/neko-lucia-adapter-drizzle

Drizzle ORM adapters for [neko-lucia](https://github.com/Ducheved/neko-lucia): PostgreSQL, MySQL, and SQLite from one ESM package.

```bash
pnpm add @ducheved/neko-lucia @ducheved/neko-lucia-adapter-drizzle drizzle-orm@0.45.2
```

Deno uses the same registry package:

```ts
import {
  DrizzleMySQLAdapter,
  DrizzlePostgreSQLAdapter,
  DrizzleSQLiteAdapter
} from "npm:@ducheved/neko-lucia-adapter-drizzle";
```

The package runs on Node.js 22.23.1, 24.18.0, and 26.x. Its package root also imports and type-checks in Deno 2.9+. A live Deno database connection still rides on whichever Drizzle driver your app chooses.

Drizzle ORM `0.45.2` is an exact peer for this line. Other versions are not claimed until they pass the full matrix.

## Session columns

| Field | PostgreSQL 16/18 | MySQL 8.4 | SQLite |
| --- | --- | --- | --- |
| `id` | `TEXT` | `VARCHAR(66) CHARACTER SET ascii COLLATE ascii_bin` | `TEXT` |
| `user_id` | Your user ID type | Your user ID type | Your user ID type |
| `expires_at` | `TIMESTAMPTZ` | `DATETIME` | Integer Unix seconds |
| `secret_hash` | Nullable `BYTEA` | Nullable `BINARY(32)` | Nullable `BLOB` |
| `token_version` | `SMALLINT NOT NULL DEFAULT 1` | `INT NOT NULL DEFAULT 1` | `INTEGER NOT NULL DEFAULT 1` |

A v1 row has `token_version = 1` and `secret_hash = NULL`. A v2 row has `token_version = 2` and exactly 32 hash bytes. Add a database check constraint for those two shapes after expanding an existing Lucia v3 table.

## PostgreSQL

The adapter contract runs against PostgreSQL 16 and 18.

```ts
import { DrizzlePostgreSQLAdapter } from "@ducheved/neko-lucia-adapter-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { customType, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value)
});

const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  username: text("username").notNull()
});

const sessionTable = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  secretHash: bytea("secret_hash"),
  tokenVersion: smallint("token_version").notNull().default(1),
  country: text("country").notNull()
});

const adapter = new DrizzlePostgreSQLAdapter(
  drizzle(pool),
  sessionTable,
  userTable
);
```

For an existing table:

```sql
ALTER TABLE session ADD COLUMN secret_hash BYTEA NULL;
ALTER TABLE session ADD COLUMN token_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE session ADD CONSTRAINT session_token_material CHECK (
  (token_version = 1 AND secret_hash IS NULL) OR
  (token_version = 2 AND secret_hash IS NOT NULL AND octet_length(secret_hash) = 32)
);
```

## MySQL

Widen a legacy session ID column to the case-sensitive ASCII `VARCHAR(66)` shown in the table. Use a Drizzle custom type with `Uint8Array` data, `Buffer` driver data, and SQL type `binary(32)`. Do not turn the hash into text; all 32 bytes must survive the round trip.

## SQLite

Use `blob("secret_hash", { mode: "buffer" })`, an integer `token_version`, and Unix seconds for `expires_at`. SQLite needs a table rebuild to add the final check constraint. Run `foreign_key_check` before turning foreign keys back on.

## Attribute boundary

System values are written after application attributes, so attributes cannot replace `id`, `userId`, `expiresAt`, `secretHash`, or `tokenVersion`. Corrupt system-field types throw a storage-integrity error instead of turning into a half-valid session.

```ts
declare module "@ducheved/neko-lucia" {
  interface Register {
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

The rollout order and rollback rules are in the [root README](https://github.com/Ducheved/neko-lucia#lucia-v3-migration).

## License

MIT. This is an independent fork, not an official Lucia release. See `NOTICE` in the package.
