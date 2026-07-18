import assert from "node:assert/strict";
import { test } from "node:test";

import { Lucia } from "../src/core.js";
import { TimeSpan } from "../src/date.js";

import type { Adapter, DatabaseSession, DatabaseUser } from "../src/database.js";

class MemoryAdapter implements Adapter {
	public sessions = new Map<string, DatabaseSession>();
	public users = new Map<string, DatabaseUser>();
	public reads = 0;
	public deletes = 0;
	public expirationUpdates = 0;

	public async getSessionAndUser(sessionId: string): Promise<[DatabaseSession | null, DatabaseUser | null]> {
		this.reads++;
		const session = this.sessions.get(sessionId) ?? null;
		const user = session === null ? null : (this.users.get(String(session.userId)) ?? null);
		return [session, user];
	}

	public async getUserSessions(userId: string): Promise<DatabaseSession[]> {
		return [...this.sessions.values()].filter((session) => session.userId === userId);
	}

	public async setSession(session: DatabaseSession): Promise<void> {
		this.sessions.set(session.id, session);
	}

	public async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (session !== undefined) {
			session.expiresAt = expiresAt;
			this.expirationUpdates++;
		}
	}

	public async deleteSession(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
		this.deletes++;
	}

	public async deleteUserSessions(userId: string): Promise<void> {
		for (const [id, session] of this.sessions) {
			if (session.userId === userId) {
				this.sessions.delete(id);
			}
		}
	}

	public async deleteExpiredSessions(): Promise<void> {
		for (const [id, session] of this.sessions) {
			if (session.expiresAt.getTime() <= Date.now()) {
				this.sessions.delete(id);
			}
		}
	}
}

function createAdapter(): MemoryAdapter {
	const adapter = new MemoryAdapter();
	adapter.users.set("user", {
		id: "user",
		attributes: {},
	});
	return adapter;
}

test("creates legacy sessions only when v1 is explicit", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 1 });
	const created = await lucia.createSession("user", {});
	assert.match(created.id, /^[a-z2-7]{40}$/);
	assert.equal(created.token, created.id);
	assert.equal(Object.keys(created).includes("id"), false);
	assert.equal(Object.keys(created).includes("token"), false);
	assert.equal(Reflect.set(created, "id", "replacement"), false);
	assert.deepEqual(Object.getOwnPropertyDescriptor(created, "id"), {
		configurable: false,
		enumerable: false,
		value: created.id,
		writable: false,
	});
	assert.equal(JSON.stringify(created).includes(created.token), false);
	const result = await lucia.validateSession(created.token);
	assert.equal(result.session?.id, created.id);
	assert.equal(Object.keys(result.session ?? {}).includes("id"), false);
	assert.equal(result.user?.id, "user");
});

test("requires an exact token writer mode at runtime", () => {
	const adapter = createAdapter();
	for (const options of [
		undefined,
		{},
		{ sessionTokenVersion: undefined },
		{ sessionTokenVersion: 0 },
		{ sessionTokenVersion: 3 },
		{ sessionTokenVersion: "2" },
	]) {
		assert.throws(() => Reflect.construct(Lucia, [adapter, options]), TypeError);
	}
	assert.doesNotThrow(() => new Lucia(adapter, { sessionTokenVersion: 1 }));
	assert.doesNotThrow(() => new Lucia(adapter, { sessionTokenVersion: 2 }));
});

test("creates and validates v2 sessions without exposing token material", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", {});
	assert.equal(created.id.length, 22);
	assert.equal(created.token.length, 66);
	assert.notEqual(created.id, created.token);
	assert.equal(Object.keys(created).includes("id"), false);
	assert.equal(Object.keys(created).includes("token"), false);
	assert.equal(JSON.stringify(created).includes('"token"'), false);
	assert.equal(JSON.stringify(created).includes(created.token), false);
	const stored = adapter.sessions.get(created.id);
	assert.equal(stored?.tokenVersion, 2);
	assert.equal(stored?.secretHash?.byteLength, 32);
	const result = await lucia.validateSession(created.token);
	assert.equal(result.session?.id, created.id);
	assert.equal(Object.keys(result.session ?? {}).includes("id"), false);
	assert.equal(result.user?.id, "user");
});

