import Link from "next/link";

const plans = [
  {
    name: "Member Starter",
    price: "$49",
    allowance: "3 document workflows",
    description: "A simple monthly allowance for occasional Trust, POA, or uploaded-document needs.",
    featured: false,
  },
  {
    name: "Member Plus",
    price: "$99",
    allowance: "10 document workflows",
    description: "More room for active households managing several important documents throughout the month.",
    featured: true,
  },
  {
    name: "Member Volume",
    price: "$199",
    allowance: "25 document workflows",
    description: "The same complete DARCi experience with a larger monthly document allowance.",
    featured: false,
  },
] as const;

const includedFeatures = [
  "Trust packages, POAs, and uploaded documents",
  "Guided signatures and invited signees",
  "Qualified notary selection and in-person session",
  "Sealed final package and public verification",
] as const;

export default function PricingSection() {
  return (
    <section className="bg-white px-6 py-24 text-Color-Scheme-1-Text md:px-10 md:py-32" id="pricing">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-Color-Neutral">
            DARCi membership
          </div>
          <h2 className="mt-5 text-4xl font-medium leading-[1.06] tracking-[-0.03em] md:text-6xl">
            One membership. Choose your document allowance.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-Color-Neutral md:text-lg">
            Every plan includes the same end-to-end document, signing, notarization, and verification experience.
            Only the number of new document workflows changes.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              className={`relative flex min-h-[390px] flex-col rounded-2xl border p-7 md:p-8 ${
                plan.featured
                  ? "border-Color-Scheme-1-Text bg-Color-Scheme-1-Text text-white"
                  : "border-Color-Scheme-1-Border/60 bg-white"
              }`}
              key={plan.name}
            >
              {plan.featured ? (
                <span className="absolute right-6 top-6 rounded-full bg-Green-Secondary px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-black">
                  Most popular
                </span>
              ) : null}
              <div className={`text-sm font-medium ${plan.featured ? "text-white/70" : "text-Color-Neutral"}`}>
                {plan.name}
              </div>
              <div className="mt-7 flex items-end gap-2">
                <span className="text-5xl font-medium tracking-[-0.04em]">{plan.price}</span>
                <span className={`pb-1 text-sm ${plan.featured ? "text-white/60" : "text-Color-Neutral"}`}>
                  / month
                </span>
              </div>
              <div className="mt-5 text-base font-medium">{plan.allowance}</div>
              <p className={`mt-3 text-sm leading-6 ${plan.featured ? "text-white/60" : "text-Color-Neutral"}`}>
                {plan.description}
              </p>
              <Link
                className={`mt-auto inline-flex min-h-12 items-center justify-center rounded-md px-5 text-sm font-medium transition ${
                  plan.featured
                    ? "bg-Green-Secondary text-black hover:bg-white"
                    : "bg-Color-Scheme-1-Text text-white hover:opacity-85"
                }`}
                href="/start?returnTo=%2Fapp%2Fbilling"
              >
                Choose {plan.name.replace("Member ", "")}
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-12 grid gap-4 border-t border-Color-Scheme-1-Border/50 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {includedFeatures.map((feature) => (
            <div className="flex gap-3 text-sm leading-6" key={feature}>
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-Green-Secondary text-xs text-black">
                ✓
              </span>
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-Color-Neutral">
          Monthly billing only. Unused workflows do not roll over. Notaries and invited signees do not pay DARCi.
          Private-beta Checkout uses Stripe test mode, so no real funds move.
        </p>
      </div>
    </section>
  );
}
