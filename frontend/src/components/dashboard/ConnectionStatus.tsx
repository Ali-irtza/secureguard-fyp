import type { SubscriptionStatus } from "@/types/realtime";

interface ConnectionStatusProps {
  status: SubscriptionStatus;
  connectionCount: number;
}

/**
 * A compact pill/badge widget that reflects the real-time subscription state.
 *
 * - SUBSCRIBED      → renders nothing (zero visual impact)
 * - CHANNEL_ERROR / TIMED_OUT → yellow pulsing dot + "Reconnecting…" + attempt count
 * - CLOSED          → red dot + "Disconnected"
 */
const ConnectionStatus = ({ status, connectionCount }: ConnectionStatusProps) => {
  if (status === "SUBSCRIBED") {
    return null;
  }

  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
        Reconnecting… ({connectionCount})
      </span>
    );
  }

  // CLOSED
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-destructive/30 bg-destructive/10 text-destructive">
      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
      Disconnected
    </span>
  );
};

export default ConnectionStatus;
