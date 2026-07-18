import type { RegisteredDatabaseSessionAttributes, RegisteredDatabaseUserAttributes, UserId } from "./index.js";

export interface Adapter {
	getSessionAndUser(sessionId: string): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]>;
	getUserSessions(userId: UserId): Promise<DatabaseSession[]>;
	setSession(session: DatabaseSession): Promise<void>;
	updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void>;
	deleteSession(sessionId: string): Promise<void>;
	deleteUserSessions(userId: UserId): Promise<void>;
	deleteExpiredSessions(): Promise<void>;
}

export interface DatabaseUser {
	id: UserId;
	attributes: RegisteredDatabaseUserAttributes;
}

interface DatabaseSessionBase {
	userId: UserId;
	expiresAt: Date;
	id: string;
	attributes: RegisteredDatabaseSessionAttributes;
}

export type DatabaseSession = DatabaseSessionBase &
	(
		| {
				tokenVersion: 1;
				secretHash: null;
		  }
		| {
				tokenVersion: 2;
				secretHash: Uint8Array;
		  }
	);
