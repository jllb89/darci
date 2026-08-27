# DARCi Member Membership Pricing Rationale

- Decision date: 2026-08-26
- Initial currency: USD
- Billing interval: monthly
- Intended launch: Stripe test mode during private beta, followed by live pricing only after the paid-launch gates are approved

## Recommendation

DARCi should launch one member membership with three volume tiers. Every tier includes the same product capabilities; only the number of document workflows available during each monthly billing period changes.

| Plan | Included document workflows per month | Monthly price | Maximum effective price per workflow |
| --- | ---: | ---: | ---: |
| Member Starter | 3 | **$49** | $16.33 |
| Member Plus | 10 | **$99** | $9.90 |
| Member Volume | 25 | **$199** | $7.96 |

One workflow means one Trust package, one regular Power of Attorney workflow, or one uploaded-document notarization workflow. A Trust package counts once regardless of how many PDFs DARCi generates inside that package. Retries, invited signatures, notarial steps, finalization, and downloads do not consume additional units.

Notary fees are not included in the membership price. Notaries do not pay DARCi under the current model, and any fee for the in-person notarial service is handled separately from the DARCi membership.

## Why these prices

DARCi combines more value than a conventional electronic-signature tool. It supports jurisdiction-aware document generation, multi-party execution, notary selection, an in-person completion workflow, a notarial acknowledgment, finalization, hashing, ledger evidence, and public verification. It should therefore not be positioned as inexpensive envelope-only software.

At the same time, DARCi is not currently charging a separate one-time Trust creation or registration fee. That makes the entry subscription price important: a member can subscribe for one month, create a Trust package, and later cancel. Pricing the entry tier too low would substantially undervalue the highest-value workflow in the membership.

The recommended $49 entry point balances those concerns:

- It remains accessible for an individual member testing or completing a small number of workflows.
- It places DARCi above basic e-signature subscriptions while remaining well below common consumer living-trust package prices.
- It creates a clear upgrade path without introducing different features, credits, overages, or product-specific fees.
- It leaves room to learn from real conversion and usage data before adding complexity.

The Plus and Volume plans provide progressively lower effective prices per workflow. This rewards legitimate higher usage while keeping the product model easy to explain: the customer is buying more monthly capacity, not a different version of DARCi.

## Market context

The prices are informed by two adjacent markets, not copied directly from either one:

1. Electronic-signature software is generally priced as a lower-cost monthly tool. DocuSign advertises a Personal plan around $11 per month with five envelopes, while PandaDoc advertises a monthly Starter plan around $35. These products provide useful workflow comparisons but do not represent DARCi's entire document-generation and notarization value.
2. Consumer estate-document providers price complete living-trust products substantially higher. LegalZoom lists individual and couples Trust offerings beginning in the hundreds of dollars, and Trust & Will lists individual and couples Trust plans at approximately $499 and $599 respectively.

DARCi sits between these categories. The recommended pricing is an intentional product-positioning judgment based on DARCi's combined workflow rather than a claim that the services are identical.

Reference pages reviewed on 2026-08-26:

- [DocuSign eSignature plans](https://ecom.docusign.com/plans-and-pricing/esignature)
- [PandaDoc pricing](https://www.pandadoc.com/pricing/)
- [LegalZoom estate-plan comparison](https://www.legalzoom.com/personal/estate-planning/compare.html)
- [Trust & Will plan comparison](https://trustandwill.com/compare)

Competitor prices and packaging can change. DARCi should confirm this market context before reusing it in future sales material.

## Launch rules that protect the simple model

- Monthly billing only.
- No free trial initially.
- No promotion codes initially.
- No annual discount initially.
- No unused-workflow rollover.
- No automatic overage charges.
- When capacity is exhausted, the member upgrades or waits for the next billing period.
- An upgrade may increase the current-period limit, but it does not reset usage already consumed.
- A downgrade takes effect at the next billing-period boundary.
- A successfully submitted workflow continues even if the subscription later lapses, so signers and the notary are not interrupted.
- A newly completed final package may be held from member and public release until reactivation, subject to final customer terms and CA/OH legal approval.

## Private-beta treatment

The private beta uses the same $49, $99, and $199 catalog amounts in Stripe test mode. Members use Stripe test payment methods and no real funds move. Using realistic amounts is important because it exercises the same Checkout, invoice, payment-failure, subscription-change, cancellation, and recovery paths intended for launch.

DARCi should not represent the beta with a zero-dollar product or permanent 100% coupon because that would skip important payment lifecycle behavior.

## When to reconsider the amounts

Review pricing after approximately 20–30 paying subscribers or after enough usage exists to identify a reliable pattern. The most important questions are:

- Are members primarily subscribing for Trust packages or uploaded-document notarization?
- How many workflows does a typical member actually submit?
- What percentage cancels after one month?
- Which tier produces the best combination of conversion, support load, and retained revenue?
- Are higher-volume accounts individual members or organizations that need a separately scoped business offering?

Until those answers exist, changing features by tier or adding product-specific fees would create complexity without evidence. The initial recommendation is therefore **$49 / $99 / $199 per month**, with identical features and volume as the only differentiator.
