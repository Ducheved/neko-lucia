import type { TimeSpan } from "./date.js";

export interface CookieAttributes {
	secure?: boolean;
	path?: string;
	domain?: string;
	sameSite?: "lax" | "strict" | "none";
	httpOnly?: boolean;
	maxAge?: number;
	expires?: Date;
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
	const keyValueEntries: string[] = [];

	keyValueEntries.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);

	if (typeof attributes?.domain === "string") {
		keyValueEntries.push(`Domain=${attributes.domain}`);
	}

	if (attributes?.expires instanceof Date) {
		keyValueEntries.push(`Expires=${attributes.expires.toUTCString()}`);
	}

	if (attributes?.httpOnly) {
		keyValueEntries.push("HttpOnly");
	}

	if (typeof attributes?.maxAge === "number") {
		keyValueEntries.push(`Max-Age=${attributes.maxAge.toString()}`);
	}

	if (typeof attributes?.path === "string") {
		keyValueEntries.push(`Path=${attributes.path}`);
	}

	switch (attributes?.sameSite) {
		case "strict":
			keyValueEntries.push("SameSite=Strict");
			break;
		case "lax":
			keyValueEntries.push("SameSite=Lax");
			break;
		case "none":
			keyValueEntries.push("SameSite=None");
			break;
		default:
			// Nothing to do here
			break;
	}

	if (attributes?.secure) {
		keyValueEntries.push("Secure");
	}

	return keyValueEntries.join("; ");
}

const COOKIE_SEPARATOR_RE = /;\s*/;

export function parseCookies(header: string): Map<string, string> {
	const cookies = new Map<string, string>();
	const duplicates = new Set<string>();
	const items = header.split(COOKIE_SEPARATOR_RE);
	for (const item of items) {
		const [rawKey, rawValue = ""] = item.split("=", 2);
		if (!rawKey) {
			continue;
		}

		try {
			const key = decodeURIComponent(rawKey);
			if (duplicates.has(key)) {
				continue;
			}

			if (cookies.has(key)) {
				cookies.delete(key);
				duplicates.add(key);
				continue;
			}

			cookies.set(key, decodeURIComponent(rawValue));
		} catch {
			continue;
		}
	}

	return cookies;
}

export class CookieController {
	constructor(
		cookieName: string,
		baseCookieAttributes: CookieAttributes,
		cookieOptions?: {
			expiresIn?: TimeSpan;
		},
	) {
		this.cookieName = cookieName;
		this.cookieExpiresIn = cookieOptions?.expiresIn ?? null;
		this.baseCookieAttributes = baseCookieAttributes;
	}

	public cookieName: string;

	private cookieExpiresIn: TimeSpan | null;
	private baseCookieAttributes: CookieAttributes;

	public createCookie(value: string): Cookie {
		return new Cookie(this.cookieName, value, {
			...this.baseCookieAttributes,
			maxAge: this.cookieExpiresIn?.seconds(),
		});
	}

	public createBlankCookie(): Cookie {
		return new Cookie(this.cookieName, "", {
			...this.baseCookieAttributes,
			maxAge: 0,
		});
	}

	public parse(header: string): string | null {
		const cookies = parseCookies(header);
		return cookies.get(this.cookieName) ?? null;
	}
}

export class Cookie {
	#value: string;

	constructor(name: string, value: string, attributes: CookieAttributes) {
		this.name = name;
		this.#value = value;
		this.attributes = attributes;
	}

	public name: string;
	public attributes: CookieAttributes;
	public get value(): string {
		return this.#value;
	}

	public serialize(): string {
		return serializeCookie(this.name, this.value, this.attributes);
	}
}
