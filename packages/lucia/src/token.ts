import { Buffer } from "node:buffer";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const base32Alphabet = "abcdefghijklmnopqrstuvwxyz234567";
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const legacyPattern = /^[a-z2-7]{40}$/;

export type ParsedSessionToken =
	| { id: string; tokenVersion: 1 }
	| { id: string; secret: Uint8Array; tokenVersion: 2 };

export function createLegacySessionToken(sessionId?: string): string {
	if (sessionId !== undefined) {
		if (!legacyPattern.test(sessionId)) {
			throw new TypeError("Invalid legacy session ID");
		}
		return sessionId;
	}
	return encodeBase32(randomBytes(25));
}

export function createSessionToken(sessionId?: string): {
	id: string;
	secretHash: Uint8Array;
	token: string;
} {
	const idBytes = sessionId === undefined ? randomBytes(16) : decodeBase64Url(sessionId, 16);
	if (idBytes === null) {
		throw new TypeError("Invalid session ID");
	}
	const id = Buffer.from(idBytes).toString("base64url");
	const secret = randomBytes(32);
	const token = `${id}.${secret.toString("base64url")}`;
	return {
		id,
		secretHash: hashSessionSecret(secret),
		token
	};
}

export function parseSessionToken(token: string): ParsedSessionToken | null {
	if (legacyPattern.test(token)) {
		return {
			id: token,
			tokenVersion: 1
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
		tokenVersion: 2
	};
}

export function hashSessionSecret(secret: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(secret).digest());
}

export function verifySessionSecret(secret: Uint8Array, storedHash: Uint8Array): boolean {
	if (storedHash.byteLength !== 32) {
		return false;
	}
	return timingSafeEqual(Buffer.from(hashSessionSecret(secret)), Buffer.from(storedHash));
}

function decodeBase64Url(value: string, byteLength: number): Uint8Array | null {
	if (!base64UrlPattern.test(value)) {
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
			result += base32Alphabet[(buffer >>> bits) & 31];
		}
	}
	if (bits > 0) {
		result += base32Alphabet[(buffer << (5 - bits)) & 31];
	}
	return result;
}
