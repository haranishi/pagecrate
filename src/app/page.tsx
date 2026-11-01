import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { IntroVideo } from "@/components/intro-video";
import { Sentences } from "@/components/phrased";
import { ShareBar } from "@/components/share-bar";
import { SiteHeader } from "@/components/site-header";
import { PAUSE_LEAD, PAUSE_LEAD_PHRASES } from "@/lib/pause-wording";
import { readLiveFetchSetup } from "@/lib/runtime-env";
import styles from "./intro.module.css";

export const metadata: Metadata = {
  title: "PageCrate — ページの画像と動画を、ひとつの ZIP に。",
  description:
    "公開ページの画像と動画を一覧にして、必要な素材を ZIP に。操作動画と登録不要の自作デモで、PageCrate の使い方を確認できます。",
};

/**
 * The hero's note, one sentence a line on phones, each wrapping only between its phrases. While page scans are paused
 * (the demo-only public site) it is replaced, not added to, and set as body text (UI scoring of the paused screens,
 * round 1: an added sentence in the faintest type repeated "試せます" and read as fetching next).
 */
const HERO_NOTE = "まずは自作のサンプルで。入力なしで、すぐに試せます。";
const HERO_NOTE_SENTENCES = ["まずは|自作のサンプルで。", "入力なしで、|すぐに試せます。"];
/** The first sentence is the one way every screen says the pause (UI scoring, round 2: the hero used to word it its own way). */
const HERO_PAUSE_NOTE = `${PAUSE_LEAD}デモなら入力なしで、すぐに試せます。`;
const HERO_PAUSE_SENTENCES = [PAUSE_LEAD_PHRASES, "デモなら|入力なしで、|すぐに試せます。"];
/** The closing band's first sentence; while paused, the one way the screens say the pause. */
const CLOSING_FETCH = "実際のページは、URLを入れて取得できます。";

