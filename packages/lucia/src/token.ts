import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BASE_32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

const BASE64URL_RE = /^[a-z0-9_-]+$/i;

const LEGACY_TOKEN_RE = /^[a-z2-7]{40}$/;

export type ParsedSessionToken = { id: string; tokenVersion: 1 } | { id: string; secret: Uint8Array; tokenVersion: 2 };

export function generateIdFromEntropySize(size: number): string {
	return encodeBase32(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

export function createLegacySessionToken(sessionId?: string): string {
	if (typeof sessionId !== "string") {
		return encodeBase32(randomBytes(25));
	}

	if (!LEGACY_TOKEN_RE.test(sessionId)) {
		throw new TypeError("Invalid legacy session ID");
	}

	return sessionId;
}

export type SessionToken = {
	id: string;
	secretHash: Uint8Array;
	token: string;
};

export function createSessionToken(sessionId?: string): SessionToken {
	const idBytes = typeof sessionId === "string" ? decodeBase64Url(sessionId, 16) : randomBytes(16);
	if (!idBytes) {
		throw new TypeError("Invalid session ID");
	}

	const id = Buffer.from(idBytes).toString("base64url");
	const secret = randomBytes(32);
	const token = `${id}.${secret.toString("base64url")}`;
	return {
		id,
		secretHash: hashSessionSecret(secret),
		token,
	};
}

export function parseSessionToken(token: string): ParsedSessionToken | null {
	if (LEGACY_TOKEN_RE.test(token)) {
		return {
			id: token,
			tokenVersion: 1,
		};
	}

	if (token.length !== 66 || token[22] !== "." || token.indexOf(".", 23) !== -1) {
		return null;
	}

	const id = token.slice(0, 22);
	const secret = token.slice(23);

	if (decodeBase64Url(id, 16) === null) {
		return null;
	}

	const secretBytes = decodeBase64Url(secret, 32);
	if (secretBytes === null) {
		return null;
	}

	return {
		id,
		secret: secretBytes,
		tokenVersion: 2,
	};
}

export function hashSessionSecret(secret: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(secret).digest());
}

export function verifySessionSecret(secret: Uint8Array, storedHash: Uint8Array): boolean {
	return storedHash.byteLength === 32 && timingSafeEqual(hashSessionSecret(secret), storedHash);
}

function decodeBase64Url(value: string, byteLength: number): Uint8Array | null {
	if (!BASE64URL_RE.test(value)) {
		return null;
	}

	const decoded = Buffer.from(value, "base64url");
	if (decoded.byteLength !== byteLength || decoded.toString("base64url") !== value) {
		return null;
	}

	return new Uint8Array(decoded);
}

function encodeBase32(bytes: Uint8Array): string {
	let result = "";
	let buffer = 0;
	let bits = 0;

	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bits += 8;

		while (bits >= 5) {
			bits -= 5;
			result += BASE_32_ALPHABET[(buffer >>> bits) & 31];
		}
	}

	if (bits > 0) {
		result += BASE_32_ALPHABET[(buffer << (5 - bits)) & 31];
	}

	return result;
}
