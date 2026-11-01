"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "@/app/intro.module.css";

export function IntroVideo() {
  const [failed, setFailed] = useState(false);

  return (
    <div>
      <div className={styles.videoFrame}>
        <video
          className={styles.video}
          width="1280"
          height="720"
          controls
          playsInline
          preload="none"
          poster="/tour/pagecrate-tour-poster.webp"
          aria-label="PageCrate の操作デモ"
          aria-describedby="tour-description"
          onError={() => setFailed(true)}
          onPlaying={() => setFailed(false)}
        >
          <source src="/tour/pagecrate-tour.mp4" type="video/mp4" />
          <source src="/tour/pagecrate-tour.webm" type="video/webm" onError={() => setFailed(true)} />
          <track kind="captions" src="/tour/pagecrate-tour.ja.vtt" srcLang="ja" label="日本語" default />
          このブラウザーでは動画を再生できません。下の操作説明とデモで使い方を確認できます。
        </video>
      </div>
      <div className={styles.videoSupport}>
        <p><Icon name="info" />再生ボタンで開始します。日本語字幕つき。</p>
        <div><Link href="/demo" prefetch={false}>デモを開く<Icon name="arrow" /></Link><Link href="/app" prefetch={false}>自分のURLで使う</Link></div>
      </div>
      {failed && <p className={styles.videoError} role="status">動画を読み込めませんでした。下の操作説明や「デモを開く」から、同じ流れを確認できます。</p>}
    </div>
  );
}
