# LiteSwitch

An open-source "data-saver mode" for websites: visitors on slow or Data-Saver connections get a lighter page, and a Flagsmith A/B test checks whether it actually helps.

## Problem

In much of Africa and South Asia, 1 GB of mobile data costs a real share of monthly income. Browsers already report when a connection is slow or Data Saver is on, but most sites ignore that and send the same heavy page to everyone.

## How it works

- The browser reads `navigator.connection` (2G/3G, Data Saver). The `Save-Data` header is mirrored into a cookie by `proxy.ts`.
- Visitors on slow connections get a **full** or **lite** version of the lesson "Git in 10 minutes". Fast and unknown visitors always get full.
- Lite means a tap-to-load 360p video instead of autoplay HD, small lazy images and system fonts.
- A footer "data-cost receipt" shows how many MB the page used and what that costs in FCFA.

## How Flagsmith is used

- Multivariate flag `page_weight` (full / lite JSON), evaluated per visitor identity.
- Flagsmith Experimentation A/B test for slow-connection visitors only. The exposure is recorded when the variant is shown.
- Metrics: `lesson_started` (primary), `lesson_completed`, `page_bytes`.
- If Flagsmith is unreachable, everyone gets the full page.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY`.
3. In Flagsmith, turn on the warehouse, then create the `page_weight` flag with its full and lite JSON values, the three metrics, and the experiment. Without these, everyone gets the full page and no experiment events are sent. Step-by-step: "Flagsmith setup" in [docs/design.md](docs/design.md).
4. `npm run dev`, then open http://localhost:3000.

## Results

_Pending: the experiment starts on Fri 27 Nov 2026. Real and simulated results will be reported separately here._

## Limitations

- `navigator.connection` exists only in Chromium browsers, so Safari and Firefox visitors are never in the experiment.
- Video bytes in the receipt are estimated from how much of the video has buffered.

## AI use

Planned and built with Claude Code (with the gstack skills for design review and checks). Every change was reviewed and committed by the author.
