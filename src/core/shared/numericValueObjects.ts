declare const brand: unique symbol;

/**
 * Branded numeric type: a plain `number` at runtime, but only obtainable
 * through the factory that enforces its invariant.
 */
type Branded<B extends string> = number & { readonly [brand]: B };

/** Ratio clamped to `[0, 1]`. */
export type BoundedRatio = Branded<'BoundedRatio'>;

/** Integer with a minimum value of `1`. */
export type PositiveInt = Branded<'PositiveInt'>;

/** Duration in milliseconds, always positive. */
export type DurationMs = Branded<'DurationMs'>;

/** Concurrency limit clamped to a `[min, max]` range. */
export type ConcurrencyLimit = Branded<'ConcurrencyLimit'>;

function toFiniteNumberOrFallback(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function toFloorIntOrFallback(value: number | undefined, fallback: number): number {
	return Math.floor(toFiniteNumberOrFallback(value, fallback));
}

/**
 * Creates a `BoundedRatio` from `value`, falling back to `fallback` when non-finite.
 * The result is clamped to `[0, 1]`.
 * @param value - Raw ratio value.
 * @param fallback - Fallback when `value` is non-finite.
 */
export function toBoundedRatio(value: number | undefined, fallback: number): BoundedRatio {
	const fallbackNumber = Number.isFinite(fallback) ? fallback : 0;
	const normalized = toFiniteNumberOrFallback(value, fallbackNumber);
	return Math.max(0, Math.min(1, normalized)) as BoundedRatio;
}

/**
 * Creates a `PositiveInt` flooring `value` to an integer, with a minimum of `1`.
 * @param value - Raw integer value.
 * @param fallback - Fallback when `value` is non-finite.
 */
export function toPositiveInt(value: number | undefined, fallback: number): PositiveInt {
	const fallbackInt = Math.max(1, Math.floor(Number.isFinite(fallback) ? fallback : 1));
	return Math.max(1, toFloorIntOrFallback(value, fallbackInt)) as PositiveInt;
}

/**
 * Creates a `DurationMs` from a seconds value (must be a positive integer).
 * @param value - Duration in seconds.
 * @param fallbackSeconds - Fallback seconds when `value` is non-finite.
 */
export function secondsToDurationMs(value: number | undefined, fallbackSeconds: number): DurationMs {
	const seconds = toPositiveInt(value, fallbackSeconds);
	return (seconds * 1000) as DurationMs;
}

/**
 * Creates a `ConcurrencyLimit` from `value`, clamped to `[min, max]`.
 * All bounds are normalised: `min` is at least `1`, `max` is at least `min`.
 * @param value - Desired concurrency.
 * @param fallback - Fallback when `value` is non-finite.
 * @param min - Minimum allowed concurrency (normalised to ≥ 1).
 * @param max - Maximum allowed concurrency.
 */
export function toConcurrencyLimit(
	value: number | undefined,
	fallback: number,
	min: number,
	max: number,
): ConcurrencyLimit {
	const normalizedMin = Math.max(1, Math.floor(Number.isFinite(min) ? min : 1));
	const normalizedMax = Math.max(normalizedMin, Math.floor(Number.isFinite(max) ? max : normalizedMin));
	const normalizedFallback = Math.max(
		normalizedMin,
		Math.min(normalizedMax, Math.floor(Number.isFinite(fallback) ? fallback : normalizedMin)),
	);
	const raw = toFloorIntOrFallback(value, normalizedFallback);
	return Math.max(normalizedMin, Math.min(normalizedMax, raw)) as ConcurrencyLimit;
}
