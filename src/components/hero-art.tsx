import { Icon } from "./icons";

export function HeroArt() {
  return <div className="hero-art" aria-hidden="true">
    <div className="art-orbit" />
    <div className="art-card art-card-back"><div className="art-card-header"><span /><span /><span /></div><div className="art-lines"><i /><i /><i /></div></div>
    <div className="art-card art-card-image"><div className="art-landscape"><div className="art-sun" /><div className="art-hill art-hill-back" /><div className="art-hill art-hill-front" /><span className="art-image-index">01 / IMAGE</span></div><div className="art-file-label"><Icon name="image" /><span>a little inspiration.jpg</span><span className="art-tick"><Icon name="check" /></span></div></div>
    <div className="art-card art-card-video"><div className="art-video-poster"><span className="art-play"><svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor"><path d="m8 5 11 7-11 7V5Z" /></svg></span><span>02 / VIDEO</span></div><div className="art-file-label"><Icon name="video" /><span>in motion.mp4</span></div></div>
    <div className="art-annotation"><svg width="55" height="28" viewBox="0 0 55 28" fill="none"><path d="M2 3C19 2 21 26 48 19m-4-5 6 5-6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Find. Pick. Keep.</span></div>
  </div>;
}
