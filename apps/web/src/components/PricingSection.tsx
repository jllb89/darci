"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";

type BillingCadence = "monthly" | "yearly";
type MemberBillingKey = "activeTrust" | "dynamicPoa";
type MemberBilling = Record<MemberBillingKey, BillingCadence>;
type PricingAudience = "member" | "pro" | "illuminotary";
type CellValue = string;

type Plan = {
  title: string;
  price: string;
  note?: string;
  detail: string;
  cta: string;
  meta?: string;
};

type PricingRow = {
  label: string;
  values: CellValue[];
};

type PricingGroup = {
  title: string;
  rows: PricingRow[];
};

type PricingConfig = {
  eyebrow: string;
  title: string;
  subtitle: string;
  plans: Plan[];
  groups: PricingGroup[];
  notes: string[];
};

const audienceLabels: Record<PricingAudience, string> = {
  member: "Member",
  pro: "Pro",
  illuminotary: "illuminotary",
};

const initialMemberBilling: MemberBilling = {
  activeTrust: "monthly",
  dynamicPoa: "monthly",
};

const proPlans: Plan[] = [
  {
    title: "Starter Pro Pack",
    price: "$1,145",
    note: "5 credits",
    detail: "$229 per trust registration credit. Built for early client volume.",
    cta: "Buy credits",
    meta: "8% savings",
  },
  {
    title: "Growth Pack",
    price: "$2,200",
    note: "10 credits",
    detail: "$220 per trust registration credit for steady advisory workflows.",
    cta: "Buy credits",
    meta: "11.65% savings",
  },
  {
    title: "Practice Pack",
    price: "$5,125",
    note: "25 credits",
    detail: "$205 per trust registration credit for active trust practices.",
    cta: "Buy credits",
    meta: "17.67% savings",
  },
  {
    title: "Firm Pack",
    price: "$9,450",
    note: "50 credits",
    detail: "$180 per trust registration credit for high-volume teams.",
    cta: "Buy credits",
    meta: "27.71% savings",
  },
];

const illuminotaryPlans: Plan[] = [
  {
    title: "illuminotary Basic",
    price: "$9.99",
    note: "per month",
    detail: "Core notarization features for up to 10 monthly transactions.",
    cta: "Start Basic",
    meta: "10 volume cap",
  },
  {
    title: "illuminotary Plus",
    price: "$19.99",
    note: "per month",
    detail: "Higher monthly capacity with additional workflow features.",
    cta: "Start Plus",
    meta: "25 volume cap",
  },
  {
    title: "illuminotary Elite",
    price: "$59.99",
    note: "per month",
    detail: "Unlimited volume with the complete illuminotary feature set.",
    cta: "Start Elite",
    meta: "Unlimited",
  },
];

const memberPlans = (billing: MemberBilling): Plan[] => [
  {
    title: "Trust Registration",
    price: "$249",
    note: "one-time",
    detail: "Creates the trust record and includes Dynamic POA creation based on signer count.",
    cta: "Register trust",
    meta: "Stripe checkout",
  },
  {
    title: "Active Trust Plan",
    price: billing.activeTrust === "monthly" ? "$10" : "$99",
    note: billing.activeTrust === "monthly" ? "per month, 1 signer" : "per year, 1 signer",
    detail:
      billing.activeTrust === "monthly"
        ? "Two signers: $15/mo. Keeps included Dynamic POAs active and editable."
        : "Two signers: $159/yr. Keeps included Dynamic POAs active and editable.",
    cta: "Keep Trust active",
    meta: billing.activeTrust === "monthly" ? "Monthly billing" : "Annual discount",
  },
  {
    title: "Dynamic POA",
    price: billing.dynamicPoa === "monthly" ? "$5" : "$50",
    note: billing.dynamicPoa === "monthly" ? "per month" : "per year",
    detail: "Free to create as a standalone document; subscription keeps it active and editable.",
    cta: "Create your first POA",
    meta: billing.dynamicPoa === "monthly" ? "Standalone or included" : "Annual discount",
  },
];

