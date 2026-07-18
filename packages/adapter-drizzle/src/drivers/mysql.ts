import { eq, lte } from "drizzle-orm";

import { normalizeSecretHash, serializeSecretHash } from "../secret.js";

import type { Adapter, DatabaseSession, DatabaseUser, UserId } from "@ducheved/neko-lucia";
import type { TablesRelationalConfig } from "drizzle-orm/relations";
import type {
	AnyMySqlColumn,
	AnyMySqlTable,
	MySqlDatabase,
	MySqlQueryResultHKT,
	PreparedQueryHKTBase,
} from "drizzle-orm/mysql-core";

export class DrizzleMySQLAdapter<
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TPreparedQuery extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TSessionTable extends MySQLSessionTable = MySQLSessionTable,
	TUserTable extends MySQLUserTable = MySQLUserTable,
> implements Adapter {
	private db: MySqlDatabase<TQueryResult, TPreparedQuery, TFullSchema, TSchema>;
	private sessionTable: TSessionTable;
	private userTable: TUserTable;
	private get querySessionTable(): MySQLSessionTable {
		return this.sessionTable;
	}
	private get queryUserTable(): MySQLUserTable {
		return this.userTable;
	}

	constructor(
		db: MySqlDatabase<TQueryResult, TPreparedQuery, TFullSchema, TSchema>,
		sessionTable: TSessionTable,
		userTable: TUserTable,
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
		sessionId: string,
	): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
		const result = await this.db
			.select({
				user: this.queryUserTable,
				session: this.querySessionTable,
			})
			.from(this.querySessionTable)
			.leftJoin(this.queryUserTable, eq(this.querySessionTable.userId, this.queryUserTable.id))
			.where(eq(this.querySessionTable.id, sessionId));
		if (result.length !== 1 || result[0].session === null) return [null, null];
		return [
			transformIntoDatabaseSession(result[0].session),
			result[0].user === null ? null : transformIntoDatabaseUser(result[0].user),
		];
	}

	public async getUserSessions(userId: UserId): Promise<DatabaseSession[]> {
		const result = await this.db.select().from(this.querySessionTable).where(eq(this.querySessionTable.userId, userId));
		return result.map(transformIntoDatabaseSession);
	}

	public async setSession(session: DatabaseSession): Promise<void> {
		const values = {
			...session.attributes,
			id: session.id,
			userId: session.userId,
			expiresAt: session.expiresAt,
			secretHash: serializeSecretHash(session.tokenVersion, session.secretHash),
			tokenVersion: session.tokenVersion,
		} as MySQLSessionTable["$inferInsert"];
		await this.db.insert(this.querySessionTable).values(values);
	}

	public async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
		await this.db
			.update(this.querySessionTable)
			.set({ expiresAt } as Partial<MySQLSessionTable["$inferInsert"]>)
			.where(eq(this.querySessionTable.id, sessionId));
	}

	public async deleteExpiredSessions(): Promise<void> {
		await this.db.delete(this.querySessionTable).where(lte(this.querySessionTable.expiresAt, new Date()));
	}
}

type MySQLUserColumns = {
	id: AnyMySqlColumn<{ data: UserId }>;
};

type MySQLSessionColumns = {
	id: AnyMySqlColumn<{ data: string }>;
	expiresAt: AnyMySqlColumn<{ data: Date }>;
	userId: AnyMySqlColumn<{ data: UserId }>;
	secretHash: AnyMySqlColumn<{ data: Uint8Array }>;
	tokenVersion: AnyMySqlColumn<{ data: number }>;
};

export type MySQLUserTable = AnyMySqlTable<{ columns: MySQLUserColumns }> & MySQLUserColumns;

export type MySQLSessionTable = AnyMySqlTable<{
	columns: MySQLSessionColumns;
}> &
	MySQLSessionColumns;

function transformIntoDatabaseSession(raw: Record<string, unknown>): DatabaseSession {
	const { id, userId, expiresAt, secretHash, tokenVersion, ...attributes } = raw;
	if (typeof id !== "string" || userId === null || userId === undefined || !(expiresAt instanceof Date)) {
		throw new TypeError("Invalid session row");
	}
	const base = {
		id,
		userId: userId as UserId,
		expiresAt,
		attributes: attributes as DatabaseSession["attributes"],
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
