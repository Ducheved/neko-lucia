import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import {
	createLegacySessionToken,
	createSessionToken,
	generateIdFromEntropySize,
	parseSessionToken,
	verifySessionSecret,
} from "../src/token.js";

test("matches the Lucia v3 Base32 output", (context: TestContext) => {
	context.mock.method(
		globalThis.crypto,
		"getRandomValues",
		<ArrayType extends ArrayBufferView | null>(array: ArrayType): ArrayType => {
			if (array instanceof Uint8Array) {
				array.set([102, 111, 111]);
			}
			return array;
		},
	);
	assert.equal(generateIdFromEntropySize(3), "mzxw6");
});

test("preserves the Lucia v3 entropy ID contract", () => {
	for (const [size, length] of [
		[0, 0],
		[8, 13],
		[10, 16],
		[15, 24],
		[25, 40],
	]) {
		const id = generateIdFromEntropySize(size);
		assert.equal(id.length, length);
		assert.match(id, /^[a-z2-7]*$/);
		assert.equal(id.includes("="), false);
	}
	assert.equal(generateIdFromEntropySize(1.9).length, 2);
	assert.equal(generateIdFromEntropySize(Number.NaN), "");
	assert.throws(() => generateIdFromEntropySize(-1), RangeError);
	assert.throws(() => generateIdFromEntropySize(Number.POSITIVE_INFINITY), RangeError);
	assert.equal(generateIdFromEntropySize(65_536).length, 104_858);
	assert.throws(() => generateIdFromEntropySize(65_537), {
		name: "QuotaExceededError",
	});
});

test("creates canonical v2 token material", () => {
	const material = createSessionToken();
	assert.equal(material.id.length, 22);
	assert.equal(material.token.length, 66);
	assert.equal(material.token[22], ".");
	assert.equal(material.secretHash.byteLength, 32);

	const parsed = parseSessionToken(material.token);
	assert.ok(parsed);
	assert.equal(parsed?.tokenVersion, 2, "Expected a v2 token");

	assert.equal(parsed.id, material.id);
	assert.equal(parsed.secret.byteLength, 32);
	assert.equal(verifySessionSecret(parsed.secret, material.secretHash), true);
});

// @NOTE: copied and not referenced to catch spurious changes to the legacy
// token pattern in token.ts
const LEGACY_TOKEN_RE = /^[a-z2-7]{40}$/;

test("creates Lucia v3 compatible legacy tokens", () => {
	for (let index = 0; index < 100; index++) {
		const token = createLegacySessionToken();
		assert.match(token, LEGACY_TOKEN_RE);
		assert.deepEqual(parseSessionToken(token), {
			id: token,
			tokenVersion: 1,
		});
	}
});

test("rejects malformed and non-canonical tokens", () => {
	const material = createSessionToken();
	const cases = [
		"",
		material.id,
		`${material.token}.x`,
		material.token.replace(".", ".."),
		`${material.token}=`,
		`${material.token.slice(0, 30)}!${material.token.slice(31)}`,
		"1".repeat(40),
		"2".repeat(39),
		"_".repeat(40),
	];
	for (const value of cases) {
		assert.ok(!parseSessionToken(value));
	}
});

test("validates custom IDs for the active format", () => {
	const v2 = createSessionToken();
	assert.equal(createSessionToken(v2.id).id, v2.id);

	const legacy = createLegacySessionToken();
	assert.equal(createLegacySessionToken(legacy), legacy);
	assert.throws(() => createSessionToken(legacy), TypeError);
	assert.throws(() => createLegacySessionToken(v2.id), TypeError);
});

test("rejects hashes with a wrong value or length", () => {
	const material = createSessionToken();
	const parsed = parseSessionToken(material.token);
	assert.ok(parsed);

	assert.equal(parsed?.tokenVersion, 2, "Expected a v2 token");

	const wrongHash = new Uint8Array(material.secretHash);
	wrongHash[0] ^= 255;
	assert.ok(!verifySessionSecret(parsed.secret, wrongHash));
	assert.ok(!verifySessionSecret(parsed.secret, wrongHash.subarray(0, 31)));
});
