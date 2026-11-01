import { Fragment } from "react";
import { splitPhrases } from "@/lib/phrase-breaks";

/**
 * A sentence that wraps only between its phrases, in every browser: `word-break: keep-all` (class "phrased") with a
 * <wbr> between phrases. A phrase with a space inside it (a name such as "Cloudflare の") stays on one line. The words
 * are the same as `text`; only break opportunities are added.
 */
export function Phrased({ text, pattern }: { readonly text: string; readonly pattern?: string }) {
  return <span className="phrased">{splitPhrases(text, pattern).map((part, index) => <Fragment key={index}>
    {index > 0 && <wbr />}
    {/\S\s+\S/.test(part) ? <span className="phrase">{part}</span> : part}
  </Fragment>)}</span>;
}

/**
 * Sentences in one paragraph, each a span of class `className`, so the CSS can start each on a line of its own (on
 * phones, for the rights note and the top page's note). Each wraps only between its phrases. `patterns` are the
 * sentences with "|" between phrases; when together they do not spell `text`, `text` is shown whole, as in Phrased.
 */
export function Sentences({ text, patterns, className = "phrased-sentence" }: { readonly text: string; readonly patterns: readonly string[]; readonly className?: string }) {
  if (patterns.map(pattern => pattern.replaceAll("|", "")).join("") !== text) return <Phrased text={text} />;
  return <>{patterns.map((pattern, index) => <span key={index} className={className}><Phrased text={pattern.replaceAll("|", "")} pattern={pattern} /></span>)}</>;
}
