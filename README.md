# LiteSwitch

An open-source "data-saver mode" for websites: visitors on slow or Data-Saver connections get a lighter page, and a Flagsmith A/B test checks whether it actually helps.

> Built for [Toggle Wars: The Flagsmith Experimentation Hackathon](https://www.wemakedevs.org/hackathons/flagsmith) by [WeMakeDevs](https://www.wemakedevs.org), Track 01: **Test Something Real**. Feature flags and experiments are powered by [Flagsmith](https://flagsmith.com).

## Problem

In much of Africa and South Asia, 1 GB of mobile data costs a real share of monthly income. Browsers already report when a connection is slow or Data Saver is on, but most sites ignore that and send the same heavy page to everyone.

## How it works

- The browser reads `navigator.connection` (2G/3G, Data Saver). The `Save-Data` header is mirrored into a cookie by `proxy.ts`.
- Visitors on slow connections get a **full** or **lite** version of the lesson "Git in 10 minutes". Fast and unknown visitors always get full.
- Lite means a tap-to-load 360p video instead of autoplay HD, small lazy images and system fonts.
- A footer "data-cost receipt" shows how many MB the page used and what that costs in Ghana cedis at MTN Ghana's pay-as-you-go rate (GH₵0.1145/MB, no bundle).

## How Flagsmith is used

- Multivariate flag `page_weight` (full / lite JSON), evaluated per visitor identity.
- Flagsmith Experimentation A/B test for slow-connection visitors only. The exposure is recorded when the variant is shown.
- Metrics: `lesson_started` (primary), `lesson_completed`, `page_bytes`.
- If Flagsmith is unreachable, everyone gets the full page.

## Use LiteSwitch on your site

A 10-minute guide. You need a Flagsmith account and a page with something heavy on it: a video, big images, embeds.

**1. Create the Flagsmith side (about 5 minutes).** [`docs/flagsmith-setup.json`](docs/flagsmith-setup.json) lists everything to create by hand, with the exact names the code expects:
- a warehouse in each environment (Environment Settings → Warehouse → Flagsmith)
- the multivariate flag `page_weight`: control = the full JSON, one variation `lite`
- the metrics `lesson_started`, `lesson_completed` and `page_bytes` (rename `lesson_started` to your own primary action if you like)
- the segment `slow_or_saver`, for rolling out the winner later
- the experiment: rollout 100%, split 50/50, created last, because it starts as soon as you create it

**2. Add the code (about 5 minutes).** Pick the path that matches your site:
- **Any website, no build step:** copy [`examples/plain-html/liteswitch.js`](examples/plain-html/liteswitch.js) next to your page and follow [`examples/plain-html/index.html`](examples/plain-html/index.html):
  ```js
  import { decide } from "./liteswitch.js";
  const choice = await decide({ environmentID: "<client-side key>" });
  // render choice.config (full or lite), then:
  choice.recordExposure();          // once, when the variant is on the page
  choice.track("lesson_started");   // your conversion event
  ```
- **Next.js:** copy `lib/liteswitch/`, `lib/flags.ts` and `proxy.ts`, then wrap your page in a provider like `app/lesson/VariantProvider.tsx`. `proxy.ts` gives every visitor a stable id cookie and passes the `Save-Data` header to the browser.

**3. Check it.** Put the Flagsmith client-side key in, and throttle Chrome to "3G" in DevTools (or force `navigator.connection` with `chrome://flags` → *Force effective connection type*). A slow visitor should get a decision from Flagsmith; a fast visitor always gets the full page and never contacts Flagsmith.

The rules that keep the experiment honest are built in, so keep them if you adapt the code:
- **Only slow visitors are enrolled.** Fast visitors would dilute the result. Safari and Firefox can't report a connection type, so they stay out.
- **The exposure is recorded when the variant is put on the page, and only if Flagsmith says the visitor is in the experiment.** Never use `getExperimentFlag`, which records at read time.
- **Every failure falls back to the full page with nothing recorded:** a missing key, blocked cookies, a 5-second timeout, or an error.

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
