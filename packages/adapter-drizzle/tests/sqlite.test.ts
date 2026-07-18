import assert from "node:assert/strict";
import { test } from "node:test";

import { Lucia } from "@ducheved/neko-lucia";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { DrizzleSQLiteAdapter } from "../src/drivers/sqlite.js";
import {
	createV2Record,
	runAdapterContract,
	runOrphanContract,
	runVersionMismatchContract
} from "./contract.js";
import "./register.js";

const userTable = sqliteTable("user", {
	id: text("id").primaryKey(),
	username: text("username").notNull().unique()
});

const sessionTable = sqliteTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => userTable.id),
	expiresAt: integer("expires_at").notNull(),
	secretHash: blob("secret_hash", { mode: "buffer" }),
	tokenVersion: integer("token_version").notNull().default(1),
	country: text("country").notNull()
});

test("SQLite expand migration, rebuild and adapter contract", async () => {
	const sqlite = new Database(":memory:");
	sqlite.pragma("foreign_keys = ON");
	sqlite.exec(`
		CREATE TABLE user (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE
		);
		CREATE TABLE session (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id),
			expires_at INTEGER NOT NULL,
			country TEXT NOT NULL
		);
		INSERT INTO user (id, username) VALUES ('user', 'user');
		INSERT INTO session (id, user_id, expires_at, country)
		VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'user', unixepoch() + 86400, 'legacy');
	`);
	sqlite.exec("ALTER TABLE session ADD COLUMN secret_hash BLOB NULL");
	sqlite.exec("ALTER TABLE session ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1");
	const expanded = sqlite
		.prepare("SELECT token_version, secret_hash FROM session WHERE id = ?")
		.get("a".repeat(40)) as { secret_hash: Buffer | null; token_version: number };
	assert.equal(expanded.token_version, 1);
	assert.equal(expanded.secret_hash, null);
	sqlite.pragma("foreign_keys = OFF");
	sqlite.exec(`
		BEGIN;
		CREATE TABLE session_new (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id),
			expires_at INTEGER NOT NULL,
			secret_hash BLOB,
			token_version INTEGER NOT NULL DEFAULT 1,
			country TEXT NOT NULL,
			CONSTRAINT session_token_material CHECK (
				(token_version = 1 AND secret_hash IS NULL) OR
				(token_version = 2 AND typeof(secret_hash) = 'blob' AND length(secret_hash) = 32)
			)
		);
		INSERT INTO session_new
		SELECT id, user_id, expires_at, secret_hash, token_version, country FROM session;
		DROP TABLE session;
		ALTER TABLE session_new RENAME TO session;
		COMMIT;
	`);
	sqlite.pragma("foreign_keys = ON");
	assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
	const adapter = new DrizzleSQLiteAdapter(drizzle(sqlite), sessionTable, userTable);
	const rollbackReader = new Lucia(adapter, { sessionTokenVersion: 1 });
	assert.equal(
		(await rollbackReader.validateSession("a".repeat(40))).session?.id,
		"a".repeat(40)
	);
	assert.throws(() =>
		sqlite
			.prepare(
				"INSERT INTO session (id, user_id, expires_at, country, token_version, secret_hash) VALUES ('invalid-pair', 'user', unixepoch() + 86400, 'invalid', 2, NULL)"
			)
			.run()
	);
	await adapter.deleteSession("a".repeat(40));
	await runVersionMismatchContract(adapter, async (sessionId) => {
		sqlite
			.prepare("UPDATE session SET token_version = 1, secret_hash = NULL WHERE id = ?")
			.run(sessionId);
	});
	await runAdapterContract(adapter);
	await runOrphanContract(adapter, async () => {
		sqlite.pragma("foreign_keys = OFF");
		sqlite.prepare("DELETE FROM user WHERE id = ?").run("user");
		sqlite.pragma("foreign_keys = ON");
	});
	sqlite.close();
});

test("SQLite preserves every hash byte", async () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(`
		CREATE TABLE user (id TEXT PRIMARY KEY, username TEXT NOT NULL);
		CREATE TABLE session (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			secret_hash BLOB,
			token_version INTEGER NOT NULL,
			country TEXT NOT NULL
		);
		INSERT INTO user (id, username) VALUES ('user', 'user');
	`);
	const adapter = new DrizzleSQLiteAdapter(drizzle(sqlite), sessionTable, userTable);
	const vectors = Array.from({ length: 8 }, (_, group) =>
		Uint8Array.from({ length: 32 }, (_, index) => group * 32 + index)
	);
	for (const vector of vectors) {
		await adapter.setSession(createV2Record(vector));
		const [stored] = await adapter.getSessionAndUser("binary-vector");
		assert.deepEqual(stored?.secretHash, vector);
		await adapter.deleteSession("binary-vector");
	}
	sqlite.close();
});
