import { eq, lte } from "drizzle-orm";

import { normalizeSecretHash, serializeSecretHash } from "../secret.js";

import type { Adapter, DatabaseSession, DatabaseUser, UserId } from "@ducheved/neko-lucia";
import type { TablesRelationalConfig } from "drizzle-orm/relations";
import type {
	AnySQLiteColumn,
	AnySQLiteTable,
	BaseSQLiteDatabase
} from "drizzle-orm/sqlite-core";

export class DrizzleSQLiteAdapter<
	TResultKind extends "async" | "sync" = "async" | "sync",
	TRunResult = unknown,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TSessionTable extends SQLiteSessionTable = SQLiteSessionTable,
	TUserTable extends SQLiteUserTable = SQLiteUserTable
> implements Adapter {
	private db: BaseSQLiteDatabase<TResultKind, TRunResult, TFullSchema, TSchema>;
	private sessionTable: TSessionTable;
	private userTable: TUserTable;
	private get querySessionTable(): SQLiteSessionTable {
		return this.sessionTable;
	}
	private get queryUserTable(): SQLiteUserTable {
		return this.userTable;
	}

	constructor(
		db: BaseSQLiteDatabase<TResultKind, TRunResult, TFullSchema, TSchema>,
		sessionTable: TSessionTable,
		userTable: TUserTable
	) {
		this.db = db;
		this.sessionTable = sessionTable;
		this.userTable = userTable;
	}

	public async deleteSession(sessionId: string): Promise<void> {
		await this.db.delete(this.querySessionTable).where(eq(this.querySessionTable.id, sessionId));
	}

	public async deleteUserSessions(userId: UserId): Promise<void> {
		await this.db.delete(this.querySessionTable).where(eq(this.querySessionTable.userId, userId));
	}

	public async getSessionAndUser(
		sessionId: string
	): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
		const result: unknown = await this.db
			.select({
				user: this.queryUserTable,
				session: this.querySessionTable
			})
			.from(this.querySessionTable)
			.where(eq(this.querySessionTable.id, sessionId))
			.leftJoin(
				this.queryUserTable,
				eq(this.querySessionTable.userId, this.queryUserTable.id)
			);
		if (Array.isArray(result) === false || result.length !== 1 || !isRecord(result[0])) {
			return [null, null];
		}
		const session = result[0].session;
		const user = result[0].user;
		if (!isRecord(session) || (user !== null && !isRecord(user))) {
			return [null, null];
		}
		return [
			transformIntoDatabaseSession(session),
			user === null ? null : transformIntoDatabaseUser(user)
		];
	}

	public async getUserSessions(userId: UserId): Promise<DatabaseSession[]> {
		const result = await this.db
			.select()
			.from(this.querySessionTable)
			.where(eq(this.querySessionTable.userId, userId))
			.all();
		return result.map(transformIntoDatabaseSession);
	}

	public async setSession(session: DatabaseSession): Promise<void> {
		const values = {
			...session.attributes,
			id: session.id,
			userId: session.userId,
			expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
			secretHash: serializeSecretHash(session.tokenVersion, session.secretHash),
			tokenVersion: session.tokenVersion
		} as SQLiteSessionTable["$inferInsert"];
		await this.db
			.insert(this.querySessionTable)
			.values(values)
			.run();
	}

	public async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
		await this.db
			.update(this.querySessionTable)
			.set({
				expiresAt: Math.floor(expiresAt.getTime() / 1000)
			} as Partial<SQLiteSessionTable["$inferInsert"]>)
			.where(eq(this.querySessionTable.id, sessionId))
			.run();
	}

	public async deleteExpiredSessions(): Promise<void> {
		await this.db
			.delete(this.querySessionTable)
			.where(lte(this.querySessionTable.expiresAt, Math.floor(Date.now() / 1000)));
	}
}

type SQLiteUserColumns = {
	id: AnySQLiteColumn<{ data: UserId }>;
};

type SQLiteSessionColumns = {
	id: AnySQLiteColumn<{ data: string }>;
	expiresAt: AnySQLiteColumn<{ data: number }>;
	userId: AnySQLiteColumn<{ data: UserId }>;
	secretHash: AnySQLiteColumn<{ data: Uint8Array }>;
	tokenVersion: AnySQLiteColumn<{ data: number }>;
};

export type SQLiteUserTable = AnySQLiteTable<{ columns: SQLiteUserColumns }> & SQLiteUserColumns;

export type SQLiteSessionTable = AnySQLiteTable<{
	columns: SQLiteSessionColumns;
}> &
	SQLiteSessionColumns;

function transformIntoDatabaseSession(raw: Record<string, unknown>): DatabaseSession {
	const { id, userId, expiresAt, secretHash, tokenVersion, ...attributes } = raw;
	if (
		typeof id !== "string" ||
		userId === null ||
		userId === undefined ||
		typeof expiresAt !== "number" ||
		!Number.isFinite(expiresAt)
	) {
		throw new TypeError("Invalid session row");
	}
	const base = {
		id,
		userId: userId as UserId,
		expiresAt: new Date(expiresAt * 1000),
		attributes: attributes as DatabaseSession["attributes"]
	};
	if (tokenVersion === 1 && secretHash === null) {
		return { ...base, tokenVersion: 1, secretHash: null };
	}
	if (tokenVersion === 2) {
		return { ...base, tokenVersion: 2, secretHash: normalizeSecretHash(secretHash) };
	}
	throw new TypeError("Invalid session token material");
}

function transformIntoDatabaseUser(raw: Record<string, unknown>): DatabaseUser {
	const { id, ...attributes } = raw;
	if (id === null || id === undefined) {
		throw new TypeError("Invalid user row");
	}
	return { id: id as UserId, attributes: attributes as DatabaseUser["attributes"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
