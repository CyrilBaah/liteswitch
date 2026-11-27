# LiteSwitch: project brief

## Project
LiteSwitch is an open-source "data-saver mode" for websites. It's being built for the **Toggle Wars Flagsmith hackathon**, Track 01: *Test Something Real*.

## What it does
- Detects each visitor's connection: 2G/3G, or Data Saver turned on.
- **Flagsmith** decides whether that visitor gets the **FULL** page or a **LITE** page. The lite page has no autoplay video, small lazy-loaded images, system fonts and no embeds.
- A **Flagsmith Experimentation A/B test** checks whether lite helps slow-connection visitors start reading.
- The winning variant is rolled out **only** to the slow-connection segment.

## Why
In much of Africa and South Asia, 1GB of mobile data costs a big share of monthly income. Browsers already send connection signals, and most sites ignore them.

## Hypothesis
For visitors on slow (<=3G) or Data-Saver connections, a lite page will get more of them to start the lesson than the full page does.

## Deadlines (hard)
- **Fri Nov 27 2026, 12:00 GMT**: live, with the experiment running.
- **Sun Nov 29 2026, 12:00 GMT**: submitted.
- **Nov 29 2026, 14:30 GMT**: hard deadline.

## Stack
- Next.js (App Router, TypeScript) on Vercel
- Flagsmith Cloud (free plan, Experimentation beta)

## Demo content
One useful free lesson page, **"Git in 10 minutes"**, with a video, images, code blocks, a **"Start lesson"** button and a **"Mark complete"** button.

## Reusable part: `packages/liteswitch/`
- **Client snippet:**
  - reads `navigator.connection` (`effectiveType`, `saveData`, `rtt`, `downlink`)
  - falls back gracefully on Safari and Firefox, which don't support that API
  - keeps **one** stable visitor id in a cookie
- **Server helper:** reads the `Save-Data` request header.

## Flagsmith design
- **Identity:** the visitor id.
- **Traits:** `net_type`, `save_data`, `rtt_ms`.
- **Segment `slow_or_saver`:** `net_type` in `[slow-2g, 2g, 3g]` OR `save_data = true`.
- **Multivariate flag `page_weight`** with these JSON values:
  - full: `{"video":"autoplay-hd","images":"hd","fonts":"web","embeds":true}`
  - lite: `{"video":"tap-to-load-360p","images":"low-lazy","fonts":"system","embeds":false}`
- **Events:** `lesson_started` (primary metric) and `lesson_completed` (secondary metric). Both are tracked with the **same** visitor id.
- **Fallback:** the default flag handler serves **full** if Flagsmith can't be reached.

## Extras
- **Footer "data-cost receipt":** bytes transferred (from the Performance API) × price per GB, shown as "This page used 0.9 MB ≈ X CFA".
- Log bytes transferred and time-to-content for each variant.

## Rules
- Secrets go **only** in `.env.local` and Vercel environment variables. Never commit them.
- For Experimentation SDK method names, **read the docs; never guess**:
  - https://docs.flagsmith.com/experimentation
  - https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent
- Keep the code simple and commented. The owner must be able to understand and explain every file.

## Git workflow
- **Commit messages:** ONE short, plain sentence.
- **Author and committer:** the owner's identity from global git config (`git config --global user.name` / `user.email`). If either is empty, stop and ask.
- **No attribution:** NO `Co-Authored-By` trailer or any other attribution line in commits or PRs, ever. (`.claude/settings.json` disables Claude Code's co-author line.)
- **Never push to `main`.** `main` is protected: a PR and green `ci` + `Greptile Review` checks are required, and force pushes and deletion are blocked.
- **Every change:** new branch → commit → push the branch → `gh pr create` with a one-sentence title → wait for the checks to finish → tell the owner when it's green, so they can approve and merge. Don't merge on their behalf.
- **Auto-merge:** a PR whose Greptile confidence is **5/5 on its latest commit**, with green required checks (`ci` + `Greptile Review`), auto-merges as a merge commit (`.github/workflows/greptile-automerge.yml`). Anything else waits for Cyril. PRs that change `.github/workflows/` always wait for Cyril, whatever the score. The score only counts if Greptile made the last edit to the PR description; editing the description afterwards turns the PR back into a manual merge.
- CI (`.github/workflows/ci.yml`, job `ci`) runs lint, type-check (`tsc --noEmit`) and `next build`. Run all three locally before pushing: `npm run lint && npm run typecheck && npm run build`.

## Code comments
- Wherever something is non-obvious or interesting, add a short comment explaining **why**. Examples: why the exposure is recorded when the variant is committed (not when media paints), why HD images aren't resized by `next/image`, why fast visitors never enter the experiment, why events are flushed right away and on `pagehide`.
- No noise comments on obvious code.
