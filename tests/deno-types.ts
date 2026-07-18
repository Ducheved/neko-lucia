import {
	DrizzleMySQLAdapter,
	DrizzlePostgreSQLAdapter,
	DrizzleSQLiteAdapter
} from "@ducheved/neko-lucia-adapter-drizzle";
import { Lucia } from "@ducheved/neko-lucia";

import type { Adapter } from "@ducheved/neko-lucia";

declare const adapter: Adapter;

const lucia = new Lucia(adapter, {
	sessionTokenVersion: 2,
	getSessionAttributes(attributes) {
		return { region: attributes.region };
	},
	getUserAttributes(attributes) {
		return { handle: attributes.handle };
	}
});

declare module "@ducheved/neko-lucia" {
	interface Register {
		Lucia: typeof lucia;
		UserId: string;
		DatabaseSessionAttributes: {
			region: string;
		};
		DatabaseUserAttributes: {
			handle: string;
		};
	}
}

const session = lucia.createSession("user", { region: "us-east" });
const adapterExports = [DrizzleMySQLAdapter, DrizzlePostgreSQLAdapter, DrizzleSQLiteAdapter];

void session;
void adapterExports;
