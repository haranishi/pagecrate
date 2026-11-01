/**
 * Share links (design-ux.md, "変わった実装" 6; every public app of this author gets the same four ways to share).
 * Pure: the screen passes `location.origin`, so the links follow the address the page was opened at.
 * Instagram and YouTube have no official web page for posting a link; the screen says to use the device's share
 * sheet or the copied link for them instead.
 */

/** The words that go with a shared link on X (LINE takes the address only). */
export const SHARE_TEXT = "PageCrate — 公開ページの画像と動画を、出典の記録つきでZIPに。登録なしで使えます。";
export const SHARE_TITLE = "PageCrate";

/** What is shared: the top page of the origin the page was opened at. */
export function shareTarget(origin: string): string {
  return `${new URL(origin).origin}/`;
}

export interface ShareLinks {
  /** X's post screen with the text and the address filled in. */
  readonly x: string;
  /** LINE's share screen for the address. */
  readonly line: string;
}

export function shareLinks(url: string, text: string = SHARE_TEXT): ShareLinks {
  return {
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
  };
}