const memberGroups = (billing: MemberBilling): PricingGroup[] => [
  {
    title: "Member Billing",
    rows: [
      { label: "One-time registration fee", values: ["$249", "Included in setup", "None"] },
      {
        label: "Active/editable subscription",
        values: [
          "Required after registration",
          billing.activeTrust === "monthly" ? "$10/mo" : "$99/yr",
          billing.dynamicPoa === "monthly" ? "$5/mo" : "$50/yr",
        ],
      },
      { label: "Annual discount option", values: ["", "check", "check"] },
      { label: "Stripe billing", values: ["check", "check", "check"] },
    ],
  },
  {
    title: "Included Documents",
    rows: [
      { label: "Trust record created", values: ["check", "check", ""] },
      { label: "Dynamic POA creation", values: ["1-2 included", "Included", "Free"] },
      { label: "Signer-based POA count", values: ["1 signer = 1 POA", "2 signers = 2 POAs", "Standalone"] },
      { label: "Payment confirmation", values: ["check", "check", "check"] },
    ],
  },
  {
    title: "Activation Logic",
    rows: [
      { label: "Create before subscription", values: ["", "", "check"] },
      { label: "Active status for dynamic edits", values: ["check", "check", "check"] },
      { label: "Monthly or annual launch support", values: ["", "check", "check"] },
    ],
  },
];

const proGroups: PricingGroup[] = [
  {
    title: "Credit Bundles",
    rows: [
      { label: "Credits", values: ["5", "10", "25", "50"] },
      { label: "Price per credit", values: ["$229", "$220", "$205", "$180"] },
      { label: "Savings vs $249 baseline", values: ["8%", "11.65%", "17.67%", "27.71%"] },
      { label: "Stripe purchase", values: ["check", "check", "check", "check"] },
    ],
  },
  {
    title: "Pro Workflow",
    rows: [
      { label: "Verified Pro required", values: ["check", "check", "check", "check"] },
      { label: "1 credit = 1 registration", values: ["check", "check", "check", "check"] },
      { label: "Use credit balance", values: ["check", "check", "check", "check"] },
      { label: "Send payment to client", values: ["check", "check", "check", "check"] },
    ],
  },
  {
    title: "Account Controls",
    rows: [
      { label: "Credit expiration", values: ["12 months", "12 months", "12 months", "12 months"] },
      { label: "Visible credit balance", values: ["check", "check", "check", "check"] },
      { label: "Credit transaction log", values: ["check", "check", "check", "check"] },
      { label: "Client account invite", values: ["check", "check", "check", "check"] },
    ],
  },
];

const illuminotaryGroups: PricingGroup[] = [
  {
    title: "Membership",
    rows: [
      { label: "Monthly price", values: ["$9.99", "$19.99", "$59.99"] },
      { label: "Monthly volume", values: ["10", "25", "Unlimited"] },
      { label: "Stripe subscription", values: ["check", "check", "check"] },
      { label: "Verified illuminotary required", values: ["check", "check", "check"] },
    ],
  },
  {
    title: "Notarial Access",
    rows: [
      { label: "Core notarization features", values: ["check", "check", "check"] },
      { label: "Additional workflow features", values: ["", "check", "check"] },
      { label: "No volume cap", values: ["", "", "check"] },
      { label: "Role can coexist with Pro", values: ["check", "check", "check"] },
    ],
  },
  {
    title: "Account Logic",
    rows: [
      { label: "Commission review required", values: ["check", "check", "check"] },
      { label: "Independent role flag", values: ["check", "check", "check"] },
      { label: "Single dashboard access", values: ["check", "check", "check"] },
    ],
  },
];

