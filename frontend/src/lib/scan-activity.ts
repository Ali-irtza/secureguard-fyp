export type GlobalScanStatus = "running" | "completed" | "failed";

export interface GlobalScanActivity {
  id: string;
  status: GlobalScanStatus;
  title: string;
  detail: string;
  startedAt: number;
  updatedAt: number;
  scanId?: string | null;
  issueCount?: number;
  riskLevel?: string;
  reportPath?: string;
}

const STORAGE_KEY = "secureguard.activeScan";
const EVENT_NAME = "secureguard:scan-activity";

const emitScanActivityChange = (activity: GlobalScanActivity | null) => {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: activity }));
};

const readStoredActivity = (): GlobalScanActivity | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GlobalScanActivity) : null;
  } catch {
    return null;
  }
};

const writeStoredActivity = (activity: GlobalScanActivity | null) => {
  if (activity) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  emitScanActivityChange(activity);
};

export const getGlobalScanActivity = (): GlobalScanActivity | null => {
  if (typeof window === "undefined") return null;
  const activity = readStoredActivity();
  if (!activity) return null;

  const isStaleRunningActivity =
    activity.status === "running" && Date.now() - activity.startedAt > 2 * 60 * 60 * 1000;
  const isOldFinishedActivity =
    activity.status !== "running" && Date.now() - activity.updatedAt > 10 * 60 * 1000;
  if (isStaleRunningActivity || isOldFinishedActivity) {
    writeStoredActivity(null);
    return null;
  }

  return activity;
};

export const subscribeToGlobalScanActivity = (
  callback: (activity: GlobalScanActivity | null) => void
) => {
  const handleCustomEvent = (event: Event) => {
    callback((event as CustomEvent<GlobalScanActivity | null>).detail ?? null);
  };
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback(getGlobalScanActivity());
  };

  window.addEventListener(EVENT_NAME, handleCustomEvent);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustomEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
};

export const startGlobalScanActivity = (input: {
  title: string;
  detail?: string;
}): string => {
  const id = crypto.randomUUID();
  const now = Date.now();
  writeStoredActivity({
    id,
    status: "running",
    title: input.title,
    detail: input.detail ?? "Scanning in the background. You can keep working.",
    startedAt: now,
    updatedAt: now,
    reportPath: "/reports",
  });
  return id;
};

export const updateGlobalScanActivity = (
  id: string | null | undefined,
  patch: Partial<Pick<GlobalScanActivity, "detail" | "title">>
) => {
  if (!id) return;
  const current = getGlobalScanActivity();
  if (!current || current.id !== id) return;
  writeStoredActivity({ ...current, ...patch, updatedAt: Date.now() });
};

export const completeGlobalScanActivity = (
  id: string | null | undefined,
  result: {
    scanId?: string | null;
    issueCount?: number;
    riskLevel?: string;
    title?: string;
  }
) => {
  if (!id) return;
  const current = getGlobalScanActivity();
  if (!current || current.id !== id) return;
  const issueCount = result.issueCount ?? 0;
  writeStoredActivity({
    ...current,
    status: "completed",
    title: result.title ?? current.title,
    detail: `Scan finished with ${issueCount} issue${issueCount === 1 ? "" : "s"}. The report is ready in Reports.`,
    scanId: result.scanId ?? null,
    issueCount,
    riskLevel: result.riskLevel,
    reportPath: result.scanId ? `/reports/${result.scanId}` : "/reports",
    updatedAt: Date.now(),
  });
};

export const failGlobalScanActivity = (
  id: string | null | undefined,
  message: string
) => {
  if (!id) return;
  const current = getGlobalScanActivity();
  if (!current || current.id !== id) return;
  writeStoredActivity({
    ...current,
    status: "failed",
    detail: message,
    updatedAt: Date.now(),
  });
};

export const dismissGlobalScanActivity = () => {
  writeStoredActivity(null);
};
