**DARCi — Payment Logic Spec**

*Internal Dev Handoff Document  |  Draft*

# **1\. Overview**

DARCi supports three user types, each with distinct payment flows: end consumers (individuals/families), Pros (attorneys, advisors), and illuminotaries (notaries). A user may hold more than one role — for example, a Pro who is also an illuminotary will have both roles unlocked on a single account. This document outlines the payment logic for each user type.

# **2\. Payment Methods**

* Stripe — used for all one-time transactions

* Pro Credit System — prepaid credits purchased in bulk by verified Pro users

* illuminotary Payment — per-signature/per-doc charge OR tiered subscription 

# **3\. End Consumer Payment Flow**

## **3a. Trust Registration**

Triggered when a consumer registers a trust on the platform. Trust registration includes a one-time fee plus an ongoing subscription to keep the registration active. The number of signers determines how many DARCi Dynamic POAs are automatically included at no additional charge.

* One-time registration fee: $249 — processed via Stripe

* Annual plan offered at a slight discount 

* Subscription fee — processed via Stripe:

* 1 signer: includes 1 DARCi Dynamic POA Monthly ($10/mo) or Annual ($99/yr)

* 2 signers: includes 2 DARCi Dynamic POAs Monthly ($15/mo) or Annual ($159/yr

* On success: trust record created, POA(s) generated, confirmation sent

*⚠️  Note: Each included POA is free to create but requires a subscription to activate dynamic/editable features — see section 3b.*

## **3b. DARCi Dynamic POA**

The Dynamic POA is available as a standalone product or included with a trust registration (see 3a). In either case, the document itself is free — a subscription is required to keep it active and editable.

* Document creation fee: None (no charge to create)

* Payment method: Stripe (recurring subscription)

* Billing options: Monthly ($5/mo) or Annual ($50/yr)

* Annual plan offered at a slight discount 

*⚠️  Note: The subscription should be framed in UI/UX as keeping the document 'active' — not as a software or tech fee.*

# **4\. Pro Payment Flow**

## **4a. Pro Verification**

A user must be designated as a verified Pro before accessing Pro-specific pricing or features. Pro and illuminotary are independent roles — a user can hold both simultaneously on one account.

* Verification method: TBD (manual review, license number input, admin approval, etc.)

* Pro status stored on user account record

## **4b. Credit System**

Pros purchase credits in advance via Stripe. Credits are then used in place of per-transaction Stripe charges.

* 1 credit \= 1 Trust registration

* Credits are purchased via Stripe at the time of bundle selection

* Credits are stored on the Pro's account and drawn down per transaction

* Credits \\ expire after 12 months

## **4c. Pro Credit Bundle Tiers**

The following bundles are available to verified Pros. All purchases processed via Stripe.

| Bundle | Credits | Price | Per Credit | Savings |
| ----- | ----- | ----- | ----- | ----- |
| Starter Pro Pack | 5 credits | $1,145 | $229 | 8% |
| Growth Pack | 10 credits | $2,200 | $220 | 11.65% |
| Practice Pack | 25 credits | $5,125 | $205 | 17.67% |
| Firm Pack | 50 credits | $9,450 | $180 | 27.71% |

Pay-as-you-go baseline (non-Pro, via Stripe): $249 per registration.

## **4d. Credit Deduction Logic**

* When a Pro initiates a Trust/POA registration, system checks available credit balance

* Credit balance is deducted from Pro account at the time Trust registration is initiated

  0. \* Pro has the option to use their credit balance OR send it out to the client for payment

* If balance \>= 1: deduct 1 credit, proceed with registration

* If balance \= 0: prompt Pro to purchase a new bundle via Stripe before proceeding

* Credit transactions should be logged with timestamp, action type, and remaining balance

* At the time Pro initiates registration, invite needs to go out to client to sign-up and create an account so they have access to dashboard and can add trusted persons and sign-up for the subscription

# **5\. illuminotary Payment Flow**

## **5a. illuminotary Verification**

A user must be designated as a verified illuminotary before accessing illuminotary-specific features and pricing. A user can hold both a Pro role and an illuminotary role on the same account — each role is stored as an independent flag.

* Verification method: manual review of commission number lookup through Secretary of State

* illuminotary role stored as a separate flag on the user account record (independent of Pro status)

* If a user holds both roles: both payment flows are accessible from a single account dashboard

## **5b. illuminotary Pricing Model**

Once pricing model to be charged to the illuminotary. 

**Tiered Subscription Model \- Membership**

* Three tiers available to verified illuminotaries, billed monthly via Stripe

| Tier | Price | Volume | Features |
| ----- | ----- | ----- | ----- |
| illuminotary Basic | $9.99/mo | Limited — 10 | Core notarization features |
| illuminotary Plus | $19.99/mo | Higher limit — 25 | Core \+ additional features  |
| illuminotary Elite | $59.99/mo | Unlimited | All features, no volume cap |

# **6\. Additional Notes**

* All Stripe transactions should include relevant metadata (user ID, document type, bundle tier) for reporting

* The platform should support both monthly and annual subscription billing cycles from launch

* Credit balance should be visible to the Pro user at all times in their dashboard