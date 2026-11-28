"use client";
// Explainer banner for first-time visitors (judges, mostly). Its text is in the
// first HTML; the only JavaScript is the close button. It never touches the
// variant decision, the exposure or lesson_started, and adds well under 1 KB.
// Closing removes the whole banner (button included), so keyboard focus can't
// land on a hidden control. It comes back on reload: no cookie, on purpose.
import { useState } from "react";

export function AboutBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="about" role="note">
      <p>
        <strong>LiteSwitch:</strong> this page automatically goes lite on slow or Data-Saver connections. Flagsmith
        decides who gets which version. <a href="https://github.com/CyrilBaah/liteswitch#readme">→ How it works</a>
      </p>
      <button type="button" className="about-close" aria-label="Dismiss the LiteSwitch banner" onClick={() => setOpen(false)}>
        ×
      </button>
    </div>
  );
}
