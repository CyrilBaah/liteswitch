// The lesson page: a SERVER component, so all the text and code arrive in
// the first HTML response, on every connection.

export default function LessonPage() {
  return (
    <main>
      <p className="eyebrow">Free lesson · 10 minutes</p>
      <h1>Git in 10 minutes</h1>
      <p className="lead">
        Git saves snapshots of your project so you can undo mistakes, try ideas safely and work with other
        people. Here are the three commands you&apos;ll use every day.
      </p>

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
      </section>

    </main>
  );
}
