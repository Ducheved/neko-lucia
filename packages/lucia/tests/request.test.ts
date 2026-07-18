import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyRequestOrigin } from "../src/request.js";

type OriginCase = [origin: string, allowedDomains: string[], expected: boolean];

function assertOrigin(origin: string, allowedDomains: string[], expected: boolean) {
	assert.equal(
		verifyRequestOrigin(origin, allowedDomains),
		expected,
		`origin=${origin} allowedDomains=${JSON.stringify(allowedDomains)}`,
	);
}

function assertOriginMatches(origin: string, allowedDomains: string[]) {
	assert.ok(
		verifyRequestOrigin(origin, allowedDomains),
		`origin=${origin} allowedDomains=${JSON.stringify(allowedDomains)}`,
	);
}

function assertOriginNotMatches(origin: string, allowedDomains: string[]) {
	assert.ok(
		!verifyRequestOrigin(origin, allowedDomains),
		`origin=${origin} allowedDomains=${JSON.stringify(allowedDomains)}`,
	);
}

test("accepts an exact host match", () => {
	const cases: OriginCase[] = [
		["https://example.com", ["example.com"], true],
		["https://example.com", ["https://example.com"], true],
		["https://example.com", ["http://example.com"], true],
		["https://example.com", ["example.com", "example.org"], true],
		["https://example.org", ["example.com", "example.org"], true],
		["https://example.com", ["https://example.com", "http://example.org"], true],
		["https://127.0.0.1", ["127.0.0.1"], true],
		["https://127.0.0.1", ["127.0.0.2"], false],
		["https://[::1]", ["[::1]"], true],
		["https://[::1]:8080", ["[::1]:8080"], true],
		["https://[2001:db8::1]", ["[2001:db8::1]"], true],
		["https://example.com", ["example.org"], false],
	];

	for (const testCase of cases) {
		assertOrigin(...testCase);
	}
});

test("normalizes default ports for known schemes", () => {
	const cases: OriginCase[] = [
		["https://example.com:443", ["example.com"], true],
		["http://example.com:80", ["example.com"], true],
		["https://example.com", ["https://example.com:443"], true],
		["http://example.com", ["http://example.com:80"], true],
		["https://example.com:443", ["https://example.com:443"], true],
		["https://127.0.0.1:443", ["127.0.0.1"], true],
		["http://127.0.0.1:80", ["127.0.0.1"], true],
		["https://[::1]:443", ["[::1]"], true],
		["http://[::1]:80", ["[::1]"], true],
		["http://example.com:443", ["example.com"], false],
		["https://example.com:80", ["example.com"], false],
		["https://127.0.0.1:80", ["127.0.0.1"], false],
		["http://127.0.0.1:443", ["127.0.0.1"], false],
		["http://[::1]:443", ["[::1]"], false],
		["https://[::1]:80", ["[::1]"], false],
	];

	for (const testCase of cases) {
		assertOrigin(...testCase);
	}
});

test("requires non-default ports to match exactly", () => {
	const cases: OriginCase[] = [
		["https://example.com:8080", ["example.com"], false],
		["https://example.com:8080", ["example.com:8080"], true],
		["https://example.com:8443", ["example.com"], false],
		["https://example.com:8443", ["example.com:8443"], true],
		["https://127.0.0.1:8080", ["127.0.0.1"], false],
		["https://127.0.0.1:8080", ["127.0.0.1:8080"], true],
		["https://[::1]:8080", ["[::1]"], false],
		["https://[::1]:8080", ["[::1]:8080"], true],
		["https://[2001:db8::1]:8080", ["[2001:db8::1]"], false],
		["https://[2001:db8::1]:8080", ["[2001:db8::1]:8080"], true],
	];

	for (const testCase of cases) {
		assertOrigin(...testCase);
	}
});

test("ignores path, query, fragment, and userinfo", () => {
	const cases: OriginCase[] = [
		["https://example.com/path", ["example.com"], true],
		["https://example.com/path?q=1#frag", ["example.com"], true],
		["https://example.com", ["https://example.com/path"], true],
		["https://user:pass@example.com", ["example.com"], true],
		["https://example.com?#", ["example.com"], true],
		["https://127.0.0.1/admin", ["127.0.0.1"], true],
		["https://[::1]/api?q=1", ["[::1]"], true],
		["https://example.com/127.0.0.1", ["127.0.0.1"], false],
		["https://example.com/x", ["other.com"], false],
	];

	for (const testCase of cases) {
		assertOrigin(...testCase);
	}
});

test("rejects subdomain and suffix lookalikes", () => {
	const cases: OriginCase[] = [
		["https://sub.example.com", ["example.com"], false],
		["https://sub.example.com", [".example.com"], false],
		["https://example.com.evil.com", ["example.com"], false],
		["https://malicious.com", ["example.com"], false],
		["https://127.0.0.10", ["127.0.0.1"], false],
		["https://[2001:db8::1]", ["[2001:db8::2]"], false],
		["https://[::1]", ["[::]"], false],
		["https://example.com", ["example.com"], true],
		["https://127.0.0.1", ["127.0.0.1"], true],
		["https://[::1]", ["[::1]"], true],
	];

	for (const testCase of cases) {
		assertOrigin(...testCase);
	}
});

type OriginSingleCase = [origin: string, allowedDomains: string[]];

test("rejects empty or malformed inputs", () => {
	const cases: OriginSingleCase[] = [
		["", ["example.com"]],
		["https://example.com", []],
		["https://example.com", [""]],
		["https://example.com", ["https://"]],
		["example.com", ["example.com"]],
		["//example.com", ["example.com"]],
		["not-a-url", ["not-a-url"]],
		["javascript:alert(1)", ["alert(1)"]],
		["data:text/html,foo", ["text/html,foo"]],
		["https://256.1.1.1", ["256.1.1.1"]],
		["https://[::1", ["[::1"]],
		["https://[::1]]", ["[::1]]"]],
	];

	for (const testCase of cases) {
		assertOriginNotMatches(...testCase);
	}
});

// Smoke test, catching potential inconsistent behavious of `new URL(...)`
test("lowercases the origin and allowed domain hosts", () => {
	const cases: OriginSingleCase[] = [
		["HTTPS://Example.COM", ["example.com"]],
		["https://[2001:DB8::1]", ["[2001:db8::1]"]],
		["HTTPS://127.0.0.1", ["127.0.0.1"]],
		["https://example.com", ["Example.com"]],
	];

	for (const testCase of cases) {
		assertOriginMatches(...testCase);
	}
});
