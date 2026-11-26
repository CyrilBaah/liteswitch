// Reads the connection signals the browser already exposes and sorts the
// visitor into one of three tiers. Only "slow" visitors enter the experiment:
// the hypothesis is about people who pay for every MB, and fast visitors
// would barely notice the difference, so they'd only dilute the result.
// "unknown" (Safari, Firefox) stays out too, because we can't tell which group they're in.
import { SAVE_DATA_COOKIE, readCookie } from "./cookies";

export type Tier = "slow" | "fast" | "unknown";

/** Flagsmith traits. Names must match the slow_or_saver segment exactly. */
export type ConnectionTraits = {
  net_type: string; // "slow-2g" | "2g" | "3g" | "4g" | "unknown"
  save_data: boolean; // Data Saver on (navigator.connection.saveData or Save-Data header)
  rtt_ms: number; // estimated round-trip time in ms, -1 if the browser doesn't say
};

export type ConnectionInfo = { tier: Tier; traits: ConnectionTraits };

const SLOW_TYPES = ["slow-2g", "2g", "3g"];

// The Network Information API exists only in Chromium browsers (Chrome,
// Edge, Opera, Samsung Internet). TypeScript's DOM types don't include it.
type NetworkInformation = { effectiveType?: string; saveData?: boolean; rtt?: number };

/**
 * @param allowOverride when true, `?net=3g` (or 2g, 4g...) in the URL replaces
 *   the real effectiveType. Only the sim deployment passes true.
 */
export function readConnection(allowOverride: boolean): ConnectionInfo {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

  // Safari and Firefox have no navigator.connection -> "unknown".
  let netType = connection?.effectiveType ?? "unknown";
  if (allowOverride) {
    const forced = new URLSearchParams(location.search).get("net");
    if (forced) netType = forced;
  }

  // proxy.ts mirrors the Save-Data request header into a cookie we can read here.
  const saveData = connection?.saveData === true || readCookie(SAVE_DATA_COOKIE) === "1";

  let tier: Tier = "fast";
  if (SLOW_TYPES.includes(netType) || saveData) tier = "slow";
  else if (netType === "unknown") tier = "unknown";

  return {
    tier,
    traits: { net_type: netType, save_data: saveData, rtt_ms: connection?.rtt ?? -1 },
  };
}
