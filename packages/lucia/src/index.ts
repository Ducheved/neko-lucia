export { Lucia } from "./core.js";
export { generateIdFromEntropySize } from "./token.js";
export { TimeSpan } from "./date.js";
export { Cookie } from "./cookie.js";
export type { CookieAttributes } from "./cookie.js";
export { verifyRequestOrigin } from "./request.js";

export type { User, Session, SessionWithToken, SessionCookieOptions, SessionCookieAttributesOptions } from "./core.js";
export type { DatabaseSession, DatabaseUser, Adapter } from "./database.js";

export type {
	Register,
	UserId,
	RegisteredLucia,
	RegisteredDatabaseUserAttributes,
	RegisteredDatabaseSessionAttributes,
} from "./types.js";
