# DARCi Platform Add-Ons: Client Brief
### Jurisdiction Intelligence + Full Payment Logic Implementation

**Prepared for:** DARCi Client  
**Date:** May 5, 2026  
**Scope:** Additional development beyond original document-flow engagement

---

## Overview

This document covers two separate capability additions to the DARCi platform, each requiring work beyond the original project scope.

The first is the **51-Jurisdiction Intelligence Layer** — previously delivered and outlined below for reference.

The second is the **Full Payment Logic System** — the subject of this brief's new section. The original scope assumed one-time payments and a basic subscription. The actual payment logic shared by the client is significantly more complex. This document explains what that means in plain terms and why it represents a separate, billable engagement.

---

## Part 1 — Jurisdiction Intelligence Layer (Previously Quoted: $4,000)

### What This Is

The platform now understands that legal documents are not one-size-fits-all. It adapts Trust, POA, and related authority decisions by jurisdiction, so users get state-appropriate structure and options from the start, across all 51 U.S. jurisdictions (50 states plus DC).

This is not cosmetic. It is a legal-behavior foundation that reduces friction, improves client confidence, and enables national scale.

### What Was Delivered

1. Jurisdiction strategy and policy alignment — how state-by-state legal differences translate into consistent product behavior.
2. 51-jurisdiction rules structuring — organized requirements across all jurisdictions, scalable and consistent.
3. Trust and POA authority modeling — jurisdiction-aware authority scope and trustee power behavior.
4. Unified intake harmonization — one intake experience drives multiple document families with correct state outcomes.
5. Client delivery packaging and validation — final readiness framing for rollout.

### Commercial Breakdown

| Line Item | Description | Amount |
| :--- | :--- | ---: |
| Jurisdiction strategy and policy alignment | State-by-state legal translation into product behavior model | $1,000 |
| 51-jurisdiction rules structuring | Standardized requirements across all 51 jurisdictions | $1,100 |
| Trust and POA authority modeling | Jurisdiction-aware authority scope and trustee powers | $900 |
| Unified intake harmonization | Single intake driving multiple document families | $600 |
| Client delivery packaging and validation | Final packaging, validation, and stakeholder readiness | $400 |
| **Part 1 Total** | | **$4,000** |

---

## Part 2 — Full Payment Logic System (New Scope: $2,000)

### The Gap: What Was Originally Assumed

The original engagement assumed a straightforward commerce layer:

- A **one-time fee** when a user registers a trust or document.
- A **simple subscription** to keep documents active.

That model works for a single user type buying one product. What the client's payment logic actually requires is a multi-layer system serving three distinct user types, each with its own payment rules, role flags, and operational logic. None of what is described below was included in the original scope.

---

### What the Payment Logic Actually Requires

#### 1. Three Separate User Types, Three Separate Payment Flows

The platform must simultaneously support:

- **End Consumers** — individuals or families buying Trust registrations and POA subscriptions.
- **Pros** — attorneys and advisors who buy in bulk using a credit system rather than paying per transaction.
- **illuminotaries** — notaries with their own tiered membership subscription.

A single user can hold **more than one role at the same time** (e.g., someone who is both a Pro and an illuminotary). The system must recognize all active roles on a single account and make the right payment options available for each one independently.

This alone is a non-trivial architecture decision. The original scope assumed one user type, one flow.

---

#### 2. The Pro Credit System

This is the most complex addition. Instead of paying per transaction like a consumer, a verified Pro purchases **prepaid credits in bulk** via Stripe. Those credits are then drawn down one at a time when a Pro registers a Trust on behalf of a client.

**What this requires that a simple payment system does not:**

- A **Pro verification step** before any of this activates (method TBD — manual review, license input, or admin approval).
- A **credit balance stored on the Pro's account** that persists across sessions.
- **Four bundle tiers** with different prices and per-credit rates (Starter: 5 credits / $1,145 → Firm: 50 credits / $9,450), each with bulk savings built in.
- **Credit deduction logic**: every time a Pro initiates a Trust registration, the system checks the balance, deducts one credit, and proceeds — or prompts a new bundle purchase if the balance is zero.
- A **Pro-choice workflow**: at the moment of registration, the Pro can choose to use one of their own credits *or* send the payment request out to the client directly. This is a branching UX and logic path that does not exist today.
- **Credit expiration**: credits expire after 12 months and must be tracked accordingly.
- **A full credit transaction log** with timestamps, action types, and running balance — needed for reporting and Pro account visibility.
- **Dashboard credit balance visibility** so Pros can monitor how many credits they have at all times.

None of this exists in a basic payment setup.

---