test("rejects malformed tokens before storage access", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	assert.deepEqual(await lucia.validateSession("invalid"), { session: null, user: null });
	assert.equal(adapter.reads, 0);
	assert.equal(adapter.deletes, 0);
	assert.equal(adapter.expirationUpdates, 0);
});

test("wrong secrets are non-destructive", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", {});
	const before = adapter.sessions.get(created.id);
	assert.notEqual(before, undefined);
	const original = created.token[30];
	const tampered = `${created.token.slice(0, 30)}${original === "A" ? "B" : "A"}${created.token.slice(31)}`;
	assert.deepEqual(await lucia.validateSession(tampered), { session: null, user: null });
	assert.equal(adapter.sessions.get(created.id), before);
	assert.equal(adapter.deletes, 0);
	assert.equal(adapter.expirationUpdates, 0);
	assert.equal((await lucia.validateSession(created.token)).session?.id, created.id);
});

test("version mismatch is non-destructive", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", {});
	const original = adapter.sessions.get(created.id);
	assert.notEqual(original, undefined);
	const mismatched = {
		...original,
		tokenVersion: 1,
		secretHash: null,
	} as DatabaseSession;
	adapter.sessions.set(created.id, mismatched);
	assert.deepEqual(await lucia.validateSession(created.token), { session: null, user: null });
	assert.equal(adapter.sessions.get(created.id), mismatched);
	assert.equal(adapter.deletes, 0);
	assert.equal(adapter.expirationUpdates, 0);
	adapter.sessions.set(created.id, original as DatabaseSession);
	assert.equal((await lucia.validateSession(created.token)).session?.id, created.id);
});

test("expired and orphan sessions mutate only after token authentication", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const expired = await lucia.createSession("user", {});
	const expiredRow = adapter.sessions.get(expired.id);
	assert.notEqual(expiredRow, undefined);
	if (expiredRow !== undefined) {
		expiredRow.expiresAt = new Date(0);
	}
	const original = expired.token[30];
	const tampered = `${expired.token.slice(0, 30)}${original === "A" ? "B" : "A"}${expired.token.slice(31)}`;
	assert.deepEqual(await lucia.validateSession(tampered), { session: null, user: null });
	assert.equal(adapter.sessions.has(expired.id), true);
	assert.deepEqual(await lucia.validateSession(expired.token), { session: null, user: null });
	assert.equal(adapter.sessions.has(expired.id), false);
	const orphan = await lucia.createSession("user", {});
	adapter.users.delete("user");
	const orphanOriginal = orphan.token[30];
	const orphanTampered = `${orphan.token.slice(0, 30)}${orphanOriginal === "A" ? "B" : "A"}${orphan.token.slice(31)}`;
	assert.deepEqual(await lucia.validateSession(orphanTampered), { session: null, user: null });
	assert.equal(adapter.sessions.has(orphan.id), true);
	assert.deepEqual(await lucia.validateSession(orphan.token), { session: null, user: null });
	assert.equal(adapter.sessions.has(orphan.id), false);
});

test("refresh preserves half-life write frequency", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, {
		sessionExpiresIn: new TimeSpan(100, "ms"),
		sessionTokenVersion: 2,
	});
	const created = await lucia.createSession("user", {});
	const stored = adapter.sessions.get(created.id);
	assert.notEqual(stored, undefined);
	if (stored !== undefined) {
		stored.expiresAt = new Date(Date.now() + 10);
	}
	const first = await lucia.validateSession(created.token);
	assert.equal(first.session?.fresh, true);
	assert.equal(adapter.expirationUpdates, 1);
	const second = await lucia.validateSession(created.token);
	assert.equal(second.session?.fresh, false);
	assert.equal(adapter.expirationUpdates, 1);
});

