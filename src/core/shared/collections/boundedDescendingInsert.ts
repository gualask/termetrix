/**
 * Inserts a candidate into a bounded array sorted in descending order by a numeric key.
 * The array never exceeds `limit` elements. Candidates that cannot enter the list are rejected in O(1).
 *
 * @param sorted - Mutable array, kept sorted descending by `getKey`.
 * @param candidate - Item to insert.
 * @param limit - Maximum number of elements.
 * @param getKey - Extracts the numeric sort key from an item.
 */
export function insertBoundedDescending<T>(
	sorted: T[],
	candidate: T,
	limit: number,
	getKey: (item: T) => number,
): void {
	if (limit <= 0) return;

	const candidateKey = getKey(candidate);

	// Fast reject: candidate can't enter the list.
	if (sorted.length >= limit && candidateKey <= getKey(sorted[sorted.length - 1])) return;

	let insertAt = sorted.length;
	for (let i = 0; i < sorted.length; i++) {
		if (candidateKey > getKey(sorted[i])) {
			insertAt = i;
			break;
		}
	}

	if (insertAt === sorted.length) sorted.push(candidate);
	else sorted.splice(insertAt, 0, candidate);

	if (sorted.length > limit) sorted.length = limit;
}
