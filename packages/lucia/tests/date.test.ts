import assert from "node:assert/strict";
import { test } from "node:test";

import { TimeSpan, type TimeSpanUnit } from "../src/date.js";

test("stores value and unit verbatim", () => {
	const span = new TimeSpan(30, "m");
	assert.equal(span.value, 30);
	assert.equal(span.unit, "m");
});

type TimeUnitTestCase = [number, TimeSpanUnit, number];

test("converts every unit to seconds", () => {
	const cases: TimeUnitTestCase[] = [
		[1, "s", 1],
		[1, "m", 60],
		[1, "h", 3_600],
		[1, "d", 86_400],
		[1, "w", 604_800],
		[1000, "ms", 1],
	];

	for (const [value, unit, expected] of cases) {
		assert.equal(new TimeSpan(value, unit).seconds(), expected);
	}
});

test("converts every unit to milliseconds", () => {
	const cases: TimeUnitTestCase[] = [
		[1, "ms", 1],
		[2, "ms", 2],
		[1, "s", 1000],
		[1, "m", 60_000],
		[1, "h", 3_600_000],
		[1, "d", 86_400_000],
		[1, "w", 604_800_000],
		[7, "d", 604_800_000],
		[0, "h", 0],
	];

	for (const [value, unit, expected] of cases) {
		assert.equal(new TimeSpan(value, unit).milliseconds(), expected);
	}
});

test("transform scales the span and rewrites it as milliseconds", () => {
	const doubled = new TimeSpan(1, "s").transform(2);
	assert.equal(doubled.unit, "ms");
	assert.equal(doubled.value, 2000);
	assert.equal(doubled.milliseconds(), 2000);

	const halved = new TimeSpan(1, "s").transform(0.5);
	assert.equal(halved.unit, "ms");
	assert.equal(halved.value, 500);
	assert.equal(halved.milliseconds(), 500);
});

test("transform rounds to the nearest millisecond", () => {
	const cases: [number, number][] = [
		[2.4, 2],
		[2.5, 3],
		[0.5, 1],
		[0.4, 0],
	];

	for (const [multiplier, expected] of cases) {
		assert.equal(new TimeSpan(1, "ms").transform(multiplier).value, expected);
	}
});

test("transform leaves the source span untouched", () => {
	const span = new TimeSpan(1, "s");
	const scaled = span.transform(3);
	assert.equal(span.value, 1);
	assert.equal(span.unit, "s");
	assert.notEqual(scaled, span);
});

test("rejects units corrupted using cast-through-unknown", () => {
	const span = new TimeSpan(5, "s");

	// Corrupting the span
	span.unit = "years" as unknown as TimeSpanUnit;
	assert.equal(span.unit, "years");

	assert.throws(
		() => span.milliseconds(),
		(err: unknown) => err instanceof RangeError && err.message.includes("Unexpected unit type years for timespan"),
	);

	assert.throws(() => span.seconds(), RangeError);
	assert.throws(() => span.transform(1), RangeError);
});
