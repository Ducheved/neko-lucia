import type { MySQLSessionTable, PostgreSQLSessionTable, SQLiteSessionTable } from "../src/index.js";
import type { AnyMySqlColumn, AnyMySqlTable } from "drizzle-orm/mysql-core";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import type { AnySQLiteColumn, AnySQLiteTable } from "drizzle-orm/sqlite-core";

type AssertFalse<Value extends false> = Value;

type BadPostgreSQLColumns = {
	id: AnyPgColumn<{ data: number }>;
	expiresAt: AnyPgColumn<{ data: Date }>;
	userId: AnyPgColumn<{ data: string }>;
	secretHash: AnyPgColumn<{ data: Uint8Array }>;
	tokenVersion: AnyPgColumn<{ data: number }>;
};

type BadMySQLColumns = {
	id: AnyMySqlColumn<{ data: number }>;
	expiresAt: AnyMySqlColumn<{ data: Date }>;
	userId: AnyMySqlColumn<{ data: string }>;
	secretHash: AnyMySqlColumn<{ data: Uint8Array }>;
	tokenVersion: AnyMySqlColumn<{ data: number }>;
};

type BadSQLiteColumns = {
	id: AnySQLiteColumn<{ data: number }>;
	expiresAt: AnySQLiteColumn<{ data: number }>;
	userId: AnySQLiteColumn<{ data: string }>;
	secretHash: AnySQLiteColumn<{ data: Uint8Array }>;
	tokenVersion: AnySQLiteColumn<{ data: number }>;
};

type BadPostgreSQLTable = AnyPgTable<{ columns: BadPostgreSQLColumns }> & BadPostgreSQLColumns;
type BadMySQLTable = AnyMySqlTable<{ columns: BadMySQLColumns }> & BadMySQLColumns;
type BadSQLiteTable = AnySQLiteTable<{ columns: BadSQLiteColumns }> & BadSQLiteColumns;

type PostgreSQLRejectsNumberId = AssertFalse<BadPostgreSQLTable extends PostgreSQLSessionTable ? true : false>;
type MySQLRejectsNumberId = AssertFalse<BadMySQLTable extends MySQLSessionTable ? true : false>;
type SQLiteRejectsNumberId = AssertFalse<BadSQLiteTable extends SQLiteSessionTable ? true : false>;
