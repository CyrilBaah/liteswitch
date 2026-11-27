// Everything that talks to Flagsmith lives in this one file.
//
// SDK calls used (all from the Flagsmith docs, checked against the
// @flagsmith/flagsmith 12.6.0 type definitions):
//   flagsmith.init({ environmentID, enableEvents: true, identity, traits })
//   flagsmith.getAllFlags().page_weight   -> normal read, records NOTHING
//   flagsmith.trackExposureEvent('page_weight', { value: variant })
//   flagsmith.trackEvent(name, { value })
//   flagsmith.flushEvents()
// We deliberately do NOT use getExperimentFlag(): it records the exposure when
// the flag is read, and we want to record it when the variant is shown.
import flagsmith from "@flagsmith/flagsmith";
import type { ConnectionTraits } from "./liteswitch/connection";

/** The JSON value of the page_weight flag. */
export type PageWeight = {
  video: "autoplay-hd" | "tap-to-load-360p";
  images: "hd" | "low-lazy";
  fonts: "web" | "system";
  embeds: boolean;
};

export const FULL: PageWeight = { video: "autoplay-hd", images: "hd", fonts: "web", embeds: true };
export const LITE: PageWeight = { video: "tap-to-load-360p", images: "low-lazy", fonts: "system", embeds: false };

/** What the page should show, and whether this visitor counts in the experiment. */
export type Decision = {
  config: PageWeight;
  /** True only if Flagsmith says inExperiment === true. Only then do we send events. */
  enrolled: boolean;
  /** The variant key Flagsmith picked (e.g. "control" or "lite"); sent as the exposure value. */
  variant: string | null;
  /** Why we ended up here. Shown in the footer to help testing. */
  reason: "not-slow" | "no-visitor-id" | "no-key" | "flagsmith" | "timeout" | "error" | "dev-override";
};

const ENVIRONMENT_KEY = process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY;
// On 3G one round-trip can take over a second, so 5 s gives Flagsmith a fair
// chance without leaving the media slot empty for too long.
const TIMEOUT_MS = 5000;

/** Full page, not enrolled: the safe default whenever anything is missing or fails. */
export function fallback(reason: Decision["reason"]): Decision {
  return { config: FULL, enrolled: false, variant: null, reason };
}

/**
 * Accept the flag value only if it is one of our two known JSON shapes.
 * Why: a typo in the dashboard JSON should give a working full page, not a broken one.
 */
function parsePageWeight(value: unknown): PageWeight | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed?.video === LITE.video) return LITE;
    if (parsed?.video === FULL.video) return FULL;
  } catch {
    // not JSON -> fall through
  }
  return null;
}

/**
 * Asks Flagsmith which page_weight this (slow) visitor gets.
 * One network request: init with the identity + traits fetches that identity's flags.
 * After 5 s, or on any error, we serve FULL and the visitor is NOT enrolled,
 * even if Flagsmith answers later (we never record an exposure for a page we didn't show).
 */
export async function decidePageWeight(visitorId: string, traits: ConnectionTraits): Promise<Decision> {
  if (!ENVIRONMENT_KEY) return fallback("no-key");

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS));
  try {
    const result = await Promise.race([
      flagsmith.init({ environmentID: ENVIRONMENT_KEY, enableEvents: true, identity: visitorId, traits }),
      timeout,
    ]);
    if (result === "timeout") return fallback("timeout");

    const flag = flagsmith.getAllFlags().page_weight; // normal read: records nothing
    const parsed = parsePageWeight(flag?.value);
    // Enrolled only if Flagsmith says so AND we recognised the value. If the value is
    // empty or mistyped we show FULL, and then we must NOT record an exposure for a
    // variant (e.g. "lite") the visitor never actually saw.
    const enrolled = flag?.experiment?.inExperiment === true && Boolean(flag.variant) && parsed !== null;
    return { config: parsed ?? FULL, enrolled, variant: enrolled ? flag!.variant! : null, reason: "flagsmith" };
  } catch {
    return fallback("error");
  }
}

/**
 * Record that this visitor was shown its variant. Called once, when the
 * variant's media is mounted. Does nothing unless the visitor is enrolled.
 */
export function recordExposure(decision: Decision): void {
  if (!decision.enrolled || !decision.variant) return;
  flagsmith.trackExposureEvent("page_weight", { value: decision.variant });
  void flagsmith.flushEvents();
}

/**
 * Send a conversion event (lesson_started, lesson_completed, page_bytes).
 * Only for enrolled visitors: Flagsmith ignores events without an exposure anyway.
 * We flush right away because the SDK otherwise batches for 10 s, and a 3G
 * visitor may close the tab before that.
 */
export function track(decision: Decision, event: string, value?: number): void {
  if (!decision.enrolled) return;
  flagsmith.trackEvent(event, value === undefined ? undefined : { value });
  void flagsmith.flushEvents();
}
