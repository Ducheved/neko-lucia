import { CookieController } from "./cookie.js";
import { TimeSpan, createDate, isWithinExpirationDate } from "./date.js";
import {
	createLegacySessionToken,
	createSessionToken,
	parseSessionToken,
	verifySessionSecret
} from "./token.js";

import type { Cookie, CookieAttributes } from "./cookie.js";
import type { Adapter, DatabaseSession } from "./database.js";
import type {
	RegisteredDatabaseSessionAttributes,
	RegisteredDatabaseUserAttributes,
	RegisteredLucia,
	UserId
} from "./index.js";

type EmptyAttributes = Record<never, never>;

type SessionAttributes = RegisteredLucia extends Lucia<
	infer _SessionAttributes extends object,
	infer _UserAttributes extends object
>
	? _SessionAttributes
	: EmptyAttributes;

type UserAttributes = RegisteredLucia extends Lucia<
	infer _SessionAttributes extends object,
	infer _UserAttributes extends object
>
	? _UserAttributes
	: EmptyAttributes;

export interface Session extends SessionAttributes {
	readonly id: string;
	expiresAt: Date;
	fresh: boolean;
	userId: UserId;
}

export interface SessionWithToken extends Session {
	readonly token: string;
}

export interface User extends UserAttributes {
	id: UserId;
}

type SessionMapperOption<_SessionAttributes extends object> =
	keyof _SessionAttributes extends never
		? {
				getSessionAttributes?: (
					databaseSessionAttributes: RegisteredDatabaseSessionAttributes
				) => _SessionAttributes;
			}
		: {
				getSessionAttributes: (
					databaseSessionAttributes: RegisteredDatabaseSessionAttributes
				) => _SessionAttributes;
			};

type UserMapperOption<_UserAttributes extends object> = keyof _UserAttributes extends never
	? {
			getUserAttributes?: (
				databaseUserAttributes: RegisteredDatabaseUserAttributes
			) => _UserAttributes;
		}
	: {
			getUserAttributes: (
				databaseUserAttributes: RegisteredDatabaseUserAttributes
			) => _UserAttributes;
		};

type LuciaOptions<_SessionAttributes extends object, _UserAttributes extends object> = {
	sessionExpiresIn?: TimeSpan;
	sessionTokenVersion: 1 | 2;
	sessionCookie?: SessionCookieOptions;
} &
	SessionMapperOption<_SessionAttributes> &
	UserMapperOption<_UserAttributes>;

export class Lucia<
	_SessionAttributes extends object = EmptyAttributes,
	_UserAttributes extends object = EmptyAttributes
