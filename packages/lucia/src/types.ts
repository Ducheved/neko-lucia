import type { Lucia } from "./core.js";

export interface Register {}

export type UserId = Register extends {
	UserId: infer _UserId;
}
	? _UserId
	: string;

export type RegisteredLucia = Register extends {
	Lucia: infer _Lucia;
}
	? _Lucia extends Lucia<infer _SessionAttributes extends object, infer _UserAttributes extends object>
		? _Lucia
		: Lucia
	: Lucia;

export type RegisteredDatabaseUserAttributes = Register extends {
	DatabaseUserAttributes: infer _DatabaseUserAttributes;
}
	? _DatabaseUserAttributes
	: Record<never, never>;

export type RegisteredDatabaseSessionAttributes = Register extends {
	DatabaseSessionAttributes: infer _DatabaseSessionAttributes;
}
	? _DatabaseSessionAttributes
	: Record<never, never>;
