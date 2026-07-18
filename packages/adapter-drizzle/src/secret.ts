import { Buffer } from "node:buffer";

export function normalizeSecretHash(value: unknown): Uint8Array {
	if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
		throw new TypeError("Invalid session secret hash");
	}
	return new Uint8Array(value);
}

export function serializeSecretHash(tokenVersion: unknown, value: unknown): Buffer | null {
	if (tokenVersion === 1 && value === null) {
		return null;
	}
	if (tokenVersion === 2) {
		return Buffer.from(normalizeSecretHash(value));
	}
	throw new TypeError("Invalid session token material");
}
