import {
	DrizzleMySQLAdapter,
	DrizzlePostgreSQLAdapter,
	DrizzleSQLiteAdapter
} from "@ducheved/neko-lucia-adapter-drizzle";
import { Lucia } from "@ducheved/neko-lucia";

class MemoryAdapter {
	constructor() {
		this.sessions = new Map();
		this.users = new Map([["user", { id: "user", attributes: {} }]]);
		this.deletes = 0;
	}

	getSessionAndUser(id) {
		const session = this.sessions.get(id) ?? null;
		const user = session === null ? null : (this.users.get(session.userId) ?? null);
		return Promise.resolve([session, user]);
	}

	getUserSessions(userId) {
		return Promise.resolve(
			[...this.sessions.values()].filter((session) => session.userId === userId)
		);
	}

	setSession(session) {
		this.sessions.set(session.id, session);
		return Promise.resolve();
	}

	updateSessionExpiration(id, expiresAt) {
		const session = this.sessions.get(id);
		if (session !== undefined) session.expiresAt = expiresAt;
		return Promise.resolve();
	}

	deleteSession(id) {
		this.sessions.delete(id);
		this.deletes++;
		return Promise.resolve();
	}

	deleteUserSessions(userId) {
		for (const [id, session] of this.sessions) {
			if (session.userId === userId) this.sessions.delete(id);
		}
		return Promise.resolve();
	}

	deleteExpiredSessions() {
		return Promise.resolve();
	}
}

for (const sessionTokenVersion of [1, 2]) {
	const adapter = new MemoryAdapter();
	const lucia = new Lucia(adapter, { sessionTokenVersion });
	const created = await lucia.createSession("user", {});
	if (created.id.length !== (sessionTokenVersion === 1 ? 40 : 22)) throw new Error("bad id");
	if (Object.keys(created).includes("id")) throw new Error("enumerable id");
	if (Object.keys(created).includes("token")) throw new Error("enumerable token");
	if (JSON.stringify(created).includes(created.token)) throw new Error("serialized token");
	const validated = await lucia.validateSession(created.token);
	if (validated.session?.id !== created.id) throw new Error("validation failed");
	const cookie = lucia.createSessionCookie(created.token);
	if (cookie.value !== created.token) throw new Error("cookie value failed");
	if (JSON.stringify(cookie).includes(created.token)) throw new Error("serialized cookie value");
	if (lucia.readSessionCookie(cookie.serialize()) !== created.token) throw new Error("cookie failed");
	if (
		lucia.readSessionCookie(
			`auth_session=${created.token}; auth_session=${created.token}`
		) !== null
	) {
		throw new Error("duplicate cookie accepted");
	}
	if (sessionTokenVersion === 2) {
		const replacement = created.token[30] === "A" ? "B" : "A";
		const tampered = `${created.token.slice(0, 30)}${replacement}${created.token.slice(31)}`;
		if ((await lucia.validateSession(tampered)).session !== null) throw new Error("bad secret");
		if (adapter.deletes !== 0) throw new Error("destructive secret failure");
	}
}

for (const adapterClass of [
	DrizzleMySQLAdapter,
	DrizzlePostgreSQLAdapter,
	DrizzleSQLiteAdapter
]) {
	if (typeof adapterClass !== "function") throw new Error("adapter import failed");
}
