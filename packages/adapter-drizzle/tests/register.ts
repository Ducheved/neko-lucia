declare module "@ducheved/neko-lucia" {
	interface Register {
		UserId: string;
		DatabaseUserAttributes: {
			username: string;
		};
		DatabaseSessionAttributes: {
			country: string;
		};
	}
}

export {};
