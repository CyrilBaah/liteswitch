// Simulated slow-connection visitors for the Flagsmith experiment.
//
// Run (never in CI, never against production):
//   npx playwright install chromium        # once, downloads the browser
//   npm run simulate                       # runs this file with tsx (works on Node 20+)
//
// Settings come from the environment or .env.local (secrets never go in git):
//   SIM_URL                          sim preview URL (default below)
//   VERCEL_AUTOMATION_BYPASS_SECRET  Vercel "Protection Bypass for Automation" secret
//   TARGET_PER_VARIANT               stop when every variant has this many enrolled visitors (default 60)
//   MAX_VISITS                       hard cap on visits, enrolled or not (default 400)
//   CONCURRENCY                      browser tabs running at once (default 4)
//
// What it measures, honestly: each simulated visitor gets a random PATIENCE
// budget (3-15 s, counted from navigation). It clicks "Start lesson" only if
// the button becomes clickable within that budget; otherwise it leaves. The
// button only unlocks once the lesson's intro media is on screen, so the result
// comes from REAL load times on a throttled connection, not from a script that
// always clicks. These are simulated visitors: report them apart from real ones.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Load .env.local if it exists (process.loadEnvFile is built into Node 20.12+).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

/** Read a positive whole-number setting, or stop with a clear message (a typo must not silently skip visits). */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a whole number of at least 1, got "${raw}".`);
  return value;
}

const SIM_URL = process.env.SIM_URL || "https://liteswitch-git-sim-cyrilbaahs-projects.vercel.app/";
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

// Share of visitors who started the lesson that also click "Mark complete".
const COMPLETE_SHARE = 0.6;
const PATIENCE_MIN_MS = 3_000;
const PATIENCE_MAX_MS = 15_000;
// Stop if this many visits in a row fail (site down, protection blocking us...).
const MAX_CONSECUTIVE_FAILURES = 10;

// A 3G-like connection, applied with Chrome DevTools throttling so load times are real.
// (The design doc's profile: ~400 kbit/s down, 400 ms round trip.)
const NETWORK_3G = {
  offline: false,
  latency: 400, // ms added to each request
  downloadThroughput: (400 * 1024) / 8, // bytes per second
  uploadThroughput: (150 * 1024) / 8,
};

type Variant = "full" | "lite";
type VisitResult = {
  enrolled: boolean;
  variant: Variant | null;
  started: boolean;
  completed: boolean;
  patienceMs: number;
  /** Time from navigation until "Start lesson" unlocked (intro media on screen). null = not within patience. */
  timeToContentMs: number | null;
  /** Bytes the page had used when the visitor left, as shown by the page's own receipt. */
  bytes: number | null;
};

/**
 * Allowlist, not blocklist: simulated traffic may only reach this project's Vercel
 * PREVIEW deployments (they use the Development key) or a local dev server.
 * Production, or any other host, is refused.
 */
function assertSafeTarget(url: URL): void {
  const preview = /^liteswitch-git-[a-z0-9-]+-cyrilbaahs-projects\.vercel\.app$/.test(url.hostname);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!preview && !local) {
    throw new Error(`SIM_URL host "${url.hostname}" is not a liteswitch preview or localhost. Refusing to send simulated visitors there.`);
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

/** The footer's debug line, e.g. "page: lite · reason: flagsmith · in experiment: yes". "" if absent. */
async function readFooter(page: Page): Promise<string> {
  // Short, explicit timeout: an error or login page has no footer, and an
  // untimed read would wait 30 s per visit (or hang a worker).
  return (await page.locator(".debug").textContent({ timeout: 1_000 }).catch(() => "")) ?? "";
}

async function visit(browser: Browser, url: URL): Promise<VisitResult> {
  const context = await newVisitorContext(browser, url.origin);
  const page = await context.newPage();
  const result: VisitResult = {
    enrolled: false, variant: null, started: false, completed: false,
    patienceMs: 0, timeToContentMs: null, bytes: null,
  };
  try {
    // Throttle THIS page to 3G before it loads anything.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NETWORK_3G);

    // Patience is measured from navigation start, like a real person staring at a loading page.
    const patience = PATIENCE_MIN_MS + Math.random() * (PATIENCE_MAX_MS - PATIENCE_MIN_MS);
    const startedAt = Date.now();
    const deadline = startedAt + patience;
    result.patienceMs = Math.round(patience);

    // ?net=3g makes the page treat us as slow (honored only on the sim deployment).
    const target = new URL(url);
    target.searchParams.set("net", "3g");
    await page.goto(target.toString(), { waitUntil: "commit", timeout: 60_000 });

    // A Vercel login page instead of the lesson means the bypass secret is missing or wrong.
    if (new URL(page.url()).hostname === "vercel.com") {
      throw new Error("Vercel protection blocked the visit: check VERCEL_AUTOMATION_BYPASS_SECRET.");
    }

    // Click "Start lesson" only if it becomes clickable before patience runs out.
    const start = page.getByRole("button", { name: "Start lesson" });
    const remaining = () => Math.max(1, deadline - Date.now());
    const clickable = await start
      .waitFor({ state: "visible", timeout: remaining() })
      .then(async () => {
        // Visible can still mean "Loading lesson…"-disabled; wait for enabled within patience.
        await page.waitForFunction(
          () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Start lesson" && !b.disabled),
          undefined,
          { timeout: remaining() },
        );
        return true;
      })
      .catch(() => false);

    if (clickable) {
      result.timeToContentMs = Date.now() - startedAt;
      await start.click();
      result.started = true;
      if (Math.random() < COMPLETE_SHARE) {
        await page.waitForTimeout(1_000 + Math.random() * 3_000); // a quick skim of the lesson
        await page.getByRole("button", { name: "Mark complete" }).click();
        result.completed = true;
      }
    }

    // Give the page a moment to send its events (they're flushed right after each one).
    await page.waitForTimeout(2_000);

    // Read the footer LAST, just before leaving. A visitor whose patience ran out
    // while the page was still "deciding" may have been enrolled by Flagsmith since,
    // and we must count them the way Flagsmith will.
    const footer = await readFooter(page);
    // The page's own receipt ("This page used 6.50 MB"), so bytes match what visitors see.
    const receipt = (await page.locator(".receipt p").first().textContent({ timeout: 1_000 }).catch(() => "")) ?? "";
    const mb = receipt.match(/used\s+([\d.]+)\s*MB/);
    result.bytes = mb ? Math.round(Number(mb[1]) * 1_000_000) : null;
    result.enrolled = footer.includes("in experiment: yes");
    result.variant = footer.includes("page: lite") ? "lite" : footer.includes("page: full") ? "full" : null;
  } finally {
    await context.close(); // closing fires pagehide, which sends page_bytes
  }
  return result;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Bytes and time-to-content per variant, enrolled visitors only. */
function printMetrics(results: VisitResult[]): void {
  console.log("\n  Per variant (enrolled visitors):");
  for (const variant of ["full", "lite"] as const) {
    const rs = results.filter((r) => r.enrolled && r.variant === variant);
    const bytes = rs.flatMap((r) => (r.bytes === null ? [] : [r.bytes]));
    const ttc = rs.flatMap((r) => (r.timeToContentMs === null ? [] : [r.timeToContentMs]));
    const mb = (b: number | null) => (b === null ? "-" : `${(b / 1_000_000).toFixed(2)} MB`);
    const sec = (ms: number | null) => (ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`);
    const mean = bytes.length ? bytes.reduce((a, b) => a + b, 0) / bytes.length : null;
    console.log(
      `    ${variant}: bytes when leaving median ${mb(median(bytes))}, mean ${mb(mean)}; ` +
        `content on screen within patience for ${ttc.length}/${rs.length}, median time-to-content ${sec(median(ttc))}`,
    );
  }
}

