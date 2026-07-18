import type { Lucia, Session } from "../src/core.js";
import { generateIdFromEntropySize } from "../src/index.js";

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() =>
		Value extends Right ? 1 : 2
		? true
		: false;

type Assert<Value extends true> = Value;

type NonEmptySessionOptions = ConstructorParameters<
	typeof Lucia<{ region: string }, Record<never, never>>
>[1];

type NonEmptyUserOptions = ConstructorParameters<
	typeof Lucia<Record<never, never>, { handle: string }>
>[1];

type SessionMapperIsRequired = Assert<
	Equal<{} extends Pick<NonEmptySessionOptions, "getSessionAttributes"> ? true : false, false>
>;

type UserMapperIsRequired = Assert<
	Equal<{} extends Pick<NonEmptyUserOptions, "getUserAttributes"> ? true : false, false>
>;

type SessionIdIsReadonly = Assert<
	Equal<Pick<Session, "id">, { readonly id: string }>
>;

type EntropyIdGeneratorIsCompatible = Assert<
	Equal<typeof generateIdFromEntropySize, (size: number) => string>
>;
