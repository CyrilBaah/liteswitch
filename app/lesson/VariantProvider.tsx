"use client";
// Decides, once per page view, whether this visitor sees the FULL or LITE page,
// and shares that decision with every component below it.
//
// Flow:
//   fast / unknown connection -> FULL right away, no Flagsmith call
//   slow connection           -> ask Flagsmith (lib/flags.ts), FULL on timeout/error
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { readConnection } from "@/lib/liteswitch/connection";
import { getVisitorId } from "@/lib/liteswitch/visitor";
import { FULL, LITE, decidePageWeight, fallback, type Decision } from "@/lib/flags";

/** ?net=3g only works on the sim deployment (NEXT_PUBLIC_SIM_MODE=1). */
const SIM_MODE = process.env.NEXT_PUBLIC_SIM_MODE === "1";

type VariantState = {
  /** null while we're still deciding: show placeholders, load no media. */
  decision: Decision | null;
  /** True once the intro media (video frame or poster) is on screen. */
  introVisible: boolean;
  setIntroVisible: (visible: boolean) => void;
};

const VariantContext = createContext<VariantState | null>(null);

export function useVariant(): VariantState {
  const state = useContext(VariantContext);
  if (!state) throw new Error("useVariant must be used inside <VariantProvider>");
  return state;
}

// Decide only once per page load, even if React runs the effect twice (dev mode).
let decisionPromise: Promise<Decision> | null = null;

async function decide(): Promise<Decision> {
  // Local testing only: `npm run dev` + ?variant=lite shows a variant without
  // Flagsmith. Never enrolled, so it can't touch experiment data.
  if (process.env.NODE_ENV === "development") {
    const forced = new URLSearchParams(location.search).get("variant");
    if (forced === "lite" || forced === "full") {
      return { config: forced === "lite" ? LITE : FULL, enrolled: false, variant: null, reason: "dev-override" };
    }
  }

  const { tier, traits } = readConnection(SIM_MODE);
  // Fast/unknown visitors never call Flagsmith: no exposure can be recorded
  // for them, and they don't spend a network request on the decision.
  if (tier !== "slow") return fallback("not-slow");

  const visitorId = getVisitorId();
  if (!visitorId) return fallback("no-visitor-id");

  return decidePageWeight(visitorId, traits);
}

export function VariantProvider({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [introVisible, setIntroVisible] = useState(false);

  useEffect(() => {
    decisionPromise ??= decide();
    decisionPromise.then(setDecision);
  }, []);

  // The web font is declared in globals.css but only USED (and so only
  // downloaded) when the page_weight says fonts: "web".
  useEffect(() => {
    if (decision?.config.fonts === "web") document.documentElement.classList.add("webfont");
  }, [decision]);

  return (
    <VariantContext.Provider value={{ decision, introVisible, setIntroVisible }}>
      {children}
    </VariantContext.Provider>
  );
}