test("cookie and bearer readers enforce token grammar", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const created = await lucia.createSession("user", {});
	const cookie = lucia.createSessionCookie(created.token);
	assert.equal(cookie.value, created.token);
	assert.equal(Object.keys(cookie).includes("value"), false);
	assert.equal(JSON.stringify(cookie).includes(created.token), false);
	assert.equal(({ ...cookie } as { value?: string }).value, undefined);
	assert.equal((structuredClone(cookie) as { value?: string }).value, undefined);
	assert.equal(lucia.readSessionCookie(cookie.serialize()), created.token);
	assert.equal(lucia.readBearerToken(`Bearer ${created.token}`), created.token);
	assert.equal(lucia.readBearerToken(`bearer ${created.token}`), null);
	assert.equal(lucia.readBearerToken(`Bearer  ${created.token}`), null);
	assert.throws(() => lucia.createSessionCookie(created.id), TypeError);
	const blank = lucia.createBlankSessionCookie();
	assert.equal(blank.value, "");
	assert.equal(Object.keys(blank).includes("value"), false);
});

test("cookie parser rejects only duplicate target names", async () => {
	const adapter = createAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion: 2 });
	const first = await lucia.createSession("user", {});
	const second = await lucia.createSession("user", {});
	assert.equal(lucia.readSessionCookie(`auth_session=${first.token}; auth_session=${second.token}`), null);
	assert.equal(lucia.readSessionCookie(`auth_session=${first.token}; auth_session=${first.token}`), null);
	assert.equal(lucia.readSessionCookie(`auth_session=${first.token}; %61uth_session=${second.token}`), null);
	assert.equal(lucia.readSessionCookie(`other=a; other=b; auth_session=${first.token}`), first.token);
	assert.equal(lucia.readSessionCookie(`broken%=x; auth_session=${first.token}`), first.token);
});

test("cookie configuration enforces the runtime boundary", () => {
	const adapter = createAdapter();
	const construct = (sessionCookie: unknown): Lucia =>
		Reflect.construct(Lucia, [adapter, { sessionTokenVersion: 2, sessionCookie }]) as Lucia;
	assert.throws(
		() =>
			new Lucia(adapter, {
				sessionTokenVersion: 2,
				sessionCookie: { attributes: { sameSite: "none", secure: false } },
			}),
		TypeError,
	);
	assert.throws(
		() =>
			new Lucia(adapter, {
				sessionTokenVersion: 2,
				sessionCookie: {
					name: "__Host-session",
					attributes: { domain: "example.com" },
				},
			}),
		TypeError,
	);
	assert.throws(
		() =>
			new Lucia(adapter, {
				sessionTokenVersion: 2,
				sessionCookie: {
					name: "__Secure-session",
					attributes: { secure: false },
				},
			}),
		TypeError,
	);
	for (const invalid of [
		{ name: "" },
		{ name: "auth+session" },
		{ name: "auth%session" },
		{ name: "auth#session" },
		{ expires: "yes" },
		{ attributes: "secure" },
		{ attributes: { secure: "yes" } },
		{ attributes: { sameSite: "invalid" } },
		{ attributes: { path: "relative" } },
		{ attributes: { path: "/bad;path" } },
		{ attributes: { domain: "bad domain" } },
	]) {
		assert.throws(() => construct(invalid), TypeError);
	}
	const inherited = Object.create({ secure: false });
	assert.throws(() => construct({ attributes: inherited }), TypeError);
	const hardened = construct({
		name: "auth_session",
		attributes: {
			httpOnly: false,
			maxAge: 1,
			expires: new Date(0),
		},
	});
	const hardenedCookie = hardened.createBlankSessionCookie();
	assert.equal(hardenedCookie.attributes.httpOnly, true);
	assert.equal(hardenedCookie.serialize().includes("HttpOnly"), true);
	const local = new Lucia(adapter, {
		sessionTokenVersion: 2,
		sessionCookie: {
			name: "auth_session",
			attributes: { secure: false },
		},
	});
	assert.equal(local.createBlankSessionCookie().attributes.secure, false);
	const named = new Lucia(adapter, {
		sessionTokenVersion: 2,
		sessionCookie: { name: "__Host-auth_session" },
	});
	assert.equal(named.sessionCookieName, "__Host-auth_session");
	assert.equal(named.createBlankSessionCookie().serialize().startsWith("__Host-auth_session="), true);
});
