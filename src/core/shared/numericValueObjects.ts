function toFiniteNumberOrFallback(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function toFloorIntOrFallback(value: number | undefined, fallback: number): number {
	return Math.floor(toFiniteNumberOrFallback(value, fallback));
}

/** Immutable ratio clamped to `[0, 1]`. */
export class BoundedRatio {
	private constructor(readonly value: number) {}

	/**
	 * Creates a `BoundedRatio` from `value`, falling back to `fallback` when non-finite.
	 * The result is clamped to `[0, 1]`.
	 * @param value - Raw ratio value.
	 * @param fallback - Fallback when `value` is non-finite.
	 */
	static from(value: number | undefined, fallback: number): BoundedRatio {
		const fallbackNumber = Number.isFinite(fallback) ? fallback : 0;
		const normalized = toFiniteNumberOrFallback(value, fallbackNumber);
		return new BoundedRatio(Math.max(0, Math.min(1, normalized)));
	}
}

/** Immutable integer with a minimum value of `1`. */
export class PositiveInt {
	private constructor(readonly value: number) {}

	/**
	 * Creates a `PositiveInt` flooring `value` to an integer, with a minimum of `1`.
	 * @param value - Raw integer value.
	 * @param fallback - Fallback when `value` is non-finite.
	 */
	static from(value: number | undefined, fallback: number): PositiveInt {
		const fallbackInt = Math.max(1, Math.floor(Number.isFinite(fallback) ? fallback : 1));
		return new PositiveInt(Math.max(1, toFloorIntOrFallback(value, fallbackInt)));
	}
}

/** Immutable integer with a minimum value of `0`. */
export class NonNegativeInt {
	private constructor(readonly value: number) {}

	/**
	 * Creates a `NonNegativeInt` flooring `value` to an integer, with a minimum of `0`.
	 * @param value - Raw integer value.
	 * @param fallback - Fallback when `value` is non-finite.
	 */
	static from(value: number | undefined, fallback: number): NonNegativeInt {
		const fallbackInt = Math.max(0, Math.floor(Number.isFinite(fallback) ? fallback : 0));
		return new NonNegativeInt(Math.max(0, toFloorIntOrFallback(value, fallbackInt)));
	}
}

/** Immutable duration in milliseconds, always positive. */
export class DurationMs {
	private constructor(readonly value: number) {}

	/**
	 * Creates a `DurationMs` from a seconds value (must be a positive integer).
	 * @param value - Duration in seconds.
	 * @param fallbackSeconds - Fallback seconds when `value` is non-finite.
	 */
	static fromSeconds(value: number | undefined, fallbackSeconds: number): DurationMs {
		const seconds = PositiveInt.from(value, fallbackSeconds).value;
		return new DurationMs(seconds * 1000);
	}
}

/** Immutable concurrency limit clamped to a `[min, max]` range. */
export class ConcurrencyLimit {
	private constructor(readonly value: number) {}

	/**
	 * Creates a `ConcurrencyLimit` from `value`, clamped to `[min, max]`.
	 * All bounds are normalised: `min` is at least `1`, `max` is at least `min`.
	 * @param value - Desired concurrency.
	 * @param fallback - Fallback when `value` is non-finite.
	 * @param min - Minimum allowed concurrency (normalised to ≥ 1).
	 * @param max - Maximum allowed concurrency.
	 */
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
