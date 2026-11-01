/**
 * How the screens say that the operator has paused page scans (the demo-only public site). One way everywhere (UI
 * scoring of the paused screens, round 1: the band said "止めています" in red while the note said "お休み", and the
 * same fact was told three times): the heading of the band, and the same as the first sentence of /app's note, of
 * /demo's line and of the top page's closing band. A pattern puts "|" where the sentence may wrap on a phone
 * (components/phrased.tsx). Plain values, so server and client components share them.
 */
export const PAUSE_HEADING = "実サイトの取得は、いまお休み中です";
export const PAUSE_LEAD = `${PAUSE_HEADING}。`;
export const PAUSE_LEAD_PHRASES = "実サイトの取得は、|いまお休み中です。";
/** What to do instead: the second sentence of /app's note, and the band's body while the screen knows the pause. */
export const PAUSE_NEXT = "デモなら、自作の素材で同じ流れを試せます。";
export const PAUSE_NEXT_PHRASES = "デモなら、|自作の素材で|同じ流れを試せます。";
