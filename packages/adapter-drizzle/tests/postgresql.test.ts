import assert from "node:assert/strict";
import { test } from "node:test";

import { Lucia } from "@ducheved/neko-lucia";
import { drizzle } from "drizzle-orm/node-postgres";
import { customType, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import pg from "pg";

import { DrizzlePostgreSQLAdapter } from "../src/drivers/postgresql.js";
import {
	runAdapterContract,
	runOrphanContract,
	runVersionMismatchContract
} from "./contract.js";
import "./register.js";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
	toDriver(value) {
		return Buffer.from(value);
	},
	fromDriver(value) {
		return new Uint8Array(value);
	}
});

const userTable = pgTable("user", {
	id: text("id").primaryKey(),
	username: text("username").notNull().unique()
});

const sessionTable = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => userTable.id),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	secretHash: bytea("secret_hash"),
	tokenVersion: smallint("token_version").notNull().default(1),
	country: text("country").notNull()
});

test(
	"PostgreSQL expand migration and adapter contract",
	{ skip: process.env.POSTGRES_DATABASE_URL === undefined },
	async (context) => {
		const pool = new pg.Pool({ connectionString: process.env.POSTGRES_DATABASE_URL });
		context.after(() => pool.end());
		await pool.query("DROP TABLE IF EXISTS session");
		await pool.query("DROP TABLE IF EXISTS \"user\"");
		await pool.query(`
			CREATE TABLE "user" (
				id TEXT PRIMARY KEY,
				username TEXT NOT NULL UNIQUE
			);
			CREATE TABLE session (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES "user"(id),
				expires_at TIMESTAMPTZ NOT NULL,
				country TEXT NOT NULL
			);
			INSERT INTO "user" (id, username) VALUES ('user', 'user');
			INSERT INTO session (id, user_id, expires_at, country)
			VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'user', NOW() + INTERVAL '1 day', 'legacy');
		`);
		await pool.query("ALTER TABLE session ADD COLUMN secret_hash BYTEA NULL");
		await pool.query(
			"ALTER TABLE session ADD COLUMN token_version SMALLINT NOT NULL DEFAULT 1"
		);
		const expanded = await pool.query(
			"SELECT token_version, secret_hash FROM session WHERE id = $1",
			["a".repeat(40)]
		);
		assert.equal(expanded.rows[0].token_version, 1);
		assert.equal(expanded.rows[0].secret_hash, null);
		await pool.query(`
			ALTER TABLE session ADD CONSTRAINT session_token_material CHECK (
				(token_version = 1 AND secret_hash IS NULL) OR
				(token_version = 2 AND secret_hash IS NOT NULL AND octet_length(secret_hash) = 32)
			)
		`);
		const adapter = new DrizzlePostgreSQLAdapter(drizzle(pool), sessionTable, userTable);
		const rollbackReader = new Lucia(adapter, { sessionTokenVersion: 1 });
		assert.equal(
			(await rollbackReader.validateSession("a".repeat(40))).session?.id,
			"a".repeat(40)
		);
		await assert.rejects(
			pool.query(
				"INSERT INTO session (id, user_id, expires_at, country, token_version, secret_hash) VALUES ($1, 'user', NOW() + INTERVAL '1 day', 'invalid', 2, NULL)",
				["invalid-pair"]
			)
		);
		await adapter.deleteSession("a".repeat(40));
		await runVersionMismatchContract(adapter, async (sessionId) => {
			await pool.query(
				"UPDATE session SET token_version = 1, secret_hash = NULL WHERE id = $1",
				[sessionId]
			);
		});
		await runAdapterContract(adapter);
		await runOrphanContract(adapter, async () => {
			await pool.query("ALTER TABLE session DROP CONSTRAINT session_user_id_fkey");
			await pool.query('DELETE FROM "user" WHERE id = $1', ["user"]);
		});
	}
);
