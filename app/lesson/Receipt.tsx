"use client";
// Footer "data-cost receipt": how many MB this page used and what that costs.
// Also sends the page_bytes event once (when the visitor leaves or completes).
import { useEffect, useState } from "react";
import { CFA_PER_GB, bytesToCfa, bytesTransferred } from "@/lib/liteswitch/bytes";
import { track, type Decision } from "@/lib/flags";
import { useVariant } from "./VariantProvider";

let bytesReported = false;

/** Send page_bytes at most once per page view (only enrolled visitors send anything). */
export function reportPageBytesOnce(decision: Decision): void {
  if (bytesReported) return;
  bytesReported = true;
  track(decision, "page_bytes", bytesTransferred());
}

export function Receipt() {
  const { decision } = useVariant();
  const [bytes, setBytes] = useState(0);

  // Refresh the number every second while files keep arriving.
  useEffect(() => {
    const update = () => setBytes(bytesTransferred());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // When the tab is hidden or closed, report the bytes used so far.
  useEffect(() => {
    if (!decision) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") reportPageBytesOnce(decision);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [decision]);

  const mb = bytes / 1_000_000;
  const cfa = bytesToCfa(bytes);
  const mode = decision ? (decision.config.video === "autoplay-hd" ? "full" : "lite") : "…";

  return (
    <footer className="receipt">
      <p>
        🧾 This page used <strong>{mb.toFixed(2)} MB</strong> ≈ <strong>{cfa.toFixed(2)} FCFA</strong> of mobile data
      </p>
      <p className="small">
        Price: {CFA_PER_GB.toLocaleString("en")} FCFA per GB (Orange Sénégal 1 GB pass). Video bytes are estimated from how much has buffered.
      </p>
      {mode === "lite" && (
        <p className="small">Lite mode is on because your connection looks slow, so videos load only when you tap.</p>
      )}
      <p className="small debug">
        page: {mode} · reason: {decision?.reason ?? "deciding"} · in experiment: {decision?.enrolled ? "yes" : "no"}
      </p>
    </footer>
  );
}
