"use client";
// "Start lesson" (primary metric) and "Mark complete" (secondary metric).
import { useState } from "react";
import { track } from "@/lib/flags";
import { useVariant } from "./VariantProvider";
import { reportPageBytesOnce } from "./Receipt";

export function StartButton() {
  const { decision, introVisible } = useVariant();
  const [started, setStarted] = useState(false);

  // For visitors in the experiment, the button only works once the lesson's
  // intro is actually on screen. On a heavy page over 3G that can take a while,
  // which is exactly the drop-off the experiment measures.
  // Everyone else (not enrolled) can start right away: their clicks aren't
  // measured, and some browsers (e.g. iOS Low Power Mode) never preload video.
  const ready = decision !== null && (introVisible || !decision.enrolled);

  function start() {
    if (!decision || started) return;
    setStarted(true);
    track(decision, "lesson_started");
    document.getElementById("step-1")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <button className="cta" onClick={start} disabled={!ready || started}>
      {started ? "Lesson started ✓" : ready ? "Start lesson" : "Loading lesson…"}
    </button>
  );
}

export function CompleteButton() {
  const { decision } = useVariant();
  const [done, setDone] = useState(false);

  function complete() {
    if (!decision || done) return;
    setDone(true);
    track(decision, "lesson_completed");
    reportPageBytesOnce(decision);
  }

  return (
    <button className="cta" onClick={complete} disabled={!decision || done}>
      {done ? "Completed ✓ Nice work!" : "Mark complete"}
    </button>
  );
}