> {
	private adapter: Adapter;
	private sessionExpiresIn: TimeSpan;
	private sessionCookieController: CookieController;
	private sessionTokenVersion: 1 | 2;

	private getSessionAttributes: (
		databaseSessionAttributes: RegisteredDatabaseSessionAttributes
	) => _SessionAttributes;

	private getUserAttributes: (
		databaseUserAttributes: RegisteredDatabaseUserAttributes
	) => _UserAttributes;

	public readonly sessionCookieName: string;

	constructor(
		adapter: Adapter,
		options: LuciaOptions<_SessionAttributes, _UserAttributes>
	) {
		if (
			!isPlainRecord(options) ||
			!Object.hasOwn(options, "sessionTokenVersion") ||
			(options.sessionTokenVersion !== 1 && options.sessionTokenVersion !== 2)
		) {
			throw new TypeError("sessionTokenVersion must be 1 or 2");
		}
		this.adapter = adapter;
		this.getUserAttributes = (databaseUserAttributes): _UserAttributes => {
			if (options.getUserAttributes) {
				return options.getUserAttributes(databaseUserAttributes);
			}
			return {} as _UserAttributes;
		};
		this.getSessionAttributes = (databaseSessionAttributes): _SessionAttributes => {
			if (options.getSessionAttributes) {
				return options.getSessionAttributes(databaseSessionAttributes);
			}
			return {} as _SessionAttributes;
		};
		this.sessionExpiresIn = options.sessionExpiresIn ?? new TimeSpan(30, "d");
		this.sessionTokenVersion = options.sessionTokenVersion;
		const cookieConfiguration = normalizeCookieConfiguration(options.sessionCookie);
		this.sessionCookieName = cookieConfiguration.name;
		let sessionCookieExpiresIn = this.sessionExpiresIn;
		if (cookieConfiguration.expires === false) {
			sessionCookieExpiresIn = new TimeSpan(400, "d");
		}
		const baseSessionCookieAttributes = cookieConfiguration.attributes;
		validateCookieConfiguration(this.sessionCookieName, baseSessionCookieAttributes);
		this.sessionCookieController = new CookieController(
			this.sessionCookieName,
			baseSessionCookieAttributes,
			{
				expiresIn: sessionCookieExpiresIn
			}
		);
	}

	public async getUserSessions(userId: UserId): Promise<Session[]> {
		const databaseSessions = await this.adapter.getUserSessions(userId);
		const sessions: Session[] = [];
		for (const databaseSession of databaseSessions) {
			if (!isWithinExpirationDate(databaseSession.expiresAt)) {
				continue;
			}
			sessions.push(this.transformSession(databaseSession, false));
		}
		return sessions;
	}

	public async validateSession(
		token: string
	): Promise<{ user: User; session: Session } | { user: null; session: null }> {
		const parsedToken = parseSessionToken(token);
		if (parsedToken === null) {
			return { session: null, user: null };
		}
		const [databaseSession, databaseUser] = await this.adapter.getSessionAndUser(parsedToken.id);
		if (databaseSession === null) {
			return { session: null, user: null };
		}
		if (!authenticateSession(databaseSession, parsedToken)) {
			return { session: null, user: null };
		}
		if (databaseUser === null) {
			await this.adapter.deleteSession(databaseSession.id);
			return { session: null, user: null };
		}
		if (!isWithinExpirationDate(databaseSession.expiresAt)) {
			await this.adapter.deleteSession(databaseSession.id);
			return { session: null, user: null };
		}
		const activePeriodExpirationDate = new Date(
			databaseSession.expiresAt.getTime() - this.sessionExpiresIn.milliseconds() / 2
		);
		const session = this.transformSession(databaseSession, false);
		if (!isWithinExpirationDate(activePeriodExpirationDate)) {
			session.fresh = true;
			session.expiresAt = createDate(this.sessionExpiresIn);
			await this.adapter.updateSessionExpiration(databaseSession.id, session.expiresAt);
		}
		const user: User = {
			...this.getUserAttributes(databaseUser.attributes),
			id: databaseUser.id
		};
		return { user, session };
	}

	public async createSession(
		userId: UserId,
		attributes: RegisteredDatabaseSessionAttributes,
		options?: {
			sessionId?: string;
		}
	): Promise<SessionWithToken> {
		const sessionExpiresAt = createDate(this.sessionExpiresIn);
		let databaseSession: DatabaseSession;
		let token: string;
		if (this.sessionTokenVersion === 1) {
			token = createLegacySessionToken(options?.sessionId);
			databaseSession = {
				id: token,
				userId,
				expiresAt: sessionExpiresAt,
				attributes,
				tokenVersion: 1,
				secretHash: null
			};
		} else {
			const material = createSessionToken(options?.sessionId);
			token = material.token;
			databaseSession = {
				id: material.id,
				userId,
				expiresAt: sessionExpiresAt,
				attributes,
				tokenVersion: 2,
				secretHash: material.secretHash
			};
		}
		await this.adapter.setSession(databaseSession);
		const session = this.transformSession(databaseSession, true) as SessionWithToken;
		Object.defineProperty(session, "token", {
			configurable: false,
			enumerable: false,
			value: token,
			writable: false
		});
		return session;
	}

	public async invalidateSession(sessionId: string): Promise<void> {
		await this.adapter.deleteSession(sessionId);
	}

	public async invalidateUserSessions(userId: UserId): Promise<void> {
		await this.adapter.deleteUserSessions(userId);
	}

	public async deleteExpiredSessions(): Promise<void> {
		await this.adapter.deleteExpiredSessions();
	}

	public readSessionCookie(cookieHeader: string): string | null {
		const token = this.sessionCookieController.parse(cookieHeader);
		if (token === null || parseSessionToken(token) === null) {
			return null;
		}
		return token;
	}

	public readBearerToken(authorizationHeader: string): string | null {
		const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
		if (match === null || parseSessionToken(match[1]) === null) {
			return null;
		}
		return match[1];
	}

	public createSessionCookie(token: string): Cookie {
		if (parseSessionToken(token) === null) {
			throw new TypeError("Invalid session token");
		}
		return this.sessionCookieController.createCookie(token);
	}

	public createBlankSessionCookie(): Cookie {
		return this.sessionCookieController.createBlankCookie();
	}

	private transformSession(databaseSession: DatabaseSession, fresh: boolean): Session {
		const session: Session = {
			...this.getSessionAttributes(databaseSession.attributes),
			id: databaseSession.id,
			userId: databaseSession.userId,
			fresh,
			expiresAt: databaseSession.expiresAt
		};
		Object.defineProperty(session, "id", {
			configurable: false,
			enumerable: false,
			value: databaseSession.id,
			writable: false
		});
		return session;
	}
}

