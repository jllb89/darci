import Link from "next/link";
import {
  getMemberBillingDenialCopy,
  type MemberBillingReasonCode,
} from "@/lib/billingPolicy";

type BillingPolicyNoticeProps = {
  reasonCode: MemberBillingReasonCode;
  className?: string;
};

export function BillingPolicyNotice({ reasonCode, className = "" }: BillingPolicyNoticeProps) {
  const copy = getMemberBillingDenialCopy(reasonCode);

  return (
    <section
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 ${className}`.trim()}
      data-billing-reason-code={reasonCode}
    >
      <div className="font-medium">{copy.title}</div>
      <p className="mt-1 max-w-2xl leading-6 text-amber-900/75">{copy.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-Color-Scheme-1-Text px-4 text-xs font-medium text-white"
          href="/app/billing"
        >
          {copy.actionLabel}
        </Link>
        {reasonCode === "billing_workflow_limit_reached" ? (
          <span className="text-xs text-amber-900/70">Or wait for the allowance to renew.</span>
        ) : null}
      </div>
    </section>
  );
}
