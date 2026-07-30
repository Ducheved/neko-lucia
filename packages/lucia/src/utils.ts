/**
 * This is the most performant way to check if the value is nilable.
 * Sadly, it relies on JS value coersion principles so using non-strict
 * equality is allowed only here.
 *
 * Alternatively, I could have pulled lodash, rambda or ramda in this project
 * but pulling a large helper library for a single function that only takes
 * up a single line of space seems like a textbook definition of an overkill.
 */

/* eslint-disable eqeqeq */
// deno-lint-ignore eqeqeq
export const isNil = <T>(value: T): value is (null | undefined) & T => value == null;
/* eslint-enable eqeqeq */
