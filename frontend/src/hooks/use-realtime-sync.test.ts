/**
 * Tests for the `getBackoffDelay` utility and exponential backoff constants.
 *
 * Covers:
 *   - Unit tests (task 5.2): exact delay values for attempts 1–10
 *   - Property test (task 5.1): Property 5 — Exponential Backoff Delay Calculation
 *
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  getBackoffDelay,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  MAX_ATTEMPTS,
} from "./use-realtime-sync";

// ---------------------------------------------------------------------------
// Unit tests — task 5.2
// ---------------------------------------------------------------------------

describe("getBackoffDelay — unit tests", () => {
  it("attempt 1 returns 1000 ms", () => {
    expect(getBackoffDelay(1)).toBe(1000);
  });

  it("attempt 2 returns 2000 ms", () => {
    expect(getBackoffDelay(2)).toBe(2000);
  });

  it("attempt 3 returns 4000 ms", () => {
    expect(getBackoffDelay(3)).toBe(4000);
  });

  it("attempt 4 returns 8000 ms", () => {
    expect(getBackoffDelay(4)).toBe(8000);
  });

  it("attempt 5 returns 16000 ms", () => {
    expect(getBackoffDelay(5)).toBe(16000);
  });

  it("attempt 6 returns 30000 ms (cap)", () => {
    expect(getBackoffDelay(6)).toBe(30000);
  });

  it("attempt 10 returns 30000 ms (cap)", () => {
    expect(getBackoffDelay(10)).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// Exported constants sanity checks
// ---------------------------------------------------------------------------

describe("backoff constants", () => {
  it("BACKOFF_BASE_MS is 1000", () => {
    expect(BACKOFF_BASE_MS).toBe(1000);
  });

  it("BACKOFF_MAX_MS is 30000", () => {
    expect(BACKOFF_MAX_MS).toBe(30_000);
  });

  it("MAX_ATTEMPTS is 10", () => {
    expect(MAX_ATTEMPTS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Property-based test — task 5.1
// Property 5: Exponential Backoff Delay Calculation
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

describe("getBackoffDelay — Property 5: Exponential Backoff Delay Calculation", () => {
  it(
    "for any attempt N in [1, 10], getBackoffDelay(N) equals min(1000 * 2^(N-1), 30000)",
    () => {
      fc.assert(
        fc.property(
          // Generate integers in the valid attempt range [1, 10]
          fc.integer({ min: 1, max: MAX_ATTEMPTS }),
          (attempt) => {
            const expected = Math.min(
              BACKOFF_BASE_MS * Math.pow(2, attempt - 1),
              BACKOFF_MAX_MS
            );
            expect(getBackoffDelay(attempt)).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
