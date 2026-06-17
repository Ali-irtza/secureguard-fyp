/**
 * Shared TypeScript type definitions for the real-time data synchronization system.
 *
 * This module contains all types used by the `useRealtimeSync` hook and its
 * consuming components. It has no React dependencies — pure type definitions only.
 *
 * @module types/realtime
 */

// ---------------------------------------------------------------------------
// Core subscription types
// ---------------------------------------------------------------------------

/**
 * The connection state of a Supabase Realtime channel.
 *
 * - `SUBSCRIBED`    — channel is active and receiving CDC events
 * - `TIMED_OUT`     — channel failed to connect within the timeout window
 * - `CLOSED`        — channel was explicitly unsubscribed or gave up after max retries
 * - `CHANNEL_ERROR` — channel encountered an error; reconnection may be in progress
 */
export type SubscriptionStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

/**
 * A typed wrapper around a Supabase Realtime CDC payload for a single table row.
 *
 * @template T - The shape of the database row being observed. Must be a plain object
 *               (`Record<string, unknown>`).
 */
export interface RealtimeEvent<T extends Record<string, unknown>> {
  /** The type of database operation that produced this event. */
  eventType: "INSERT" | "UPDATE" | "DELETE";
  /**
   * The row state after the operation.
   * For DELETE events this will be an empty object `{}`.
   */
  new: T;
  /**
   * The row state before the operation.
   * For INSERT events this will be an empty object `{}`.
   * Typed as `Partial<T>` because Supabase only returns old values for columns
   * included in the table's replica identity.
   */
  old: Partial<T>;
  /** ISO 8601 timestamp of the WAL commit that produced this event. */
  commitTimestamp: string;
}

// ---------------------------------------------------------------------------
// Hook option and return types
// ---------------------------------------------------------------------------

/**
 * Configuration options accepted by the `useRealtimeSync<T>` hook.
 *
 * @template T - The shape of the database row being subscribed to.
 */
