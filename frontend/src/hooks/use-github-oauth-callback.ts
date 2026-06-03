/**
 * use-github-oauth-callback.ts
 * ----------------------------
 * Shared hook that handles the post-GitHub-OAuth redirect for BOTH the Team
 * page and the ProjectDetail page.
 *
 * Responsibilities:
 *  1. Detect ?github_connected=true / ?github_error=… on the current URL
 *     (reads once on mount — does NOT re-run on every render).
 *  2. Clean the URL immediately so a hard-refresh doesn't re-trigger the flow.
 *  3. Guard against double-firing with a ref so the async callback runs at
 *     most once per page load even if parent components re-render.
 *  4. Expose `isConnecting` so callers can show a loading banner during the
 *     gap between landing back from GitHub and the repo-picker opening.
 *  5. Expose `pendingTeamId` / `pendingProjectId` so callers can pre-select
 *     the right item in their list before the picker opens.
 *
 * Usage — Team flow:
 *   const { isConnecting } = useGithubOAuthCallback({
 *     onSuccess: (teamId) => handleOAuthCallback(teamId),
 *     onError:   (msg)    => toast.error(msg),
 *     paramKey:  "team_id",
 *   });
 *
 * Usage — Project flow:
 *   const { isConnecting } = useGithubOAuthCallback({
 *     onSuccess: () => handleOAuthCallback(),
 *     onError:   (msg) => toast({ ... }),
 *   });
 */

import { useEffect, useRef, useState } from "react";

interface UseGithubOAuthCallbackOptions {
  /**
   * Called when ?github_connected=true is detected.
   * Receives the value of `paramKey` query param (if configured) or undefined.
   * The URL is already cleaned before this fires.
   */
  onSuccess: (paramValue?: string) => void | Promise<void>;

  /**
   * Called when ?github_error=… is detected.
   * Receives a human-readable message with underscores replaced by spaces.
   */
  onError: (message: string) => void;

  /**
   * Optional: name of an additional query param to extract and pass to
   * onSuccess (e.g. "team_id" for the Team page flow).
   * If omitted, onSuccess is called with undefined.
   */
  paramKey?: string;
}

interface UseGithubOAuthCallbackResult {
  /**
   * True from the moment the redirect is detected until onSuccess resolves.
   * Use this to render a "Connecting your GitHub repository…" banner.
   */
  isConnecting: boolean;
}

export function useGithubOAuthCallback({
  onSuccess,
  onError,
  paramKey,
}: UseGithubOAuthCallbackOptions): UseGithubOAuthCallbackResult {
  const [isConnecting, setIsConnecting] = useState(false);

  // Guard: fire at most once per page load, even if the parent re-renders
  // before the async callback resolves.
  const hasHandledRef = useRef(false);

  // Capture the callbacks in refs so the effect closure stays stable and
  // never needs to be listed as a dependency (avoids stale-closure bugs and
  // the double-fire risk of an unstable onSuccess reference).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef   = useRef(onError);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onErrorRef.current   = onError;   }, [onError]);

  useEffect(() => {
    // Only run once — if we already handled the callback this page-load, bail.
    if (hasHandledRef.current) return;

    const params          = new URLSearchParams(window.location.search);
    const githubConnected = params.get("github_connected");
    const githubError     = params.get("github_error");
    const paramValue      = paramKey ? (params.get(paramKey) ?? undefined) : undefined;

    // Nothing to handle — normal page load.
    if (!githubConnected && !githubError) return;

    // Mark as handled immediately so no re-render can double-fire this.
    hasHandledRef.current = true;

    // Clean the URL before doing anything else so a hard-refresh won't replay.
    window.history.replaceState({}, "", window.location.pathname);

    if (githubError) {
      onErrorRef.current(githubError.replace(/_/g, " "));
      return;
    }

    if (githubConnected === "true") {
      setIsConnecting(true);
      Promise.resolve(onSuccessRef.current(paramValue)).finally(() => {
        setIsConnecting(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run exactly once on mount

  return { isConnecting };
}
