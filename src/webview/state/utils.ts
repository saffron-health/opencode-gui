import type { MessagePart } from "../types";

/**
 * Binary search for sorted arrays (used for sessions which have sortable IDs).
 * Returns the index where the item is or should be inserted.
 */
export function binarySearch<T>(
  arr: T[],
  id: string,
  getId: (item: T) => string
): { found: boolean; index: number } {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (getId(arr[mid]) < id) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return {
    found: low < arr.length && getId(arr[low]) === id,
    index: low,
  };
}

/**
 * Extract text content from message parts, filtering out synthetic/ignored parts.
 */
export function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter(
      (p) =>
        p?.type === "text" &&
        typeof p.text === "string" &&
        !(p as { synthetic?: boolean }).synthetic &&
        !(p as { ignored?: boolean }).ignored
    )
    .map((p) => p.text as string)
    .join("\n");
}
