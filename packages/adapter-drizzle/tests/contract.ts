import assert from "node:assert/strict";

import { Lucia, TimeSpan } from "@ducheved/neko-lucia";

import type { Adapter, DatabaseSession } from "@ducheved/neko-lucia";

export async function runAdapterContract(adapter: Adapter): Promise<void> {
	const legacyLucia = new Lucia(adapter, {
		sessionExpiresIn: new TimeSpan(1, "d"),
		sessionTokenVersion: 1
	});
	const v2Lucia = new Lucia(adapter, {
		sessionExpiresIn: new TimeSpan(1, "d"),
		sessionTokenVersion: 2
	});
	const legacy = await legacyLucia.createSession("user", { country: "legacy" });
	const v2 = await v2Lucia.createSession("user", { country: "v2" });
	assert.equal((await legacyLucia.validateSession(legacy.token)).session?.id, legacy.id);
	assert.equal((await v2Lucia.validateSession(legacy.token)).session?.id, legacy.id);
	assert.equal((await v2Lucia.validateSession(v2.token)).session?.id, v2.id);
	assert.equal((await legacyLucia.validateSession(v2.token)).session?.id, v2.id);
	const letterIndex = [...v2.id].findIndex((character) => /[A-Za-z]/.test(character));
	assert.notEqual(letterIndex, -1);
	const letter = v2.id[letterIndex];
	const caseChangedId = `${v2.id.slice(0, letterIndex)}${letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()}${v2.id.slice(letterIndex + 1)}`;
	assert.deepEqual(await adapter.getSessionAndUser(caseChangedId), [null, null]);
	const [storedV2, storedUser] = await adapter.getSessionAndUser(v2.id);
	assert.equal(storedV2?.tokenVersion, 2);
	assert.equal(storedV2?.secretHash?.byteLength, 32);
	assert.deepEqual(storedV2?.attributes, { country: "v2" });
	assert.deepEqual(storedUser?.attributes, { username: "user" });
	const tamperIndex = 30;
	const replacement = v2.token[tamperIndex] === "A" ? "B" : "A";
	const tampered = `${v2.token.slice(0, tamperIndex)}${replacement}${v2.token.slice(tamperIndex + 1)}`;
	assert.deepEqual(await v2Lucia.validateSession(tampered), { session: null, user: null });
	const [afterTamper] = await adapter.getSessionAndUser(v2.id);
	assert.deepEqual(afterTamper, storedV2);
	assert.equal((await v2Lucia.validateSession(v2.token)).session?.id, v2.id);
	const overrideHash = new Uint8Array(32).fill(7);
	await adapter.setSession({
		id: "system-precedence",
		userId: "user",
		expiresAt: new Date(Date.now() + 60_000),
		attributes: {
			country: "override",
			id: "attribute-id",
			secretHash: null,
			tokenVersion: 1
		} as { country: string },
		tokenVersion: 2,
		secretHash: overrideHash
	});
	const [precedence] = await adapter.getSessionAndUser("system-precedence");
	assert.equal(precedence?.id, "system-precedence");
	assert.equal(precedence?.tokenVersion, 2);
	assert.deepEqual(precedence?.secretHash, overrideHash);
	assert.deepEqual(precedence?.attributes, { country: "override" });
	const invalidRecords = [
		{
			id: "invalid-short-hash",
			userId: "user",
			expiresAt: new Date(Date.now() + 60_000),
			attributes: { country: "invalid" },
			tokenVersion: 2,
			secretHash: new Uint8Array(31)
		},
		{
			id: "invalid-legacy-hash",
			userId: "user",
			expiresAt: new Date(Date.now() + 60_000),
			attributes: { country: "invalid" },
			tokenVersion: 1,
			secretHash: new Uint8Array(32)
		},
		{
			id: "invalid-version",
			userId: "user",
			expiresAt: new Date(Date.now() + 60_000),
			attributes: { country: "invalid" },
			tokenVersion: 3,
			secretHash: null
		}
	];
	for (const invalid of invalidRecords) {
		await assert.rejects(
			adapter.setSession(invalid as unknown as DatabaseSession),
			TypeError
		);
		assert.deepEqual(await adapter.getSessionAndUser(invalid.id), [null, null]);
	}
	const sessions = await adapter.getUserSessions("user");
	assert.equal(sessions.length, 3);
	await adapter.updateSessionExpiration(v2.id, new Date(0));
	await adapter.deleteExpiredSessions();
	assert.deepEqual(await adapter.getSessionAndUser(v2.id), [null, null]);
	await adapter.deleteSession(legacy.id);
	assert.deepEqual(await adapter.getSessionAndUser(legacy.id), [null, null]);
	await adapter.deleteUserSessions("user");
	assert.deepEqual(await adapter.getUserSessions("user"), []);
}

export async function runVersionMismatchContract(
	adapter: Adapter,
	mutateToLegacy: (sessionId: string) => Promise<void>
): Promise<void> {
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", { country: "mismatch" });
	await mutateToLegacy(created.id);
	const [before] = await adapter.getSessionAndUser(created.id);
	assert.equal(before?.tokenVersion, 1);
	assert.deepEqual(await lucia.validateSession(created.token), { session: null, user: null });
	const [after] = await adapter.getSessionAndUser(created.id);
	assert.deepEqual(after, before);
	await adapter.deleteSession(created.id);
}

export async function runOrphanContract(
	adapter: Adapter,
	removeUser: () => Promise<void>
): Promise<void> {
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", { country: "orphan" });
	await removeUser();
	const replacement = created.token[30] === "A" ? "B" : "A";
	const tampered = `${created.token.slice(0, 30)}${replacement}${created.token.slice(31)}`;
	assert.deepEqual(await lucia.validateSession(tampered), { session: null, user: null });
	const [stored, user] = await adapter.getSessionAndUser(created.id);
	assert.equal(stored?.id, created.id);
	assert.equal(user, null);
	assert.deepEqual(await lucia.validateSession(created.token), { session: null, user: null });
	assert.deepEqual(await adapter.getSessionAndUser(created.id), [null, null]);
}

export function createV2Record(secretHash: Uint8Array): DatabaseSession {
	return {
		id: "binary-vector",
		userId: "user",
		expiresAt: new Date(Date.now() + 60_000),
		attributes: { country: "binary" },
		tokenVersion: 2,
		secretHash
	};
}
