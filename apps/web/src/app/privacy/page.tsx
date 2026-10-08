import type { Metadata } from "next";
import Link from "next/link";
import { privacyPolicyMetadata, privacyPolicyText } from "./policy";

export const metadata: Metadata = {
  title: "Privacy Policy | DARCi",
  description: "illuminote privacy policy for the DARCi service. Document PP15, effective November 30, 2023.",
  alternates: { canonical: "https://illuminotary.com/privacy" },
};

const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

function PolicyText({ text }: { text: string }) {
  return text.split(/(\[support@illuminote\.io\]\(mailto:support@illuminote\.io\))/).map((part, index) =>
    part.startsWith("[support@illuminote.io]") ? (
      <a key={index} href="mailto:support@illuminote.io" className={`break-all underline underline-offset-4 ${focusClass}`}>support@illuminote.io</a>
    ) : part,
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      <nav aria-label="Privacy page navigation" className="bg-black px-6 py-6 text-white md:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6">
          <Link href="/" aria-label="DARCi home" className={`font-display text-2xl font-normal ${focusClass}`}>DARCi</Link>
          <Link href="/" className={`inline-flex min-h-11 items-center text-sm underline underline-offset-4 ${focusClass}`}>Back to home</Link>
        </div>
      </nav>
      <main className="px-6 py-14 md:px-12 md:py-20">
        <article className="mx-auto w-full max-w-4xl">
          <header className="space-y-6 border-b border-Color-Scheme-1-Border pb-10">
            <div aria-hidden="true" className="h-1 w-16 bg-Green" />
            <h1 className="font-display text-4xl font-medium leading-tight md:text-5xl">Privacy Policy</h1>
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              {[
                ["Document Number", privacyPolicyMetadata.number],
                ["Document Name", privacyPolicyMetadata.name],
                ["Effective Date", privacyPolicyMetadata.effectiveDate],
                ["Document Status", privacyPolicyMetadata.status],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-Color-Neutral-Darkest/60">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </header>
          <div data-policy-content className="space-y-6 py-10 text-base leading-8 text-Color-Neutral-Darkest/85 [overflow-wrap:anywhere]">
            {privacyPolicyText.replace(/\n(?=\d+\. )/g, "\n\n").split(/\n\s*\n/).map((block, index) => {
              const lines = block.split("\n").filter(line => line.trim());
              const heading = /^\d+(?:\.\d+)?\.?\s/.test(lines[0]) && lines[0].length < 90;
              const content = heading ? lines.slice(1) : lines;
              const bullets = content.filter(line => line.startsWith("- "));
              return (
                <div key={index} className="space-y-3">
                  {heading && (lines[0].match(/^\d+\.\d+/) ? (
                    <h3 className="font-display text-xl font-medium leading-snug text-black"><PolicyText text={lines[0]} /></h3>
                  ) : (
                    <h2 className="pt-4 font-display text-2xl font-medium leading-snug text-black"><PolicyText text={lines[0]} /></h2>
                  ))}
                  {content.filter(line => !line.startsWith("- ")).map((line, lineIndex) => <p key={lineIndex}><PolicyText text={line} /></p>)}
                  {bullets.length > 0 && <ul className="list-disc space-y-3 pl-6">{bullets.map(line => <li key={line}><PolicyText text={line.slice(2)} /></li>)}</ul>}
                </div>
              );
            })}
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
