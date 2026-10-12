import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownDocument } from "@/components/markdown-document";
import readme from "../../../README.md?raw";
import architecture from "../../../docs/ARCHITECTURE.md?raw";
import contracts from "../../../docs/CONTRACTS.md?raw";
import technicalEvidence from "../../../docs/BINANCE_WEB3_RWA_TECHNICAL_EVIDENCE.md?raw";
import walletSkillEvidence from "../../../docs/BINANCE_WALLET_SKILL_EVIDENCE.md?raw";

import envio from "../../../docs/ENVIO_EVALUATION.md?raw";
import championship from "../../../docs/CHAMPIONSHIP_READINESS.md?raw";


const DOCUMENTS = {
  championship: { title: "Championship readiness", source: championship },
  envio: { title: "Envio evaluation", source: envio },
  readme: { title: "README", source: readme },
  architecture: { title: "Architecture", source: architecture },
  contracts: { title: "Contracts & provenance", source: contracts },
  "technical-evidence": { title: "Binance Web3 technical evidence", source: technicalEvidence },
  "wallet-skill-evidence": { title: "Binance Wallet Skill evidence", source: walletSkillEvidence },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((document) => ({ document }));
}

export default async function DocumentationPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const entry = DOCUMENTS[document as keyof typeof DOCUMENTS];
  if (!entry) notFound();
  return <main className="docs-shell"><nav><Link href="/">← Ghost Market</Link><Link href="/docs">All documents</Link></nav><header><span>GHOST MARKET · TECHNICAL DOCUMENTATION</span><h1>{entry.title}</h1><p>Rendered as accessible HTML from the versioned project documentation.</p></header><MarkdownDocument source={entry.source} /></main>;
}
