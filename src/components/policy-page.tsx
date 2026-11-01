import Link from "next/link";
import { SiteHeader } from "./site-header";
import { POLICY_VERSION, policyVersionDate } from "@/lib/policy";
import type { PolicyBlock, PolicyDocument, PolicyInline } from "@/lib/policy-content";
import styles from "./policy-page.module.css";

function Inline({ part }: { part: PolicyInline }) {
  if (typeof part === "string") return part;
  return part.external
    ? <a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}<span className="sr-only">（新しいタブで開きます）</span></a>
    : <Link href={part.href}>{part.text}</Link>;
}

function Block({ block }: { block: PolicyBlock }) {
  switch (block.kind) {
    case "paragraph": return <p>{block.parts.map((part, index) => <Inline key={index} part={part} />)}</p>;
    case "list": return <ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
    case "facts": return <dl>{block.items.map(item => <div key={item.term}><dt>{item.term}</dt><dd>{item.detail}</dd></div>)}</dl>;
    case "table": return <div className={styles.tableWrap}>
      {/* Explicit roles keep the table readable by screen readers when narrow screens stack its rows. */}
      <table className={styles.table} role="table">
        <caption>{block.caption}</caption>
        <thead role="rowgroup"><tr role="row">{block.columns.map(column => <th key={column} scope="col" role="columnheader">{column}</th>)}</tr></thead>
        <tbody role="rowgroup">{block.rows.map(([name, ...cells]) => <tr key={name} role="row">
          <th scope="row" role="rowheader">{name}</th>
          {cells.map((cell, index) => <td key={index} role="cell" data-label={block.columns[index + 1]}>{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>;
  }
}

/** Frame of the terms, privacy and cookie pages. It draws a document from policy-content.ts and adds nothing to it. */
export function PolicyPage({ document, path }: { document: PolicyDocument; path: "/terms" | "/privacy" | "/cookies" }) {
  return <div className="workspace">
    <SiteHeader current={path} skipTo="policy" skipLabel="本文へ" />
    <main id="policy" className={styles.document}>
      <p className="eyebrow">使う前にお読みください</p>
      <h1>{document.title}</h1>
      <p className={styles.version}>文書版 {POLICY_VERSION} / {policyVersionDate()}</p>
      <p className={styles.lead}>{document.lead}</p>
      <article>{document.sections.map(section => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.blocks.map((block, index) => <Block key={index} block={block} />)}
      </section>)}</article>
      <nav className={styles.links} aria-label="利用条件の関連ページ">
        <Link href="/terms">利用規約</Link><Link href="/privacy">プライバシーポリシー</Link><Link href="/cookies">Cookieについて</Link>
      </nav>
      <Link className="button button-primary" href="/app">素材を集める画面へ</Link>
    </main>
  </div>;
}