#### 3. The Consumer Trust + POA Bundling Logic

The consumer flow is not just "charge $249 and start a subscription." The number of signers on a Trust determines how many Dynamic POAs are automatically included — and each of those POAs has its own subscription that must be activated.

**What this requires:**

- Logic that reads the signer count at registration time and determines how many POAs to create and attach.
- Subscription pricing that scales with signer count ($10/mo for 1 signer, $15/mo for 2, etc.).
- Both **monthly and annual billing options** across all subscriptions, with annual plans priced at a discount.
- A clear separation in the UI/UX between the document itself (free to create) and the subscription that keeps it active and editable — these must not be conflated.
- The subscription framing must position activation as keeping the document "live," not as a software fee.

---

#### 4. The Client Invite Flow After Pro Registration

When a Pro uses a credit to register a Trust on behalf of a client, the platform must **automatically trigger an invite to that client** so they can:

- Create their own account.
- Access their dashboard.
- Add trusted persons to their Trust.
- Sign up for their POA subscription independently.

This is a separate flow that connects the Pro's action to the consumer-side onboarding experience. It requires coordination between the payment event, the document creation event, and the invite/notification system.

---

#### 5. The illuminotary Membership Tier System

Verified illuminotaries pay a monthly tiered membership — not a per-document fee. There are three tiers:

| Tier | Price | Volume Cap |
| :--- | ---: | :--- |
| illuminotary Basic | $9.99/mo | 10 notarizations |
| illuminotary Plus | $19.99/mo | 25 notarizations |
| illuminotary Elite | $59.99/mo | Unlimited |

**What this requires:**

- A separate **illuminotary verification step** (commission number lookup via Secretary of State).
- An independent role flag on the account, separate from Pro status.
- Tier selection UI and billing management through Stripe.
- Volume tracking per billing period per tier.

---

#### 6. Stripe Metadata and Reporting Infrastructure

All Stripe transactions across all user types must include structured metadata: user ID, document type, and bundle tier. This is required for downstream reporting, reconciliation, and operational monitoring. It is not automatic and must be intentionally built into every charge event.

---

### Summary: What Needs to Be Built

| Capability | Original Scope | New Requirement |
| :--- | :---: | :---: |
| Consumer one-time Trust fee | ✅ Included | — |
| Consumer POA subscription | ✅ Included | — |
| Pro verification workflow | ❌ | Required |
| Pro credit system (purchase, store, deduct) | ❌ | Required |
| Pro bundle tiers (4 tiers, bulk pricing) | ❌ | Required |
| Credit expiration (12-month) | ❌ | Required |
| Credit transaction log | ❌ | Required |
| Pro dashboard credit balance view | ❌ | Required |
| Pro choice: use credit OR send to client | ❌ | Required |
| Client invite flow after Pro registration | ❌ | Required |
| Signer-count-based POA bundling | ❌ | Required |
| Annual billing option with discounts | ❌ | Required |
| Multi-role account support (Pro + illuminotary) | ❌ | Required |
| illuminotary verification workflow | ❌ | Required |
| illuminotary tiered subscription (3 tiers) | ❌ | Required |
| illuminotary volume tracking per billing period | ❌ | Required |
| Stripe metadata on all transactions | ❌ | Required |

---

### Commercial Breakdown — Part 2

| Line Item | Description | Amount |
| :--- | :--- | ---: |
| Pro credit system architecture | Credit purchase, storage, deduction logic, expiration, and transaction logging | $600 |
| Pro bundle tiers and verification flow | Four bundle tiers, Pro verification entry point, and dashboard balance view | $400 |
| Consumer signer-count bundling and annual billing | Signer-based POA attach logic and dual billing cycle support across all products | $300 |
| Pro-to-client invite flow | Post-registration client invite trigger and onboarding handoff logic | $250 |
| illuminotary tier system and verification | Three-tier membership, verification flow, volume tracking, independent role flag | $300 |
| Stripe metadata and reporting infrastructure | Structured metadata on all charge events across all user types | $150 |
| **Part 2 Total** | | **$2,000** |

---

## Combined Engagement Summary

| Scope | Amount |
| :--- | ---: |
| Part 1 — 51-Jurisdiction Intelligence Layer | $4,000 |
| Part 2 — Full Payment Logic System | $2,000 |
| **Total Additional Scope** | **$6,000** |

Both items represent capabilities that fall outside the original document-flow engagement. Each is a self-contained platform layer with long-term leverage: the jurisdiction system enables national scale; the payment logic system enables the full commercial model the client intends to operate.

---

*This document is intended for client review and commercial alignment. Scope items are subject to final confirmation of implementation approach.*