const getPricingConfig = (
  audience: PricingAudience,
  memberBilling: MemberBilling,
): PricingConfig => {
  if (audience === "pro") {
    return {
      eyebrow: "Pro Credits",
      title: "Prepaid registration credits for verified Pros",
      subtitle: "Buy credits in advance, draw them down per trust registration, or send payment to the client.",
      plans: proPlans,
      groups: proGroups,
      notes: [
        "Pay-as-you-go baseline remains $249 per registration.",
        "Credits are deducted when registration is initiated and expire after 12 months.",
        "Credit balance and transaction history stay visible in the Pro dashboard.",
      ],
    };
  }

  if (audience === "illuminotary") {
    return {
      eyebrow: "illuminotary Membership",
      title: "Monthly membership for verified illuminotaries",
      subtitle: "Choose the monthly volume tier that matches your notarization workflow.",
      plans: illuminotaryPlans,
      groups: illuminotaryGroups,
      notes: [
        "illuminotary verification is independent from Pro verification.",
        "Users can hold both Pro and illuminotary roles on one account.",
        "Membership billing runs through Stripe subscriptions.",
      ],
    };
  }

  return {
    eyebrow: "Products & Plans",
    title: "Register a trust or keep a Dynamic POA active",
    subtitle: "Trust registration is a one-time fee; active documents use monthly or annual billing.",
    plans: memberPlans(memberBilling),
    groups: memberGroups(memberBilling),
    notes: [
      "Dynamic POA creation is free; subscription keeps the document active and editable.",
      "A trust registration includes one Dynamic POA for one signer or two for two signers.",
      "All one-time fees and subscriptions are processed through Stripe.",
    ],
  };
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const staggered = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const renderCellValue = (value: CellValue) => {
  if (value === "check") {
    return <img src="/icons/pricing/check.svg" alt="" className="h-5 w-5" />;
  }

  if (!value) {
    return <span className="h-5 w-5" aria-hidden="true" />;
  }

  return (
    <div className="text-center font-sans text-sm font-medium leading-6 text-Color-Scheme-1-Text md:text-base">
      {value}
    </div>
  );
};

export default function PricingSection() {
  const [audience, setAudience] = useState<PricingAudience>("member");
  const [memberBilling, setMemberBilling] = useState<MemberBilling>(initialMemberBilling);
  const config = useMemo(
    () => getPricingConfig(audience, memberBilling),
    [audience, memberBilling],
  );
  const columnCount = config.plans.length;
  const tableMinWidth = `${Math.max(760, 260 + columnCount * 220)}px`;
  const comparisonGrid = {
    gridTemplateColumns: `minmax(220px, 1.25fr) repeat(${columnCount}, minmax(180px, 1fr))`,
  };

  const updateMemberBilling = (cadence: BillingCadence) => {
    setMemberBilling({
      activeTrust: cadence,
      dynamicPoa: cadence,
    });
  };

  const renderMemberBillingToggle = () => {
    return (
      <div
        className="inline-flex bg-Color-Scheme-1-Foreground p-1 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40"
        aria-label="Member billing cadence"
      >
        {(["monthly", "yearly"] as BillingCadence[]).map((cadence) => (
          <button
            key={cadence}
            type="button"
            onClick={() => updateMemberBilling(cadence)}
            className={`flex min-h-9 items-center px-4 py-1.5 transition-colors ${
              memberBilling.activeTrust === cadence
                ? "bg-Green outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40"
                : "bg-Color-Scheme-1-Foreground"
            }`}
          >
            <span className="font-sans text-xs font-medium leading-5 text-Color-Scheme-1-Text">
              {cadence === "yearly" ? "Annual" : "Monthly"}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <section className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-12">
        <motion.div
          className="w-full max-w-[820px] space-y-6 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeIn}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="font-sans text-base font-regular leading-6 text-Color-Scheme-1-Text">
            {config.eyebrow}
          </div>
          <div className="font-display text-4xl font-medium leading-tight text-Color-Scheme-1-Text md:text-5xl md:leading-[62.4px]">
            {config.title}
          </div>
          <div className="font-sans text-base font-regular leading-6 text-Color-Scheme-1-Text">
            {config.subtitle}
          </div>
        </motion.div>

        <motion.div
          className="flex flex-wrap justify-center bg-Color-Scheme-1-Foreground p-1 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeIn}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        >
          {(Object.keys(audienceLabels) as PricingAudience[]).map((audienceKey) => (
            <button
              key={audienceKey}
              type="button"
              onClick={() => setAudience(audienceKey)}
              className={`flex min-h-10 items-center gap-2 px-5 py-2 transition-colors ${
                audience === audienceKey
                  ? "bg-Green outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40"
                  : "bg-Color-Scheme-1-Foreground"
              }`}
            >
              <span className="font-sans text-sm font-medium leading-6 text-Color-Scheme-1-Text">
                {audienceLabels[audienceKey]}
              </span>
            </button>
          ))}
        </motion.div>

        <motion.div
          key={`${audience}-${memberBilling.activeTrust}-${memberBilling.dynamicPoa}-plans`}
          className="w-full overflow-x-auto"
          initial="hidden"
          animate="visible"
          variants={staggered}
        >
          <div
            className="grid border-b border-Color-Scheme-1-Border/40"
            style={{
              minWidth: tableMinWidth,
              ...comparisonGrid,
            }}
          >
            <motion.div
              className="border-r border-Color-Scheme-1-Border/40 px-6 py-8"
              variants={fadeIn}
              transition={{ duration: 0.38, ease: "easeOut" }}
            >
              <div className="space-y-2">
                <div className="font-display text-xl font-medium leading-8 tracking-tight text-Color-Scheme-1-Text">
                  Pricing
                </div>
                {audience === "member" ? (
                  renderMemberBillingToggle()
                ) : (
                  <div className="font-sans text-sm font-regular leading-6 text-Color-Scheme-1-Text">
                    {config.eyebrow}
                  </div>
                )}
              </div>
            </motion.div>

            {config.plans.map((plan, index) => (
              <motion.div
                key={plan.title}
                className={`px-6 py-8 ${
                  index < config.plans.length - 1
                    ? "border-r border-Color-Scheme-1-Border/40"
                    : ""
                }`}
                variants={fadeIn}
                transition={{ duration: 0.38, ease: "easeOut" }}
              >
                <div className="flex h-full flex-col justify-between gap-8">
                  <div className="space-y-4">
                    <div className="flex min-h-7 flex-wrap items-center gap-2">
                      {plan.meta ? (
                        <div className="inline-flex bg-Green px-3 py-1 font-sans text-xs font-medium leading-5 text-Color-Scheme-1-Text">
                          {plan.meta}
                        </div>
                      ) : null}
                    </div>
                    <div className="font-display text-xl font-regular leading-8 tracking-tight text-Color-Scheme-1-Text">
                      {plan.title}
                    </div>
                    <div>
                      <div className="font-display text-5xl font-medium leading-tight text-Color-Scheme-1-Text md:text-6xl">
                        {plan.price}
                      </div>
                      {plan.note ? (
                        <div className="font-sans text-base font-regular leading-6 text-Color-Scheme-1-Text">
                          {plan.note}
                        </div>
                      ) : null}
                    </div>
                    <div className="font-sans text-sm font-regular leading-6 text-Color-Scheme-1-Text">
                      {plan.detail}
                    </div>
                  </div>
                  <div className="flex h-11 items-center justify-center gap-2 bg-Color-Neutral-Darkest px-6 outline outline-1 outline-Color-Neutral-Darkest">
                    <div className="font-sans text-sm font-medium leading-6 text-Color-White">
                      {plan.cta}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          key={`${audience}-${memberBilling.activeTrust}-${memberBilling.dynamicPoa}-table`}
          className="w-full space-y-8"
          initial="hidden"
          animate="visible"
          variants={staggered}
        >
          {config.groups.map((group) => (
            <motion.div key={group.title} className="space-y-0" variants={fadeIn}>
              <div className="border-b border-Color-Scheme-1-Border/40 py-5">
                <div className="font-display text-xl font-medium leading-8 tracking-tight text-Color-Scheme-1-Text">
                  {group.title}
                </div>
              </div>
              <div className="overflow-x-auto border-b border-Color-Scheme-1-Border/40">
                <div className="space-y-0" style={{ minWidth: tableMinWidth }}>
                  {group.rows.map((row) => (
                    <div
                      key={row.label}
                      className="grid border-b border-Color-Scheme-1-Border/40 last:border-b-0"
                      style={comparisonGrid}
                    >
                      <div className="border-r border-Color-Scheme-1-Border/40 px-6 py-4">
                        <div className="font-sans text-sm font-medium leading-6 text-Color-Scheme-1-Text">
                          {row.label}
                        </div>
                      </div>
                      {row.values.map((value, index) => (
                        <div
                          key={`${row.label}-${index}`}
                          className={`flex min-h-14 items-center justify-center border-Color-Scheme-1-Border/40 px-6 py-4 ${
                            index < row.values.length - 1 ? "border-r" : ""
                          }`}
                        >
                          {renderCellValue(value)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          key={`${audience}-${memberBilling.activeTrust}-${memberBilling.dynamicPoa}-notes`}
          className="w-full border-y border-Color-Scheme-1-Border/40 py-6"
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {config.notes.map((note) => (
              <div key={note} className="font-sans text-sm font-regular leading-6 text-Color-Scheme-1-Text">
                {note}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}