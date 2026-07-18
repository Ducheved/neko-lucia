import assert from "node:assert/strict";
import { test } from "node:test";

import {
	createLegacySessionToken,
	createSessionToken,
	parseSessionToken,
	verifySessionSecret
} from "../src/token.js";

test("creates canonical v2 token material", () => {
	const material = createSessionToken();
	assert.equal(material.id.length, 22);
	assert.equal(material.token.length, 66);
	assert.equal(material.token[22], ".");
	assert.equal(material.secretHash.byteLength, 32);
	const parsed = parseSessionToken(material.token);
	assert.notEqual(parsed, null);
	assert.equal(parsed?.tokenVersion, 2);
	if (parsed?.tokenVersion === 2) {
		assert.equal(parsed.id, material.id);
		assert.equal(parsed.secret.byteLength, 32);
		assert.equal(verifySessionSecret(parsed.secret, material.secretHash), true);
	}
});

test("creates Lucia v3 compatible legacy tokens", () => {
	for (let index = 0; index < 100; index++) {
		const token = createLegacySessionToken();
		assert.match(token, /^[a-z2-7]{40}$/);
		assert.deepEqual(parseSessionToken(token), {
			id: token,
			tokenVersion: 1
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
		"_".repeat(40)
	];
	for (const value of cases) {
		assert.equal(parseSessionToken(value), null);
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
	assert.notEqual(parsed, null);
	if (parsed?.tokenVersion !== 2) {
		assert.fail("Expected a v2 token");
	}
	const wrongHash = new Uint8Array(material.secretHash);
	wrongHash[0] ^= 255;
	assert.equal(verifySessionSecret(parsed.secret, wrongHash), false);
	assert.equal(verifySessionSecret(parsed.secret, wrongHash.subarray(0, 31)), false);
});