/** Rendered per request: the pause is a runtime value of the Worker. */
export default async function IntroPage() {
  await connection();
  const paused = (await readLiveFetchSetup()).state === "paused";
  return (
    <div className={styles.page}>
      <SiteHeader current="/" skipTo="main-content" />

      <main id="main-content">
        <section className={`shell ${styles.hero}`} aria-labelledby="intro-title">
          <p className={styles.edition}><span aria-hidden="true" />登録なし・ログイン不要</p>
          <h1 className={styles.headline} id="intro-title">
            <span>ページの画像と動画を、</span>
            <span>ひとつの ZIP に。</span>
          </h1>
          <p className={styles.heroDescription}>
            公開ページの素材を一覧に。必要なものだけ選んで、<br className={styles.desktopBreak} />
            原本と取得結果の記録を、まとめて持ち帰れます。
          </p>
          <div className={styles.heroActions}>
            <Link className={`${styles.button} ${styles.primaryButton}`} href="/demo" prefetch={false}>
              登録なしで試す<Icon name="arrow" />
            </Link>
            <a className={styles.videoLink} href="#tour">操作を動画で見る<Icon name="chevron" /></a>
          </div>
          <p className={paused ? `${styles.heroNote} ${styles.heroPause}` : styles.heroNote}>{paused
            ? <Sentences text={HERO_PAUSE_NOTE} patterns={HERO_PAUSE_SENTENCES} className={styles.noteSentence} />
            : <Sentences text={HERO_NOTE} patterns={HERO_NOTE_SENTENCES} className={styles.noteSentence} />}</p>
        </section>

        <section className={`shell ${styles.tour}`} id="tour" aria-labelledby="tour-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>操作の動画</p>
              <h2 id="tour-title">選んで、ZIP にまとめるまで。</h2>
            </div>
            <p className={styles.recordingNote}><Icon name="video" />自作デモ素材での操作例・音声なし</p>
          </div>
          <IntroVideo />
          <div className={styles.transcript} id="tour-description">
            <p className={styles.transcriptLabel}>動画で行っていること</p>
            <div>
              <p>自作デモを開く → プライバシーポリシーを確認する → 画像を選ぶ → 動画で絞り込む → ZIP に保存する。</p>
              <p className={styles.transcriptNote}>実際のサイトの取得は、この動画では行っていません。</p>
            </div>
          </div>
        </section>

        <section className={`shell ${styles.stepsSection}`} aria-labelledby="steps-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>使い方</p>
              <h2 id="steps-title">いつものページから、3 ステップ。</h2>
            </div>
          </div>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <div className={styles.stepTop}><span>01 / URL</span><Icon name="link" /></div>
              <h3>ページの URL を入れる</h3>
              <p>公開ページの URL を入れて「素材を見つける」を押すと、取得できる画像と動画を一覧にします。初めて使うときは、プライバシーポリシーを確認していただきます。</p>
            </li>
            <li className={styles.step}>
              <div className={styles.stepTop}><span>02 / SELECT</span><Icon name="check" /></div>
              <h3>必要な素材だけ、選ぶ</h3>
              <p>画像・動画の種類や名前で絞り込み、残したいものを選択。選んだ素材は、絞り込みを変えても保持されます。</p>
            </li>
            <li className={styles.step}>
              <div className={styles.stepTop}><span>03 / SAVE</span><Icon name="download" /></div>
              <h3>原本と記録を、ZIP に</h3>
              <p>取得できた原本をひとつの ZIP に。出典のドメインと各素材の取得結果は、同梱の manifest.json で確認できます。</p>
            </li>
          </ol>
        </section>

        <section className={`shell ${styles.scope}`} aria-labelledby="scope-title">
          <div className={styles.scopeIntro}>
            <p className={styles.eyebrow}>使う前に</p>
            <h2 id="scope-title">できることと、<br />できないこと。</h2>
            <p>自分の素材や、許可のある素材を整理するための小さな道具です。</p>
          </div>
          <div className={styles.scopeDetails}>
            <ul className={styles.limits}>
              <li><Icon name="check" /><div><h3>保存する権利・許可のある素材に。</h3><p>公開されていることと、自由に保存・再利用できることは別です。利用条件と権利を確認してお使いください。</p></div></li>
              <li><Icon name="info" /><div><h3>すべての素材を取得できるとは限りません。</h3><p>ページの作りや取得制限によって、一覧に出ない素材や保存に失敗する素材があります。</p></div></li>
              <li><Icon name="video" /><div><h3>配信の録画や、保護の解除は対象外です。</h3><p>ログインが必要なページ、HLS / DASH 形式の配信、DRM で保護された動画には対応していません。</p></div></li>
            </ul>
            <p className={styles.limitsNote}>1 回 50 件まで · 素材 1 件 25 MiB / 素材合計 100 MiB まで</p>
          </div>
        </section>

        <section className={`shell ${styles.closing}`} aria-labelledby="try-title">
          <div className={styles.closingCopy}>
            <p className={styles.eyebrow}>試してみる</p>
            <h2 id="try-title">まずは、自作のサンプルで。</h2>
            <p>画像と動画を選んで、実際の ZIP を保存できます。</p>
          </div>
          <div className={styles.closingActionGroup}>
            <div className={styles.closingActions}>
              <Link className={`${styles.button} ${styles.lightButton}`} href="/demo" prefetch={false}>登録なしで試す<Icon name="arrow" /></Link>
              <Link className={`${styles.button} ${styles.lightOutlineButton}`} href="/app" prefetch={false}>自分のURLで使う</Link>
            </div>
            {/* One sentence per line on every width (UI scoring round 2: a phone split "使う／前に" when the two ran on). */}
            <p>{paused ? PAUSE_LEAD : CLOSING_FETCH}<br />使う前に、権利者の許諾と対象サイトの規約を確認してください。</p>
          </div>
        </section>
      </main>

      <ShareBar className={`shell ${styles.share}`} />

      <footer className={`shell ${styles.footer}`}>
        <div><p className={styles.footerBrand}>PageCrate.</p><p>公開ページの画像と動画を、出典の記録つきでまとめて保存する道具です。入力したURLや集めた素材は、運営者の設備に保存しません。</p></div>
        <nav aria-label="利用条件">
          <Link href="/terms" prefetch={false}>利用規約</Link>
          <Link href="/privacy" prefetch={false}>プライバシー</Link>
          <Link href="/cookies" prefetch={false}>Cookie</Link>
        </nav>
      </footer>
    </div>
  );
}
