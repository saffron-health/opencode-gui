/**
 * Sortable timestamp-based ID generation matching OpenCode server.
 * Format: {prefix}_{12-char-hex-timestamp}{14-char-base62-random}
 *
 * The timestamp portion encodes: (BigInt(Date.now()) * 0x1000 + counter) masked to 48 bits
 * This ensures lexicographic ordering matches chronological ordering.
 *
 * Ported from: packages/opencode/src/id/id.ts in anomalyco/opencode
 */

const prefixes = {
  session: "ses",
  message: "msg",
  permission: "per",
  question: "que",
  part: "prt",
} as const;

type Prefix = keyof typeof prefixes;

const base62Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Total ID length after prefix and underscore
const LENGTH = 26;
const RANDOM_LENGTH = LENGTH - 12; // 14 random characters

let lastTimestamp = 0;
let counter = 0;

function randomBase62(length: number): string {
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += base62Chars[array[i] % 62];
  }
  return result;
}

/**
 * Encode a 48-bit BigInt value as 12 hex characters (6 bytes).
 * This matches the server's Buffer.alloc(6) approach.
 */
function encodeTimestamp(value: bigint): string {
  let hex = "";
  for (let i = 0; i < 6; i++) {
    // Extract each byte from high to low (big-endian)
    const byte = Number((value >> BigInt(40 - 8 * i)) & BigInt(0xff));
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function create(prefix: Prefix, descending: boolean, timestamp?: number): string {
  const currentTimestamp = timestamp ?? Date.now();

  // Monotonic counter: reset when timestamp changes, increment within same millisecond
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp;
    counter = 0;
  }
  counter++;

  // Encode timestamp + counter in 48 bits (6 bytes)
  // Multiply by 0x1000 (4096) to leave room for counter in lower 12 bits
  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);

  // Optionally invert for descending sort order
  if (descending) {
    now = ~now;
  }

  // Encode as 12 hex characters (automatically truncates to 48 bits via byte extraction)
  const hex = encodeTimestamp(now);

  return prefixes[prefix] + "_" + hex + randomBase62(RANDOM_LENGTH);
}

/**
 * Generate an ascending sortable ID (newer IDs sort after older ones).
 * Used for messages, parts, etc.
 */
export function ascending(prefix: Prefix): string {
  return create(prefix, false);
}

/**
 * Generate a descending sortable ID (newer IDs sort before older ones).
 * Used when you want newest items first.
 */
export function descending(prefix: Prefix): string {
  return create(prefix, true);
}

/**
 * Extract timestamp from an ID.
 */
export function timestamp(id: string): number {
  const underscoreIndex = id.indexOf("_");
  if (underscoreIndex === -1) return 0;
  const hex = id.slice(underscoreIndex + 1, underscoreIndex + 13);
  const encoded = BigInt("0x" + hex);
  return Number(encoded / BigInt(0x1000));
}

export const Id = {
  ascending,
  descending,
  timestamp,
};
