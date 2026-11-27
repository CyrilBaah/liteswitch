// LiteSwitch for any website: no framework, no build step, one ES module.
// It does in the browser what the Next.js app does in lib/liteswitch/ + lib/flags.ts.
//
//   import { decide } from "./liteswitch.js";
//   const choice = await decide({ environmentID: "<client-side key>" });
//   ...render choice.config...    then    choice.recordExposure();
//   choice.track("lesson_started");
//
// The Flagsmith SDK comes from a CDN, pinned to an exact version so it can't change under you.
// It's imported lazily inside decide(), not at the top of this file: (1) if the CDN is
// blocked, decide() falls back to the full page instead of the whole page failing, and
// (2) fast visitors never ask Flagsmith anything, so they never download the SDK.
const FLAGSMITH_SDK = "https://cdn.jsdelivr.net/npm/@flagsmith/flagsmith@12.6.0/index.mjs";

/** The two values of the page_weight flag (see docs/flagsmith-setup.json). */
export const FULL = { video: "autoplay-hd", images: "hd", fonts: "web", embeds: true };
export const LITE = { video: "tap-to-load-360p", images: "low-lazy", fonts: "system", embeds: false };

const SLOW_TYPES = ["slow-2g", "2g", "3g"];
const VISITOR_COOKIE = "ls_vid";

/**
 * Sort the visitor into "slow", "fast" or "unknown" from what the browser reports.
 * Only "slow" visitors are ever asked about the flag: the test is about people who
 * pay for every MB, and fast visitors would only dilute it. Safari and Firefox
 * don't expose navigator.connection, so they are "unknown" and stay on the full page.
 * Note: without a server you can't read the Save-Data header, so this only sees
 * navigator.connection.saveData (Chromium).
 */
export function readConnection({ allowOverride = false } = {}) {
  const connection = navigator.connection;
  let netType = connection?.effectiveType ?? "unknown";
  // Test hook: ?net=3g pretends to be slow. Only enable it on a test copy of your site.
  if (allowOverride) netType = new URLSearchParams(location.search).get("net") || netType;
  const saveData = connection?.saveData === true;
  const tier = SLOW_TYPES.includes(netType) || saveData ? "slow" : netType === "unknown" ? "unknown" : "fast";
  // Trait names must match the slow_or_saver segment in Flagsmith exactly.
  return { tier, traits: { net_type: netType, save_data: saveData, rtt_ms: connection?.rtt ?? -1 } };
}

/**
 * One stable id per browser, kept in a cookie, so the flag decision and every
 * event belong to the same Flagsmith identity. null if cookies are blocked:
 * then we can't count this person consistently, so they are never enrolled.
 */
export function getVisitorId() {
  const read = () => document.cookie.split("; ").find((c) => c.startsWith(VISITOR_COOKIE + "="))?.split("=")[1] ?? null;
  if (!read()) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${VISITOR_COOKIE}=${newId()}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
  return read();
}

/** Random id. crypto.randomUUID only exists on HTTPS (and localhost), so plain-HTTP sites use getRandomValues. */
function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decide FULL or LITE for this visitor.
 * Fast/unknown visitors, missing key, no cookies, a 5 s timeout or any error all
 * give FULL with enrolled=false: the page always works, and nothing is recorded
 * for a page the visitor wasn't really shown by the experiment.
 */
export async function decide({ environmentID, flag = "page_weight", timeoutMs = 5000, allowOverride = false }) {
  const notEnrolled = (reason) => ({
    config: FULL, enrolled: false, variant: null, reason,
    recordExposure() {}, track() {}, // no-ops: nothing is sent for visitors outside the experiment
  });

  try {
    // Everything that can throw is inside this try, so any failure gives the full page.
    const { tier, traits } = readConnection({ allowOverride });
    if (tier !== "slow") return notEnrolled("not-slow");
    if (!environmentID || environmentID.startsWith("YOUR_")) return notEnrolled("no-key");
    const visitorId = getVisitorId();
    if (!visitorId) return notEnrolled("no-visitor-id");

    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
    // The CDN download counts toward the same timeout as the flag request.
    const loadSdk = import(FLAGSMITH_SDK).then((m) => m.default);
    const sdk = await Promise.race([loadSdk, timeout]);
    if (sdk === "timeout") return notEnrolled("timeout");
    const flagsmith = sdk;
    // init with identity + traits = ONE request that returns this visitor's flags.
    const result = await Promise.race([
      flagsmith.init({ environmentID, enableEvents: true, identity: visitorId, traits }),
      timeout,
    ]);
    if (result === "timeout") return notEnrolled("timeout");

    // Normal read: records nothing. (getExperimentFlag would record the exposure
    // right now, before we know the visitor will actually see the variant.)
    const state = flagsmith.getAllFlags()[flag];
    // Only accept the two known shapes: a typo in the dashboard should give a working full page.
    let config = null;
    try {
      const parsed = typeof state?.value === "string" ? JSON.parse(state.value) : state?.value;
      if (parsed?.video === LITE.video) config = LITE;
      else if (parsed?.video === FULL.video) config = FULL;
    } catch {
      // not JSON -> not recognised
    }
    // Enrolled only if Flagsmith says so AND we recognised the value. Otherwise we show
    // FULL, and must not record an exposure for a variant the visitor never saw.
    const enrolled = state?.experiment?.inExperiment === true && Boolean(state.variant) && config !== null;
    config = config ?? FULL;
    if (!enrolled) return { ...notEnrolled("flagsmith"), config };

    let exposed = false;
    return {
      config, enrolled, variant: state.variant, reason: "flagsmith",
      /** Call once, right after the chosen variant is put on the page. */
      recordExposure() {
        if (exposed) return;
        exposed = true;
        flagsmith.trackExposureEvent(flag, { value: state.variant });
        void flagsmith.flushEvents();
      },
      /** Conversion event, e.g. track("lesson_started"). Flushed right away: the SDK
       *  otherwise batches for 10 s, and a slow-connection visitor may leave before that. */
      track(event, value) {
        flagsmith.trackEvent(event, value === undefined ? undefined : { value });
        void flagsmith.flushEvents();
      },
    };
  } catch {
    return notEnrolled("error");
  }
}