async function main(): Promise<void> {
  // Read inside main() so a bad value prints one clear line, not a stack trace.
  const TARGET_PER_VARIANT = positiveInt("TARGET_PER_VARIANT", 60);
  const MAX_VISITS = positiveInt("MAX_VISITS", 400);
  const CONCURRENCY = positiveInt("CONCURRENCY", 4);
  const url = new URL(SIM_URL);
  assertSafeTarget(url);
  if (!BYPASS_SECRET) console.warn("VERCEL_AUTOMATION_BYPASS_SECRET is empty: a protected preview will block every visit.");

  const tally = {
    full: { enrolled: 0, started: 0, completed: 0 },
    lite: { enrolled: 0, started: 0, completed: 0 },
  };
  let visits = 0;
  let notEnrolled = 0;
  let consecutiveFailures = 0;
  const results: VisitResult[] = [];
  const done = () => tally.full.enrolled >= TARGET_PER_VARIANT && tally.lite.enrolled >= TARGET_PER_VARIANT;

  const browser = await chromium.launch();
  try {
    // A few visitors in parallel. Stop rule: keep going until EVERY variant has
    // TARGET_PER_VARIANT enrolled visitors (a fixed visit count can leave one arm
    // short by chance), or until MAX_VISITS as a safety cap.
    const worker = async (): Promise<void> => {
      while (!done() && visits < MAX_VISITS) {
        visits++;
        let r: VisitResult;
        try {
          r = await visit(browser, url);
          consecutiveFailures = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Protection blocking us won't fix itself: stop now instead of burning visits.
          if (message.includes("Vercel protection")) throw error;
          console.error(`visit ${visits} failed: ${message}`);
          if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            throw new Error(`${MAX_CONSECUTIVE_FAILURES} visits in a row failed: stopping. Is the sim preview up?`);
          }
          continue;
        }
        results.push(r);
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
        console.log(`visit ${visits}: ${r.variant}, started=${r.started}, completed=${r.completed}, ttc=${r.timeToContentMs ?? "-"}ms, bytes=${r.bytes ?? "-"}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await browser.close();
    console.log("\nSIMULATED visitors (report separately from real ones):");
    for (const variant of ["full", "lite"] as const) {
      const { enrolled, started, completed } = tally[variant];
      const pct = (n: number) => (enrolled ? ((100 * n) / enrolled).toFixed(1) : "0.0");
      console.log(`  ${variant}: ${enrolled} enrolled, ${started} started (${pct(started)}%), ${completed} completed (${pct(completed)}%)`);
    }
    console.log(`  visits: ${visits}, not enrolled: ${notEnrolled}`);
    printMetrics(results);
    // Keep every visit on disk for the write-up (no secrets in here).
    mkdirSync("sim-results", { recursive: true });
    const file = `sim-results/sim-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify({ url: url.toString(), network: NETWORK_3G, results }, null, 2));
    console.log(`  per-visit data: ${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
