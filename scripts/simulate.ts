// Simulated slow-connection visitors for the Flagsmith experiment.
//
// Run (never in CI, never against production):
//   npx playwright install chromium        # once, downloads the browser
//   npm run simulate                       # reads settings from the environment
//
// Environment (put secrets in .env.local, never in git):
//   SIM_URL                          sim preview URL (default below)
//   VERCEL_AUTOMATION_BYPASS_SECRET  Vercel "Protection Bypass for Automation" secret
//   TARGET_PER_VARIANT               stop when every variant has this many enrolled visitors (default 60)
//   MAX_VISITS                       hard cap on visits, enrolled or not (default 400)
//   CONCURRENCY                      browsers tabs running at once (default 4)
//
// What it measures, honestly: each simulated visitor gets a random PATIENCE
// budget (3-15 s, counted from navigation). It clicks "Start lesson" only if
// the button becomes clickable within that budget; otherwise it leaves. The
// button only unlocks once the lesson's intro media is on screen, so the result
// comes from REAL load times on a throttled connection, not from a script that
// always clicks. These are simulated visitors: report them apart from real ones.
import { chromium, type Browser, type BrowserContext } from "playwright";

const SIM_URL = process.env.SIM_URL ?? "https://liteswitch-git-sim-cyrilbaahs-projects.vercel.app/";
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const TARGET_PER_VARIANT = Number(process.env.TARGET_PER_VARIANT ?? 60);
const MAX_VISITS = Number(process.env.MAX_VISITS ?? 400);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

// Share of visitors who started the lesson that also click "Mark complete".
const COMPLETE_SHARE = 0.6;
const PATIENCE_MIN_MS = 3_000;
const PATIENCE_MAX_MS = 15_000;

// A 3G-like connection, applied with Chrome DevTools throttling so load times are real.
// (The design doc's profile: ~400 kbit/s down, 400 ms round trip.)
const NETWORK_3G = {
  offline: false,
  latency: 400, // ms added to each request
  downloadThroughput: (400 * 1024) / 8, // bytes per second
  uploadThroughput: (150 * 1024) / 8,
};

type Variant = "full" | "lite";
type VisitResult = { enrolled: boolean; variant: Variant | null; started: boolean; completed: boolean };

/** Refuse to run against production: simulated traffic must only reach the Development environment. */
function assertSafeTarget(url: URL): void {
  if (url.hostname === "liteswitch.vercel.app") {
    throw new Error("SIM_URL points at PRODUCTION. Simulated visitors may only hit the sim preview.");
  }
}

/** New browser context = new cookies = a brand-new visitor id (ls_vid). */
async function newVisitorContext(browser: Browser, origin: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (BYPASS_SECRET) {
    // Send the Vercel bypass secret ONLY to the sim site. Vercel's example puts it in
    // extraHTTPHeaders, but that would also send it to Flagsmith's API: it would leak
    // the secret to a third party, and the extra header would make Flagsmith's
    // cross-origin requests fail their CORS check.
    await context.route(`${origin}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": BYPASS_SECRET } }),
    );
  }
  return context;
}

async function visit(browser: Browser, url: URL): Promise<VisitResult> {
  const context = await newVisitorContext(browser, url.origin);
  const page = await context.newPage();
  const result: VisitResult = { enrolled: false, variant: null, started: false, completed: false };
  try {
    // Throttle THIS page to 3G before it loads anything.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NETWORK_3G);

    // Patience is measured from navigation start, like a real person staring at a loading page.
    const patience = PATIENCE_MIN_MS + Math.random() * (PATIENCE_MAX_MS - PATIENCE_MIN_MS);
    const deadline = Date.now() + patience;

    // ?net=3g makes the page treat us as slow (honored only on the sim deployment).
    const target = new URL(url);
    target.searchParams.set("net", "3g");
    await page.goto(target.toString(), { waitUntil: "commit", timeout: 60_000 });

    // Wait (within patience) for the variant decision, shown in the footer debug line.
    const debug = page.locator(".debug");
    await debug.filter({ hasNotText: "deciding" }).waitFor({ timeout: Math.max(1, deadline - Date.now()) }).catch(() => {});
    const debugText = (await debug.textContent().catch(() => "")) ?? "";
    result.enrolled = debugText.includes("in experiment: yes");
    result.variant = debugText.includes("page: lite") ? "lite" : debugText.includes("page: full") ? "full" : null;

    // Click "Start lesson" only if it becomes clickable before patience runs out.
    const start = page.getByRole("button", { name: "Start lesson" });
    const remaining = deadline - Date.now();
    if (remaining > 0 && (await start.waitFor({ state: "visible", timeout: remaining }).then(() => true, () => false))) {
      if (await start.isEnabled()) {
        await start.click();
        result.started = true;
        if (Math.random() < COMPLETE_SHARE) {
          await page.waitForTimeout(1_000 + Math.random() * 3_000); // a quick skim of the lesson
          await page.getByRole("button", { name: "Mark complete" }).click();
          result.completed = true;
        }
      }
    }

    // Give the page a moment to send its events (they're flushed right after each one)
    // before we close it, which also fires pagehide and sends page_bytes.
    await page.waitForTimeout(2_000);
  } finally {
    await context.close();
  }
  return result;
}

async function main(): Promise<void> {
  const url = new URL(SIM_URL);
  assertSafeTarget(url);
  if (!BYPASS_SECRET) console.warn("VERCEL_AUTOMATION_BYPASS_SECRET is empty: a protected preview will block every visit.");

  const tally = {
    full: { enrolled: 0, started: 0, completed: 0 },
    lite: { enrolled: 0, started: 0, completed: 0 },
  };
  let visits = 0;
  let notEnrolled = 0;
  const done = () => tally.full.enrolled >= TARGET_PER_VARIANT && tally.lite.enrolled >= TARGET_PER_VARIANT;

  const browser = await chromium.launch();
  try {
    // A few visitors in parallel. Stop rule: keep going until EVERY variant has
    // TARGET_PER_VARIANT enrolled visitors (a fixed visit count can leave one arm
    // short by chance), or until MAX_VISITS as a safety cap.
    const worker = async (): Promise<void> => {
      while (!done() && visits < MAX_VISITS) {
        visits++;
        const r = await visit(browser, url).catch((error: unknown) => {
          console.error("visit failed:", error instanceof Error ? error.message : error);
          return null;
        });
        if (!r) continue;
        if (!r.enrolled || !r.variant) {
          notEnrolled++;
          // Nobody enrolled after 10 visits: the experiment probably isn't running.
          if (notEnrolled >= 10 && tally.full.enrolled + tally.lite.enrolled === 0) {
            throw new Error("10 visits and none enrolled: is the experiment started in the Development environment?");
          }
          continue;
        }
        const arm = tally[r.variant];
        arm.enrolled++;
        if (r.started) arm.started++;
        if (r.completed) arm.completed++;
        console.log(`visit ${visits}: ${r.variant}, started=${r.started}, completed=${r.completed}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await browser.close();
  }

  console.log("\nSIMULATED visitors (report separately from real ones):");
  for (const variant of ["full", "lite"] as const) {
    const { enrolled, started, completed } = tally[variant];
    const pct = (n: number) => (enrolled ? ((100 * n) / enrolled).toFixed(1) : "0.0");
    console.log(`  ${variant}: ${enrolled} enrolled, ${started} started (${pct(started)}%), ${completed} completed (${pct(completed)}%)`);
  }
  console.log(`  visits: ${visits}, not enrolled: ${notEnrolled}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
