import type { Metadata } from "next";
import Link from "next/link";
import { termsMetadata, termsText } from "./terms";

export const metadata: Metadata = {
  title: "Terms and Conditions | DARCi",
  description: "Terms for DARCi accounts, document workflows, in-person notarization, membership and verification.",
  alternates: { canonical: "https://illuminotary.com/terms" },
};

const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

function ContactText({ text }: { text: string }) {
  return text.split(/(support@illuminote\.io|incidentreports@illuminote\.io)/).map((part, index) =>
    /^(support|incidentreports)@illuminote\.io$/.test(part)
      ? <a key={index} href={`mailto:${part}`} className={`underline underline-offset-4 ${focusClass}`}>{part}</a>
      : part,
  );
}

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.startsWith("**")
    ? <strong key={index} className="font-medium"><ContactText text={part.slice(2, -2)} /></strong>
    : <ContactText key={index} text={part} />,
  );
}

function TermsBlock({ block }: { block: string }) {
  if (block.startsWith("|")) {
    const rows = block.split("\n").filter(line => !/^\|[\s|:-]+\|$/.test(line))
      .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));
    return (
      <div className="max-w-full overflow-x-auto rounded-lg border border-black/15">
        <table aria-label="Membership prices and monthly document allowances" className="w-full min-w-120 text-left text-sm leading-6">
          <thead className="bg-black text-white"><tr>{rows[0].map(cell => <th key={cell} scope="col" className="p-4 font-medium">{cell}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map(row => <tr key={row[0]} className="border-t border-black/10">{row.map((cell, index) => index === 0
            ? <th key={index} scope="row" className="p-4 font-medium">{cell}</th>
            : <td key={index} className="p-4">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return <p><InlineText text={block.replaceAll("\n", " ")} /></p>;
}

export default function TermsPage() {
  const sections = termsText.split(/^### /m).filter(Boolean).map(section => {
    const [title, ...body] = section.split("\n");
    return { title, blocks: body.join("\n").trim().split(/\n\s*\n/) };
  });
  return (
    <div className="min-h-screen bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      <nav aria-label="Terms page navigation" className="bg-black px-6 py-6 text-white md:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6">
          <Link href="/" aria-label="DARCi home" className={`font-display text-2xl font-normal ${focusClass}`}>DARCi</Link>
          <Link href="/" className={`inline-flex min-h-11 items-center text-sm underline underline-offset-4 ${focusClass}`}>Back to home</Link>
        </div>
      </nav>
      <main className="px-6 py-14 md:px-12 md:py-20">
        <article className="mx-auto min-w-0 max-w-4xl">
          <header className="space-y-6 border-b border-black/15 pb-10">
            <div aria-hidden="true" className="h-1 w-16 bg-Green" />
            <h1 className="font-display text-4xl font-medium leading-tight md:text-5xl">Terms and Conditions</h1>
            <p className="text-sm">Effective {termsMetadata.effectiveDate} · Version {termsMetadata.version}</p>
            <Link href="/privacy" className={`inline-flex min-h-11 items-center underline underline-offset-4 ${focusClass}`}>Privacy Policy</Link>
          </header>
          <div data-terms-content className="space-y-12 py-10 text-base leading-8 text-Color-Neutral-Darkest/85 [overflow-wrap:anywhere]">
            {sections.map(section => <section key={section.title} className="min-w-0 space-y-5">
              <h2 className="font-display text-2xl font-medium leading-snug text-black">{section.title}</h2>
              {section.blocks.map((block, index) => <TermsBlock key={index} block={block} />)}
            </section>)}
          </div>
        </article>
      </main>
      <footer className="bg-black px-6 py-8 text-sm text-white md:px-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:justify-between">
          <a href="mailto:support@illuminote.io" className={`break-all underline underline-offset-4 ${focusClass}`}>support@illuminote.io</a>
          <a href="mailto:incidentreports@illuminote.io" className={`break-all underline underline-offset-4 ${focusClass}`}>Report an incident</a>
        </div>
      </footer>
    </div>
  );
}