export interface SessionCookieOptions {
	name?: string;
	expires?: boolean;
	attributes?: SessionCookieAttributesOptions;
}

export interface SessionCookieAttributesOptions {
	sameSite?: "lax" | "strict" | "none";
	domain?: string;
	path?: string;
	secure?: boolean;
}

function authenticateSession(
	session: DatabaseSession,
	parsedToken: NonNullable<ReturnType<typeof parseSessionToken>>
): boolean {
	if (parsedToken.tokenVersion === 1) {
		return session.tokenVersion === 1 && session.secretHash === null;
	}
	return (
		session.tokenVersion === 2 &&
		session.secretHash.byteLength === 32 &&
		verifySessionSecret(parsedToken.secret, session.secretHash)
	);
}

function validateCookieConfiguration(name: string, attributes: CookieAttributes): void {
	if (attributes.sameSite === "none" && attributes.secure !== true) {
		throw new TypeError("SameSite=None requires Secure");
	}
	if (
		name.startsWith("__Host-") &&
		(attributes.secure !== true || attributes.path !== "/" || attributes.domain !== undefined)
	) {
		throw new TypeError("Invalid __Host- cookie configuration");
	}
	if (name.startsWith("__Secure-") && attributes.secure !== true) {
		throw new TypeError("Invalid __Secure- cookie configuration");
	}
}

const cookieNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const cookiePathPattern = /^\/[^;]*$/;
const cookieDomainPattern = /^\.?(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;

function normalizeCookieConfiguration(options: SessionCookieOptions | undefined): {
	name: string;
	expires: boolean;
	attributes: CookieAttributes;
} {
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError("Invalid session cookie options");
	}
	const record = options ?? {};
	const nameValue = getOwn(record, "name");
	const name = nameValue === undefined ? "auth_session" : nameValue;
	if (
		typeof name !== "string" ||
		!cookieNamePattern.test(name) ||
		encodeURIComponent(name) !== name
	) {
		throw new TypeError("Invalid session cookie name");
	}
	const expiresValue = getOwn(record, "expires");
	if (expiresValue !== undefined && typeof expiresValue !== "boolean") {
		throw new TypeError("Invalid session cookie expiration mode");
	}
	const attributesValue = getOwn(record, "attributes");
	if (attributesValue !== undefined && !isPlainRecord(attributesValue)) {
		throw new TypeError("Invalid session cookie attributes");
	}
	const attributesRecord = attributesValue ?? {};
	const secureValue = getOwn(attributesRecord, "secure");
	if (secureValue !== undefined && typeof secureValue !== "boolean") {
		throw new TypeError("Invalid Secure attribute");
	}
	const sameSiteValue = getOwn(attributesRecord, "sameSite");
	if (
		sameSiteValue !== undefined &&
		sameSiteValue !== "lax" &&
		sameSiteValue !== "strict" &&
		sameSiteValue !== "none"
	) {
		throw new TypeError("Invalid SameSite attribute");
	}
	const pathValue = getOwn(attributesRecord, "path");
	if (
		pathValue !== undefined &&
		(typeof pathValue !== "string" ||
			!cookiePathPattern.test(pathValue) ||
			containsControlCharacter(pathValue))
	) {
		throw new TypeError("Invalid Path attribute");
	}
	const domainValue = getOwn(attributesRecord, "domain");
	if (
		domainValue !== undefined &&
		(typeof domainValue !== "string" || !cookieDomainPattern.test(domainValue))
	) {
		throw new TypeError("Invalid Domain attribute");
	}
	return {
		name,
		expires: expiresValue ?? true,
		attributes: {
			httpOnly: true,
			secure: secureValue ?? true,
			sameSite: sameSiteValue ?? "lax",
			path: pathValue ?? "/",
			...(domainValue === undefined ? {} : { domain: domainValue })
		}
	};
}

function getOwn(record: Record<PropertyKey, unknown>, key: string): unknown {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0);
		if (code !== undefined && (code <= 31 || code === 127)) {
			return true;
		}
	}
	return false;
}
