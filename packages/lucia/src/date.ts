export type TimeSpanUnit = "ms" | "s" | "m" | "h" | "d" | "w";

export class TimeSpan {
	constructor(value: number, unit: TimeSpanUnit) {
		this.value = value;
		this.unit = unit;
	}

	public value: number;
	public unit: TimeSpanUnit;

	public milliseconds(): number {
		return this.unit === "ms" ? this.value : this.seconds() * 1000;
	}

	public seconds(): number {
		switch (this.unit) {
			case "ms":
				return this.value / 1000;
			case "s":
				return this.value;
			case "m":
				return this.value * 60;
			case "h":
				return this.value * 60 * 60;
			case "d":
				return this.value * 60 * 60 * 24;
			case "w":
				return this.value * 60 * 60 * 24 * 7;
			default:
				// Do no evil
				throw new RangeError(`Unexpected unit type ${this.unit as string} for timespan`);
		}
	}

	public transform(x: number): TimeSpan {
		return new TimeSpan(Math.round(this.milliseconds() * x), "ms");
	}
}

export const isWithinExpirationDate = (date: Date): boolean => Date.now() < date.getTime();

export const createDate = (timeSpan: TimeSpan): Date => new Date(Date.now() + timeSpan.milliseconds());
