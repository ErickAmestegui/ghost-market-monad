import Link from "next/link";

const DOCUMENTS = [
  ["readme", "README", "Purpose, setup, verification commands, statuses and current limitations."],
  ["envio", "Envio evaluation", "Monad 143 support, conditional historical adapter and current token blocker."],
  ["architecture", "Architecture", "Trust boundaries, live evidence pipeline, quality gates and security model."],
  ["contracts", "Contracts & provenance", "Inherited BNB scope: BSC contracts and registries."],
  ["technical-evidence", "Binance Web3 technical evidence", "Signed endpoints, observed responses and the unresolved provider restriction."],
  ["wallet-skill-evidence", "Binance Wallet Skill evidence", "Verified Ondo BSC metadata, multiplier normalization, limitations and reproduction steps."],
];

export default function DocumentationIndex() {
  return <main className="docs-shell"><nav><Link href="/">← Ghost Market</Link></nav><header><span>GHOST MARKET · MONAD EDITION</span><h1>Technical documentation</h1><p>Readable HTML pages backed by the same versioned documents included in the repository.</p></header><section className="docs-index">{DOCUMENTS.map(([slug, title, description]) => <Link key={slug} href={`/docs/${slug}`}><span>DOCUMENT</span><h2>{title}</h2><p>{description}</p><b>Open →</b></Link>)}<article><span>INHERITED DOCUMENTATION</span><h2>Developer Experience Report</h2><p>Prior BNB reports and artifacts are retained for provenance. They do not establish a Monad submission or completed sponsor requirements.</p></article></section></main>;
}
