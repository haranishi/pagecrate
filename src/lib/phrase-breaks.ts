/**
 * Phrase breaks for short Japanese sentences that must wrap well on a phone (the rights note, the policy check).
 * A pattern is the sentence with "|" between phrases. It only applies when it spells exactly the same sentence, so a
 * changed sentence never loses or gains a character here: it is shown whole instead (and the E2E check of its breaks
 * fails, which is the reminder to update the pattern).
 */
export function splitPhrases(text: string, pattern: string | undefined): readonly string[] {
  if (pattern === undefined || pattern.replaceAll("|", "") !== text) return [text];
  return pattern.split("|").filter(part => part !== "");
}

/** The pattern among `patterns` that spells `text`, if any. */
export function patternFor(text: string, patterns: readonly string[]): string | undefined {
  return patterns.find(pattern => pattern.replaceAll("|", "") === text);
}
