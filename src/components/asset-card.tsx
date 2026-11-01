"use client";

import { AssetPreview } from "@/components/asset-preview";
import { Icon } from "@/components/icons";
import { isPreviewPath } from "@/lib/api-client";
import { isSelectable } from "@/lib/asset-selection";
import type { PreviewStore } from "@/lib/preview-store";
import type { AssetItem } from "@/lib/types";

export function publicSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function readableSize(bytes?: number) {
  if (bytes === undefined) return null;
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

interface AssetCardProps {
  readonly asset: AssetItem;
  /** Makes element ids unique per result. */
  readonly idPrefix: string;
  readonly previews: PreviewStore;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: (asset: AssetItem) => void;
}

/** One candidate. Only a candidate with a ticket gets a checkbox; only an image with a preview address is previewed. */
export function AssetCard({ asset, idPrefix, previews, selected, disabled, onToggle }: AssetCardProps) {
  const checkboxId = `${idPrefix}-select-${asset.id}`;
  const titleId = `${idPrefix}-title-${asset.id}`;
  const savable = isSelectable(asset);
  const previewPath = asset.kind === "image" && isPreviewPath(asset.previewUrl) ? asset.previewUrl : null;
  const sourceHref = publicSourceUrl(asset.url);
  const dimensions = asset.width && asset.height ? `${asset.width.toLocaleString()} × ${asset.height.toLocaleString()}` : "サイズ不明";
  const fileSize = readableSize(asset.bytes);
  const kindLabel = asset.kind === "image" ? "画像" : asset.kind === "video" ? "動画" : "未対応";

  return <article className={`asset-card${selected ? " is-selected" : ""}${savable ? "" : " is-unsupported"}`} aria-labelledby={titleId}>
    <div className={`asset-preview preview-kind-${asset.kind}`}>
      {previewPath ? <AssetPreview store={previews} path={previewPath} name={asset.name} /> : asset.kind === "video" && savable ? <div className="video-placeholder" aria-hidden="true">
        <span className="video-corner top-left" /><span className="video-corner bottom-right" />
        <span className="video-play"><svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor"><path d="m9 5 11 7-11 7V5Z" /></svg></span>
        <span className="video-caption">動画ファイル</span>
      </div> : <div className="preview-placeholder">
        <Icon name={asset.kind === "image" ? "image" : "video"} />
        <span>{savable ? "プレビューなし" : "この素材は保存できません"}</span>
      </div>}
      <span className="asset-format">{asset.format || kindLabel}</span>
      {savable ? <label className={`asset-selection${disabled ? " is-disabled" : ""}`} htmlFor={checkboxId}>
        <input id={checkboxId} type="checkbox" checked={selected} disabled={disabled} onChange={() => onToggle(asset)} />
        <span className="selection-indicator"><Icon name="check" /></span>
        <span className="sr-only">{asset.name} を選択</span>
      </label> : <span className="unsupported-label">未対応</span>}
    </div>
    <div className="asset-info">
      <div className="asset-kind-row"><span><Icon name={asset.kind === "image" ? "image" : "video"} />{kindLabel}</span>{selected && <span className="selected-label">選択中</span>}</div>
      <h3 id={titleId} title={asset.name}>{asset.name}</h3>
      <p className="asset-dimensions">{dimensions}{fileSize && <><span aria-hidden="true"> · </span>{fileSize}</>}</p>
      {asset.reason && <p className="asset-reason">{asset.reason}</p>}
      {asset.kind === "video" && savable && <p className="asset-video-note">プレビュー再生には対応していません</p>}
      <details className="asset-details">
        <summary>出典と詳細<Icon name="chevron" /></summary>
        <div className="asset-detail-body">
          <span className="detail-label">ファイル名</span>
          <p className="asset-full-name">{asset.name}</p>
          <span className="detail-label">元の素材</span>
          {sourceHref ? <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="asset-source-link">{asset.url}<Icon name="external" /></a> : <span className="asset-source-text">{asset.url}</span>}
        </div>
      </details>
    </div>
  </article>;
}
