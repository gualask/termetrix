function toFiniteNumberOrFallback(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function toFloorIntOrFallback(value: number | undefined, fallback: number): number {
	return Math.floor(toFiniteNumberOrFallback(value, fallback));
}

export class BoundedRatio {
	private constructor(readonly value: number) {}

	static from(value: number | undefined, fallback: number): BoundedRatio {
		const fallbackNumber = Number.isFinite(fallback) ? fallback : 0;
		const normalized = toFiniteNumberOrFallback(value, fallbackNumber);
		return new BoundedRatio(Math.max(0, Math.min(1, normalized)));
	}
}

export class PositiveInt {
	private constructor(readonly value: number) {}

	static from(value: number | undefined, fallback: number): PositiveInt {
		const fallbackInt = Math.max(1, Math.floor(Number.isFinite(fallback) ? fallback : 1));
		return new PositiveInt(Math.max(1, toFloorIntOrFallback(value, fallbackInt)));
	}
}

export class NonNegativeInt {
	private constructor(readonly value: number) {}

	static from(value: number | undefined, fallback: number): NonNegativeInt {
		const fallbackInt = Math.max(0, Math.floor(Number.isFinite(fallback) ? fallback : 0));
		return new NonNegativeInt(Math.max(0, toFloorIntOrFallback(value, fallbackInt)));
	}
}

export class DurationMs {
	private constructor(readonly value: number) {}

	static fromSeconds(value: number | undefined, fallbackSeconds: number): DurationMs {
		const seconds = PositiveInt.from(value, fallbackSeconds).value;
		return new DurationMs(seconds * 1000);
	}
}

export class ConcurrencyLimit {
	private constructor(readonly value: number) {}

	static bounded(
		value: number | undefined,
		fallback: number,
		min: number,
		max: number
	): ConcurrencyLimit {
		const normalizedMin = Math.max(1, Math.floor(Number.isFinite(min) ? min : 1));
		const normalizedMax = Math.max(normalizedMin, Math.floor(Number.isFinite(max) ? max : normalizedMin));
		const normalizedFallback = Math.max(
			normalizedMin,
			Math.min(normalizedMax, Math.floor(Number.isFinite(fallback) ? fallback : normalizedMin))
		);
		const raw = toFloorIntOrFallback(value, normalizedFallback);
		return new ConcurrencyLimit(Math.max(normalizedMin, Math.min(normalizedMax, raw)));
	}
}