export interface UseRealtimeSyncOptions<T extends Record<string, unknown>> {
  /** PostgreSQL table name to subscribe to (e.g. `"scans"`, `"alerts"`). */
  table: string;
  /**
   * Optional Supabase PostgREST filter string scoping the subscription to a
   * subset of rows (e.g. `"team_id=eq.abc123"`).
   */
  filter?: string;
  /** Called when a new row is inserted into the subscribed table. */
  onInsert?: (event: RealtimeEvent<T>) => void;
  /** Called when an existing row in the subscribed table is updated. */
  onUpdate?: (event: RealtimeEvent<T>) => void;
  /** Called when a row is deleted from the subscribed table. */
  onDelete?: (event: RealtimeEvent<T>) => void;
  /**
   * Whether the subscription should be active.
   * When set to `false` the hook will not create a channel.
   * Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Values returned by the `useRealtimeSync<T>` hook.
 *
 * Consuming components use these to render connection state indicators and
 * monitor subscription health during development.
 */
export interface UseRealtimeSyncReturn {
  /** Current connection state of the Realtime channel. */
  status: SubscriptionStatus;
  /**
   * Number of reconnection attempts made since the last successful connection.
   * Resets to `0` after a successful subscription. Caps at `10` before the
   * hook gives up and sets `status` to `"CLOSED"`.
   */
  connectionCount: number;
}

// ---------------------------------------------------------------------------
// Domain record types (mirror actual PostgreSQL table columns)
// ---------------------------------------------------------------------------

/**
 * A row in the `scans` table.
 * Linked to `projects` via project_id.
 */
export type ScanRecord = Record<string, unknown> & {
  id: string;
  project_id: string;
  user_id: string;
  /** scan_status enum: "pending" | "in_progress" | "completed" | "failed" */
  status: "pending" | "in_progress" | "completed" | "failed";
  file_path: string | null;
  branch: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  file_name: string | null;
  language: string | null;
  total_lines: number | null;
  scan_duration_seconds: number | null;
};

/**
 * A row in the `vulnerabilities` table.
 * Linked to `scans` via scan_id.
 */
export type VulnerabilityRecord = Record<string, unknown> & {
  id: string;
  scan_id: string;
  /** vuln_severity enum */
  severity: string;
  type: string | null;
  line_number: number | null;
  description: string | null;
  code_snippet: string | null;
  created_at: string;
  vulnerability_type: string | null;
  line_start: number | null;
  line_end: number | null;
  user_id: string;
  name: string | null;
  /** report_format enum */
  format: string | null;
  /** report_status enum */
  file_path: string | null;
  updated_at: string;
};

/**
 * A row in the `alerts` table.
 * Linked to `vulnerabilities` via vulnerability_id.
 */
export type AlertRecord = Record<string, unknown> & {
  id: string;
  vulnerability_id: string;
  user_id: string;
  /** alert_status enum: "resolved" | "acknowledged" | "open" */
  status: "resolved" | "acknowledged" | "open";
  created_at: string;
  updated_at: string;
};

/**
 * A row in the `projects` table.
 */
export type ProjectRecord = Record<string, unknown> & {
  id: string;
  name: string;
  /** project_language enum */
  language: string | null;
  /** health_score letter grade: "A" | "B" | "C" | "D" | "F" */
  health_score: string | null;
  /** project_type: "personal" | "team" */
  type: string | null;
  owner_id: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  project_name: string | null;
  scan_type: string | null;
};

/**
 * A row in the `team_members` table.
 */
export type TeamMemberRecord = Record<string, unknown> & {
  id: string;
  team_id: string;
  user_id: string;
  /** team_role enum: "admin" | "developer" | "viewer" */
  role: "admin" | "developer" | "viewer";
  created_at: string;
  updated_at: string;
  branches: string[] | null;
};

/**
 * A row in the `teams` table.
 */
export interface TeamRecord {
  id: string;
  name: string;
  github_repo: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  github_branches: string[] | null;
  github_oauth_token: string | null;
  github_installation_id: string | null;
}

/**
 * A row in the `profiles` table.
 */
export interface ProfileRecord {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  signup_provider: "email" | "google" | "github";
  last_login_provider: "email" | "google" | "github" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

// ---------------------------------------------------------------------------
// CDC wire-format utilities
// ---------------------------------------------------------------------------

/**
 * Safely normalise a Postgres `text[]` column value arriving from a Supabase
 * CDC WebSocket payload.
 *
 * Supabase Realtime delivers array columns as a raw Postgres literal string
 * (e.g. `"{main,development}"`) rather than a parsed JavaScript array. This
 * function handles all three shapes the value can arrive in:
 *
 * - Already a JS array  → returned as-is (REST API path, or future fix)
 * - Braced string       → parsed into a string array
 * - `null` / `undefined`→ returned as `null`
 *
 * @param value - The raw column value from the CDC payload.
 * @returns A `string[]` when the column has entries, or `null` when empty/absent.
 *
 * @example
 * parsePgTextArray("{main,development}")  // ["main", "development"]
 * parsePgTextArray("{single}")            // ["single"]
 * parsePgTextArray("{}")                  // null
 * parsePgTextArray(null)                  // null
 * parsePgTextArray(["main"])              // ["main"]
 */
export function parsePgTextArray(
  value: string[] | string | null | undefined
): string[] | null {
  if (value === null || value === undefined) return null;

  // Already a proper JS array (REST API or future Realtime fix)
  if (Array.isArray(value)) {
    return value.length > 0 ? value : null;
  }

  // Braced Postgres literal: strip outer braces, split on commas
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

    const inner = trimmed.slice(1, -1); // remove { and }
    if (inner === "") return null;       // "{}" → empty array → null

    // Split on commas that are not inside double-quoted elements.
    // Simple branch names never contain commas, but this handles quoted
    // entries like `{"feat/my,branch"}` correctly.
    const entries = inner.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g) ?? [];
    const parsed = entries
      .map(e => e.startsWith('"') ? e.slice(1, -1).replace(/\\"/g, '"') : e)
      .filter(e => e.length > 0);

    return parsed.length > 0 ? parsed : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Optimistic update helper functions (pure, no React dependencies)
// ---------------------------------------------------------------------------

/**
 * Prepend a new record to the front of a list. Used for optimistic INSERT operations.
 *
 * @template T - A record type that has at least an `id: string` field.
 * @param list   - The current list of records.
 * @param record - The new record to prepend.
 * @returns A new array with `record` at index 0 followed by all existing items.
 */
export function applyOptimisticInsert<T extends { id: string }>(
  list: T[],
  record: T
): T[] {
  return [record, ...list];
}

/**
 * Replace a record in-place by id. Used for optimistic UPDATE operations.
 * Preserves list order.
 *
 * @template T - A record type that has at least an `id: string` field.
 * @param list   - The current list of records.
 * @param record - The updated record. Matched against existing items by `id`.
 * @returns A new array where the item whose `id` matches `record.id` is replaced
 *          with `record`. If no match is found, the original list is returned unchanged.
 */
export function applyOptimisticUpdate<T extends { id: string }>(
  list: T[],
  record: T
): T[] {
  return list.map((item) => (item.id === record.id ? record : item));
}

/**
 * Remove a record from the list by id. Used for optimistic DELETE operations.
 *
 * @template T - A record type that has at least an `id: string` field.
 * @param list - The current list of records.
 * @param id   - The `id` of the record to remove.
 * @returns A new array with all items whose `id` equals `id` removed.
 */
export function applyOptimisticDelete<T extends { id: string }>(
  list: T[],
  id: string
): T[] {
  return list.filter((item) => item.id !== id);
}

/**
 * Determine whether an incoming CDC event should be applied to local state.
 * Returns false for stale events to prevent overwriting newer optimistic updates.
 *
 * @template T - A record type that has at least `id: string` and `updated_at: string`.
 * @param localRecord    - The locally-held record, or `undefined` if no local copy exists.
 * @param incomingRecord - The record carried by the incoming CDC event.
 * @returns `true` if the event should be applied (no local copy, or incoming is newer);
 *          `false` if the incoming record is the same age or older than the local copy.
 */
export function shouldApplyCdcEvent<T extends { id: string; updated_at: string }>(
  localRecord: T | undefined,
  incomingRecord: T
): boolean {
  if (localRecord === undefined) return true;
  return incomingRecord.updated_at > localRecord.updated_at;
}
