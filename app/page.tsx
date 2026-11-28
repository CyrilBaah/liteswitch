// The lesson page. This file is a SERVER component: all the text and code
// below arrives in the first HTML response, on every connection. Only the
// heavy parts (video, images, web font) depend on the full/lite decision and
// live in client components under app/lesson/.
import { VariantProvider } from "./lesson/VariantProvider";
import { IntroMedia, StepImage } from "./lesson/LessonMedia";
import { CompleteButton, StartButton } from "./lesson/LessonButtons";
import { Receipt } from "./lesson/Receipt";

export default function LessonPage() {
  return (
    <VariantProvider>
      {/* Explainer banner for first-time visitors (judges, mostly). Server-rendered
          HTML + a few lines of CSS, no JavaScript: it can't delay the variant
          decision, the exposure or lesson_started, and adds well under 1 KB.
          Dismiss is a CSS-only checkbox, so it reappears on reload (no cookie). */}
      <input type="checkbox" id="about-close" className="about-toggle" aria-label="Dismiss the LiteSwitch banner" />
      <div className="about" role="note">
        <p>
          <strong>LiteSwitch:</strong> this page automatically goes lite on slow or Data-Saver connections. Flagsmith
          decides who gets which version. <a href="https://github.com/CyrilBaah/liteswitch#readme">→ How it works</a>
        </p>
        <label htmlFor="about-close" className="about-close" aria-hidden="true">×</label>
      </div>
      <main>
        <p className="eyebrow">Free lesson · 10 minutes</p>
        <h1>Git in 10 minutes</h1>
        <p className="lead">
          Git saves snapshots of your project so you can undo mistakes, try ideas safely and work with other
          people. Here are the three commands you&apos;ll use every day.
        </p>

        {/* Heavy media sits ABOVE the Start button on purpose: on a slow
            connection you feel the page's weight before you can begin. */}
        <IntroMedia />
        <StepImage name="diagram" alt="Diagram: commits on main, an idea branch, then a merge" width={1600} height={700} />

        <StartButton />

        <section id="step-1">
          <h2>1. Start tracking a folder</h2>
          <p>Open a terminal in your project folder and run:</p>
          <pre><code>git init</code></pre>
          <p>Git creates a hidden <code>.git</code> folder. Your files are untouched; Git is just watching now.</p>
        </section>

        <section>
          <h2>2. Save a snapshot (a commit)</h2>
          <p>Pick the changes to save, then save them with a short message:</p>
          <pre><code>{`git add index.html
git commit -m "Fix the title"`}</code></pre>
          <p>
            <code>git status</code> shows what changed. <code>git log --oneline</code> lists your snapshots.
          </p>
          <StepImage name="terminal" alt="Terminal showing git status, git add, git commit and git log" width={1600} height={900} />
        </section>

        <section>
          <h2>3. Try ideas safely on a branch</h2>
          <pre><code>{`git switch -c idea     # new branch, same files
# ...edit and commit as usual...
git switch main
git merge idea         # bring the idea into main`}</code></pre>
          <p>If the idea doesn&apos;t work out, switch back to <code>main</code> and nothing is lost.</p>
        </section>

        <section>
          <h2>That&apos;s it</h2>
          <p>
            <code>init</code>, <code>add</code>, <code>commit</code>, <code>switch</code>, <code>merge</code>. You now
            know the Git most people use every day.
          </p>
          <CompleteButton />
        </section>

        <Receipt />
      </main>
    </VariantProvider>
  );
}
