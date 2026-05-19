/**
 * Core real-time synchronization hook module for SecureGuard Pro.
 *
 * This module provides the `useRealtimeSync<T>` hook that manages the full
 * Supabase Realtime subscription lifecycle for a single PostgreSQL table,
 * including exponential backoff reconnection logic, event dispatching, and
 * memory-leak-safe cleanup on unmount.
 *
 * @module hooks/use-realtime-sync
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  UseRealtimeSyncOptions,
  UseRealtimeSyncReturn,
  SubscriptionStatus,
  RealtimeEvent,
} from "@/types/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Exponential backoff constants (internal — not part of the public API)
// ---------------------------------------------------------------------------

/** Base delay in milliseconds for the first reconnection attempt. */
export const BACKOFF_BASE_MS = 1000;

/** Maximum delay in milliseconds; backoff is capped at this value. */
export const BACKOFF_MAX_MS = 30_000;

/** Maximum number of automatic reconnection attempts before giving up. */
export const MAX_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Exponential backoff utility
// ---------------------------------------------------------------------------

/**
 * Calculate the exponential backoff delay in milliseconds for a given
 * reconnection attempt number. Starts at 1 s, doubles each attempt, caps at 30 s.
 *
 * @param attempt - The 1-based reconnection attempt number (1 = first retry).
 * @returns The delay in milliseconds to wait before the next reconnection attempt.
 *
 * @example
 * getBackoffDelay(1)  // 1000  ms
 * getBackoffDelay(2)  // 2000  ms
 * getBackoffDelay(3)  // 4000  ms
 * getBackoffDelay(4)  // 8000  ms
 * getBackoffDelay(5)  // 16000 ms
 * getBackoffDelay(6)  // 30000 ms  (capped)
 */
export function getBackoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
}

// ---------------------------------------------------------------------------
// useRealtimeSync<T> hook
// ---------------------------------------------------------------------------

/**
 * Manages the full Supabase Realtime subscription lifecycle for a single
 * PostgreSQL table. Handles connection, reconnection with exponential backoff,
 * event dispatching, and memory-leak-safe cleanup on unmount.
 *
 * @template T - The shape of the database row being subscribed to.
 * @param options - Configuration options for the subscription.
 * @returns The current subscription status and reconnection attempt count.
 */
export function useRealtimeSync<T extends Record<string, unknown>>(
  options: UseRealtimeSyncOptions<T>
): UseRealtimeSyncReturn {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Current channel connection state, exposed to the caller. */
  const [status, setStatus] = useState<SubscriptionStatus>("CHANNEL_ERROR");

  /** Number of reconnection attempts since the last successful connection. */
  const [connectionCount, setConnectionCount] = useState<number>(0);

  /**
   * Incrementing this triggers the useEffect to re-run, creating a fresh
   * channel for the retry attempt.
   */
  const [retryCount, setRetryCount] = useState<number>(0);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  /** Set to true on mount, false in cleanup. Guards all setState calls inside
   * async callbacks to prevent memory leaks on unmounted components. */
  const isMounted = useRef<boolean>(false);

  /** Set to true in cleanup to distinguish an explicit unmount from an
   * error-triggered close. Prevents spurious reconnection on unmount. */
  const intentionalClose = useRef<boolean>(false);

  /** Handle for the pending retry timer, cleared in cleanup. */
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * A stable random string generated once on mount.
   * Used for self-echo prevention (session identifier).
   */
  const sessionId = useRef<string>(Math.random().toString(36).slice(2));

  // -------------------------------------------------------------------------
  // Subscription effect
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Early exit when the subscription is explicitly disabled.
    if (options.enabled === false) {
      return;
    }

    isMounted.current = true;
    intentionalClose.current = false;

    // Unique channel name — random suffix ensures independent instances when
    // multiple components subscribe to the same table/filter combination.
    const channelName = `realtime-${options.table}-${options.filter ?? "all"}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: options.table,
          filter: options.filter,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (!isMounted.current) return;

          // Self-echo prevention: Supabase does not expose a session ID in CDC
          // payloads; deduplication via updated_at handles this case.
          // sessionId.current is available for future use if the API exposes it.

          const event: RealtimeEvent<T> = {
            eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new as T,
            old: payload.old as Partial<T>,
            commitTimestamp: payload.commit_timestamp ?? "",
          };

          if (event.eventType === "INSERT") {
            options.onInsert?.(event);
          } else if (event.eventType === "UPDATE") {
            options.onUpdate?.(event);
          } else if (event.eventType === "DELETE") {
            options.onDelete?.(event);
          }
        }
      )
      .subscribe((channelStatus: string) => {
        if (!isMounted.current) return;

        if (channelStatus === "SUBSCRIBED") {
          setStatus("SUBSCRIBED");
          setConnectionCount(0);
        } else if (
          channelStatus === "TIMED_OUT" ||
          channelStatus === "CHANNEL_ERROR"
        ) {
          setStatus("CHANNEL_ERROR");

          // Use a functional update to read the latest connectionCount value
          // inside the closure without stale state.
          setConnectionCount((currentCount) => {
            if (intentionalClose.current || currentCount >= MAX_ATTEMPTS) {
              // Give up — mark as closed.
              if (isMounted.current) {
                setStatus("CLOSED");
              }
              return currentCount;
            }

            // Schedule a retry after the appropriate backoff delay.
            const nextCount = currentCount + 1;
            retryTimeout.current = setTimeout(() => {
              if (isMounted.current && !intentionalClose.current) {
                supabase.removeChannel(channel);
                // Increment retryCount to trigger the useEffect to re-run,
                // creating a fresh channel.
                setRetryCount((c) => c + 1);
              }
            }, getBackoffDelay(nextCount));

            return nextCount;
          });
        } else if (channelStatus === "CLOSED") {
          // Only set CLOSED if this was an intentional close (unmount or
          // explicit unsubscribe). Don't override CHANNEL_ERROR state for
          // error-triggered closes — the retry logic handles those.
          if (intentionalClose.current) {
            if (isMounted.current) {
              setStatus("CLOSED");
            }
          }
        }
      });

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    return () => {
      isMounted.current = false;
      intentionalClose.current = true;
      if (retryTimeout.current) {
        clearTimeout(retryTimeout.current);
        retryTimeout.current = null;
      }
      supabase.removeChannel(channel);
    };
    // Re-run when table, filter, enabled, or retryCount changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.table, options.filter, options.enabled, retryCount]);

  return { status, connectionCount };
}
