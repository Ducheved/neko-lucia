import assert from "node:assert/strict";
import { test } from "node:test";

import { Lucia } from "@ducheved/neko-lucia";
import { drizzle } from "drizzle-orm/mysql2";
import { customType, datetime, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";

import { DrizzleMySQLAdapter } from "../src/drivers/mysql.js";
import {
	createV2Record,
	runAdapterContract,
	runOrphanContract,
	runVersionMismatchContract
} from "./contract.js";
import "./register.js";

const binary32 = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType() {
		return "binary(32)";
	},
	toDriver(value) {
		return Buffer.from(value);
	},
	fromDriver(value) {
		return new Uint8Array(value);
	}
});

const userTable = mysqlTable("user", {
	id: varchar("id", { length: 255 }).primaryKey(),
	username: varchar("username", { length: 255 }).notNull().unique()
});

const sessionTable = mysqlTable("session", {
	id: varchar("id", { length: 66 }).primaryKey(),
	userId: varchar("user_id", { length: 255 })
		.notNull()
		.references(() => userTable.id),
	expiresAt: datetime("expires_at").notNull(),
	secretHash: binary32("secret_hash"),
	tokenVersion: int("token_version").notNull().default(1),
	country: varchar("country", { length: 255 }).notNull()
});

async function createConnection() {
	return mysql.createConnection({
		host: process.env.MYSQL_HOST,
		port: Number(process.env.MYSQL_PORT ?? 3306),
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASSWORD,
		database: process.env.MYSQL_DATABASE
	});
}

async function resetTables(connection: mysql.Connection): Promise<void> {
	await connection.execute("DROP TABLE IF EXISTS session");
	await connection.execute("DROP TABLE IF EXISTS user");
	await connection.execute(`
		CREATE TABLE user (
			id VARCHAR(255) PRIMARY KEY,
			username VARCHAR(255) NOT NULL UNIQUE
		)
	`);
}

async function prepareFinal(connection: mysql.Connection): Promise<void> {
	await resetTables(connection);
	await connection.execute(`
		CREATE TABLE session (
			id VARCHAR(66) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
			user_id VARCHAR(255) NOT NULL,
			expires_at DATETIME NOT NULL,
			secret_hash BINARY(32) NULL,
			token_version INT NOT NULL DEFAULT 1,
			country VARCHAR(255) NOT NULL,
			CONSTRAINT session_user_fk FOREIGN KEY (user_id) REFERENCES user(id),
			CONSTRAINT session_token_material CHECK (
				(token_version = 1 AND secret_hash IS NULL) OR
				(token_version = 2 AND secret_hash IS NOT NULL AND OCTET_LENGTH(secret_hash) = 32)
			)
		)
	`);
	await connection.execute("INSERT INTO user (id, username) VALUES ('user', 'user')");
}

async function prepareMigrated(connection: mysql.Connection): Promise<void> {
	await resetTables(connection);
	await connection.execute(`
		CREATE TABLE session (
			id VARCHAR(255) PRIMARY KEY,
			user_id VARCHAR(255) NOT NULL,
			expires_at DATETIME NOT NULL,
			country VARCHAR(255) NOT NULL,
			CONSTRAINT session_user_fk FOREIGN KEY (user_id) REFERENCES user(id)
		)
	`);
	await connection.execute("INSERT INTO user (id, username) VALUES ('user', 'user')");
	await connection.execute(
		"INSERT INTO session (id, user_id, expires_at, country) VALUES (?, 'user', DATE_ADD(NOW(), INTERVAL 1 DAY), 'legacy')",
		["a".repeat(40)]
	);
	await connection.execute(
		"ALTER TABLE session MODIFY id VARCHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL"
	);
	await connection.execute("ALTER TABLE session ADD COLUMN secret_hash BINARY(32) NULL");
	await connection.execute(
		"ALTER TABLE session ADD COLUMN token_version INT NOT NULL DEFAULT 1"
	);
	const [rows] = await connection.query(
		"SELECT token_version, secret_hash FROM session WHERE id = ?",
		["a".repeat(40)]
	);
	const expanded = rows as Array<{ secret_hash: Buffer | null; token_version: number }>;
	assert.equal(expanded[0].token_version, 1);
	assert.equal(expanded[0].secret_hash, null);
	await connection.execute(`
		ALTER TABLE session ADD CONSTRAINT session_token_material CHECK (
			(token_version = 1 AND secret_hash IS NULL) OR
			(token_version = 2 AND secret_hash IS NOT NULL AND OCTET_LENGTH(secret_hash) = 32)
		)
	`);
}

test(
	"MySQL expand migration and adapter contract",
	{ skip: process.env.MYSQL_HOST === undefined },
	async (context) => {
		const connection = await createConnection();
		context.after(() => connection.end());
		await prepareMigrated(connection);
		const adapter = new DrizzleMySQLAdapter(drizzle(connection), sessionTable, userTable);
		const rollbackReader = new Lucia(adapter, { sessionTokenVersion: 1 });
		assert.equal(
			(await rollbackReader.validateSession("a".repeat(40))).session?.id,
			"a".repeat(40)
		);
		await assert.rejects(
			connection.execute(
				"INSERT INTO session (id, user_id, expires_at, country, token_version, secret_hash) VALUES ('invalid-pair', 'user', DATE_ADD(NOW(), INTERVAL 1 DAY), 'invalid', 2, NULL)"
			)
		);
		await adapter.deleteSession("a".repeat(40));
		await runVersionMismatchContract(adapter, async (sessionId) => {
			await connection.execute(
				"UPDATE session SET token_version = 1, secret_hash = NULL WHERE id = ?",
				[sessionId]
			);
		});
		await runAdapterContract(adapter);
		await runOrphanContract(adapter, async () => {
			await connection.execute("ALTER TABLE session DROP FOREIGN KEY session_user_fk");
			await connection.execute("DELETE FROM user WHERE id = 'user'");
		});
	}
);

test(
	"MySQL preserves arbitrary binary hashes",
	{ skip: process.env.MYSQL_HOST === undefined },
	async (context) => {
		const connection = await createConnection();
		context.after(() => connection.end());
		await prepareFinal(connection);
		const adapter = new DrizzleMySQLAdapter(drizzle(connection), sessionTable, userTable);
		const vectors = Array.from({ length: 8 }, (_, group) =>
			Uint8Array.from({ length: 32 }, (_, index) => group * 32 + index)
		);
		for (const vector of vectors) {
			await adapter.setSession(createV2Record(vector));
			const [stored] = await adapter.getSessionAndUser("binary-vector");
			assert.deepEqual(stored?.secretHash, vector);
			await adapter.deleteSession("binary-vector");
		}
	}
);
