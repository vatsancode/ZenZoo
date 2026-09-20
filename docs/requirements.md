# The Counter Hypothesis

**Market research & requirements**

As easy as paper. With the memory of a system.

A hybrid retail and F&B commerce platform for the operator who is alone behind the counter during the rush — built so the software is *the expert*, not the person operating it.

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 29 Aug 2026 |
| **Scope** | Multi-tenant · multi-store · AI-native |

---

## Contents

1. [Thesis](#01-thesis)
2. [Market findings](#02-what-the-market-research-says)
3. [The gap](#03-the-gap-mapped)
4. [The operator](#04-the-operator-we-are-building-for)
5. [Design principles](#05-design-principles)
6. [Unified domain model](#06-the-unified-domain-model)
7. [The selling surface](#07-the-selling-surface)
8. [Input & confidence](#08-input-modalities-and-the-confidence-ladder)
9. [Inventory](#09-inventory-without-data-entry)
10. [Knowledge system](#10-the-two-layer-knowledge-system)
11. [The consultant](#11-the-consultant)
12. [Money](#12-money--payments-and-credit)
13. [Non-functional](#13-non-functional-requirements)
14. [Device platform](#14-the-device-and-peripheral-platform)
15. [Unit economics](#15-unit-economics-as-a-design-constraint)
16. [Hard constraints](#16-hard-constraints-and-risks)
17. [Open decisions](#17-open-decisions)
18. [Phasing](#18-suggested-phasing)

---

## 01 · Thesis

Every POS on the market assumes a trained operator. That single assumption is the entire market gap — and it is the one assumption that AI has recently made obsolete.

The incumbent bargain is: pay for software, then pay again in training, configuration, and data entry to make it useful. That bargain works for a chain with a manager and a rota. It fails completely for a solo operator in a busy shop, who has no slack in their day to become a systems administrator.

The evidence is unambiguous. **56% of SMBs** cite lack of internal technical expertise as their leading adoption barrier *(AI Business)*, **33% of staff** receive under an hour of training at rollout, and **63% stop using** software they find irrelevant *(CloudShare)*. In one field pilot with microentrepreneurs, only **half** were still using the tool by the end of the study *(CEGA Berkeley)*. Software does not fail these businesses at the feature list. It fails at the second week.

Three things changed recently that make a different bargain possible. Inference for GPT-4-class capability fell from roughly **$20 to $0.40 per million tokens** between late 2022 and early 2026 *(AI Magicx)* — so intelligence can now be spent freely on a ₹500/month customer. Local-first sync matured, so a store can run entirely offline without a server in the back room. And multimodal models became good enough to *build the catalogue for you* from a photograph of a menu or a shelf.

The product this permits is not a POS with a chatbot bolted on. It is a system where the operator states intent in the way they already think — and the software handles the structure, the compliance, the arithmetic, and the memory. Over time, having watched every transaction in that specific shop, it becomes the thing no small merchant has ever been able to afford: a business advisor who knows their trade *and* knows their books.

---

## 02 · What the market research says

The category is large, growing steadily, and dominated by exactly the segment we are targeting — which means the demand is proven and the incumbents are already fighting for it. Differentiation has to come from the operating model, not from discovering an unserved niche.

| Figure | What it means | Source |
|---|---|---|
| **$16–32B** | POS software market, 2026 — estimates vary widely by methodology | Business Research Co. / Grand View |
| **60.6%** | Share of the POS software market held by SMBs | Market.us, 2025 |
| **10.8%** | Category CAGR — steady, not explosive | Business Research Co. |
| **81%** | Of quick-service restaurants globally already run a POS | Industry survey via Quantic |

> **Read these numbers with suspicion.** Much of the accessible market sizing is vendor and SEO content, and the spread between reputable estimates is more than 2×. Treat every figure here as directional. Before any funding conversation, at least the SMB merchant counts and ARPU assumptions need primary sourcing.

### The competitive landscape

The field splits cleanly into four groups, and none of them is aimed at our operator.

| Player | Segment | Software cost | Processing | Why it fails our operator |
|---|---|---|---|---|
| Toast | F&B only | $69–165 / terminal / mo | 2.99% + 15¢ | Restaurant-locked, priced for staffed venues; ~$15.4k/yr all-in |
| Square | Retail + F&B | Free; $60/mo verticals | 2.4–2.6% + 15¢ | Broad but shallow; still assumes you configure and maintain it |
| Clover | Retail + F&B | $14.95–84.95 / mo | 2.3% + 10¢ | Hardware-bundled lock-in; processor-dependent pricing |
| Lightspeed | Retail + F&B | Tiered | 1.5% flat | Mid-market complexity; heavy setup |
| NCR Voyix | Unified enterprise | Enterprise | — | Genuinely unified retail+F&B, but an enterprise implementation |
| Loyverse | Micro-merchant | Free core | Via partners | Closest on simplicity; no intelligence, degraded offline mode |
| Petpooja | India, retail+F&B | ₹8,500 + GST / yr | Via partners | Compliance-first, dated workflow, no AI layer |
| GoFrugal | India retail | ₹8,999 / yr | Via partners | ERP heritage; heavy for a single counter |
| Vyapar / myBillBook | India micro | ₹399–6,900 / yr | — | Billing only; no operational depth, no advice |
| Tote.ai | Fuel & c-store | Enterprise | — | **The real precedent** — see below |

*Pricing is as published by vendors or aggregators and excludes hardware, onboarding, and add-ons. Indian and Western pricing are not directly comparable — they reflect different willingness-to-pay, not different value delivered.*

### Tote.ai is the proof, and the warning

Tote.ai markets itself as the first AI-native POS, and it is being adopted at real scale — Huck's is rolling it to **135 stores**, Weigel's to **90**, plus Loop Neighborhood Markets *(C-Store Dive)*. Their pitch is almost exactly ours: an on-screen AI assistant at the register that reduces training time and guides the worker in real time.

Two details matter enormously. First, they installed onto the retailer's *existing terminals* — validating that the value is in software and intelligence, not new hardware. Second, and more importantly for us: they are locked to fuel and convenience, and they sell to chains with 90+ stores. They solve the training problem for an *employer of clerks*. Nobody is solving it for the person who *is* the entire staff.

On the advisory side, Shopify's Sidekick is the closest working example of what we mean by "business consultant" — merchants ask it "why were sales lower this week?" and it answers against their own data, reportedly cutting repetitive admin time by up to 40% *(Shopify / Presta)*. But Sidekick serves e-commerce merchants who are already digitally fluent, sitting at a desk. It has never had to work for someone with a queue in front of them.

---

## 03 · The gap, mapped

Two axes decide this market. Horizontally: how much operator skill the system presumes. Vertically: whether the system merely records what happened or actually tells you what to do about it. Every incumbent sits in the lower and left regions. The upper right is empty.

*(Positioning map: x-axis "needs a trained operator" → "works for an untrained solo operator"; y-axis "records transactions" → "advises the business". NCR Voyix, Lightspeed, Toast, Clover, Square, Petpooja/GoFrugal, Vyapar/myBillBook, and Loyverse all cluster in the lower-left/lower-middle. Tote.ai sits mid-high on advice, mid on operator independence. Shopify Sidekick sits high on advice, low on operator independence. The upper-right quadrant — high on both axes — is unoccupied. That's the target.)*

> **The defensible position.** Tote proved the register-side AI assistant works and enterprises will buy it. Sidekick proved merchants will ask an AI about their own business. Nobody has combined the two and pointed them at a single untrained person running a busy shop — across both retail and food — at a price that person can pay.

---

## 04 · The operator we are building for

One person. High transaction volume. No slack. No systems vocabulary. Currently running on paper, memory, and a phone.

This person is not "non-technical" in the way a corporate user is non-technical. They run a genuinely complex operation — pricing, credit, spoilage, supplier relationships, seasonal demand — entirely in their head, and they are good at it. What they lack is not intelligence. It is *spare attention*, and any vocabulary for describing what they already do in the terms a database wants.

### What the research says about failure

The adoption literature is consistent across geographies, and it points at onboarding and week-two abandonment rather than features.

- **Every added onboarding step raises abandonment.** Friction during activation converts directly into churn *(Payroc)*.
- **Training does not happen.** A third of staff get under an hour *(CloudShare)*. For a solo operator, it is zero — there is nobody to train them and no shift to do it in.
- **Change management fails at up to two-thirds of SMEs** *(Growth Shuttle)*.
- **Complexity of integration is the third-largest barrier**, behind talent and budget *(AI Business)*.

### And what already worked

Khatabook reached **10 million merchants in three years** by digitising exactly one paper artefact — the credit ledger — with a simple multilingual interface and offline sync *(ORF / Finn&Marks)*. It did not try to be an ERP. That is the adoption pattern to copy: enter through one thing they already do on paper, and earn the right to more.

> **The design consequence.** There is no training budget, no IT support, and no configuration phase. If the system is not useful within about ninety seconds of first opening it, and useful *during a rush* rather than after closing, it will be abandoned. Onboarding is not a phase of the product. It is the product's hardest feature.

#### Literacy and language

HCI research on low-literacy users in India and comparable markets converges on colour-coded graphical interfaces with voice annotation in the local language, skeuomorphic metaphors drawn from real objects rather than software abstractions, and shallow navigation *(ACM CSCW 2021)*. One finding deserves emphasis because it cuts against the obvious plan: **voice alone is not sufficient**, and lack of *digital* literacy is harder to overcome than lack of textual literacy. A talking interface does not rescue a confusing mental model.

---

## 05 · Design principles

Seven rules, each traceable to something in the research above. These are meant to settle arguments later, so they are written to be falsifiable.

| | |
|---|---|
| **One** | **Never block a sale.** No missing field, failed sync, absent network, unconfigured tax rule, or unrecognised item may prevent money changing hands. Everything unknown is captured and resolved later. |
| **Two** | **Structure is the system's job.** The operator states intent in their own words. Categorisation, tax treatment, units, and ledger entries are inferred — never demanded up front. |
| **Three** | **Earn data, don't demand it.** Every field the system asks for at setup is a reason to quit. The catalogue is built from photographs, invoices, and observed sales — not from a data-entry session. |
| **Four** | **Confidence is visible and graded.** AI output is never silently authoritative. High confidence acts; medium confirms in one tap; low asks plainly. See §08. |
| **Five** | **Advice arrives where the decision is made.** Insight surfaced in a dashboard nobody opens is worthless. It appears at the moment of ordering, pricing, or closing. |
| **Six** | **The record is immutable; the interpretation is not.** An append-only event log is the source of truth. Corrections are new events. This makes offline sync tractable and gives the advisor a real history. |
| **Seven** | **Degrade, never fail.** No network, no printer, no scanner, dead phone — each has a defined fallback that still completes the sale and preserves the record. |

---

## 06 · The unified domain model

Retail and F&B are usually separate products because their data models look different. They are not actually different — they are the same model at different settings.

Retail needs variants, batches, expiry, weight-based pricing, and barcodes. F&B needs modifiers, recipes that deplete ingredients, courses, tables, and kitchen routing. A hybrid business — the bakery with a café, the grocer with a hot counter, the sweet shop — needs both simultaneously, on the same bill. Forcing them into a retail model loses the kitchen; forcing them into a restaurant model loses batch and expiry tracking.

### The resolution

Model one **sellable** entity with optional capability facets, rather than two product types. A facet is present or absent; nothing is nulled out or shoehorned.

**F-01 — Sellable with composable facets** `P0`
Facets: *Stocked* (units, batches, expiry) · *Weighed* (scale integration, price per unit mass) · *Made* (recipe/BOM depleting component stock) · *Configured* (modifier groups with price deltas) · *Routed* (fires to a kitchen or prep station) · *Timed* (prep duration, course sequencing). A packet of biscuits carries Stocked. A sandwich carries Made + Configured + Routed. Loose rice carries Stocked + Weighed. All three sit on one bill.

**F-02 — Order lifecycle as a state machine, not a mode** `P0`
A retail sale is the degenerate case of a restaurant order: open → committed → fulfilled → settled, where retail collapses the middle states. One code path, no "retail mode" versus "restaurant mode" toggle. This is what makes the hybrid business work rather than a compromise.

**F-03 — Vertical packs configure, they don't fork** `P1`
A vertical pack (bakery, pharmacy, café, hardware, salon) is data: default facets, catalogue seeds, tax defaults, KPI definitions, and advisory rules. Adding a vertical must never require a code branch. This is the scalability mechanism for the domain-knowledge layer in §10.

**F-04 — Append-only event ledger per tenant** `P0`
Every business fact is an immutable event. Current state is a projection. Required for offline sync correctness (§13), audit and tax retention (§13), and for giving the advisor a genuine time series rather than a mutable snapshot.

### Where hybrids currently break

Worth naming the trap explicitly: inventory accuracy. Spreadsheet-driven operations run at **63–83% inventory accuracy** *(Netstock)*, and the dominant failure mode is not a single catastrophe but the slow accumulation of small unrecorded movements. In a hybrid business this is worse, because a bag of flour is simultaneously retail stock and a recipe input. The Made facet must deplete the same ledger the Stocked facet sells from, or the two views diverge within a week.

---

## 07 · The selling surface

This screen is the product. Everything else is justified by it. The operator is standing, possibly holding something, with people waiting.

Speed has measurable commercial value: Forrester found a one-minute reduction in average checkout time can lift customer retention by up to **10%**, and tap-to-pay completes in 10–15 seconds versus roughly double for alternatives *(GoFTX / Forrester)*.

**F-05 — Three-second common sale** `P0`
The most frequent transaction shape for that specific store must complete in three interactions or fewer. The system learns what is frequent and reorders the surface accordingly — a tea shop's morning screen is not its evening screen.

**F-06 — Predictive basket assembly** `P1`
Given time of day, recent sales, and any recognised customer, pre-stage the likely basket. The operator subtracts rather than builds. Must be trivially dismissible — a wrong prediction that costs a tap to clear is worse than no prediction.

**F-07 — Unknown items never block** `P0`
An unrecognised item is added by price alone with a free-text or spoken label, the sale completes, and the system resolves it into the catalogue afterwards — asking the operator only when it genuinely cannot infer. This single behaviour is what makes day-one usage possible with an empty catalogue.

**F-08 — Interruptible, concurrent orders** `P0`
A solo operator is constantly interrupted — a phone order mid-walk-in, a customer who forgot something. Parking and resuming an order must be one gesture, with any number of orders open, and must survive an app crash or dead battery.

**F-09 — Single-handed operation** `P1`
Every critical control reachable by thumb on a phone held in one hand. The other hand is holding goods, cash, or a bag. This is a hard layout constraint, not a nicety.

---

## 08 · Input modalities and the confidence ladder

The research is emphatic that voice cannot be trusted as the primary billing path. The architecture has to reflect that honestly.

Production voice AI reports 93–95% order accuracy on simple orders, but independent field testing put standalone voice at about **83%** versus 87–89% for humans — rising to ~95% only when a person supervises. At 65+ dB ambient noise, accuracy falls to **78–83%** *(Kea AI)*. For Indian code-mixed speech it is worse: Hinglish word error rates span **27% to 70%** across models on identical audio *(Deepgram / HiACC)*.

A busy shop is exactly the 65+ dB, code-mixed, accented environment where these systems are weakest. So: voice is an accelerator with mandatory confirmation, never an unattended path to a committed bill.

### The confidence ladder

Every AI-derived input — speech, image, scan, prediction — carries a confidence score, and the interaction is determined by which band it falls in. This is the single most important safety mechanism in the product.

| Band | Behaviour |
|---|---|
| **High** | Act silently, show the result. Item added, visibly, reversible with one tap. No confirmation dialogue. |
| **Medium** | Act, but flag. Applied with a visual marker and a one-tap correction affordance. Never a modal — modals stop the queue. |
| **Low** | Ask, with a best guess pre-selected. Two or three options, largest tap targets, plain language, no jargon. |
| **Money** | Always explicit. Any AI inference that changes an amount the customer pays requires human confirmation regardless of confidence. Non-negotiable. |

**F-10 — Modality parity** `P0`
Barcode scan, camera recognition, voice, typed search, and tap-a-tile all resolve to the same order-line operation. No feature may exist in only one modality — the operator switches constantly depending on what their hands are doing.

**F-11 — Camera as a first-class scanner** `P1`
Product recognition systems reach 90%+ accuracy on catalogues past 3.5M SKUs *(Width.ai)*, though visually similar products remain the hard case and fresh produce may need spectral sensing. Ship it inside the confidence ladder: recognition proposes, the ladder decides how loudly to ask.

**F-12 — Language and code-mixing as a baseline** `P0`
Interface and voice must handle the operator's actual speech, including code-mixed. Evaluate AI4Bharat IndicConformer (22 languages, open) and Sarvam Saaras V3 (1M+ hours) against a purpose-built noisy in-store test set before committing. Do not accept vendor benchmarks recorded in quiet conditions.

**F-13 — Photo-to-catalogue onboarding** `P0`
Menu OCR pipelines already cut restaurant onboarding from weeks to hours *(Veryfi)*. Photograph a menu board, price list, shelf, or supplier invoice and the catalogue populates. This is the single highest-leverage feature in the product — it converts the abandonment-driving setup phase into a thirty-second act.

---

## 09 · Inventory without data entry

Inventory is where small-merchant POS deployments go to die. The cost is real — stockouts, overstocking, shrinkage and reconciliation labour run **$5,000–15,000 a year** for a small retailer *(NRS / Netstock)* — but the fix that every incumbent proposes is disciplined manual entry, which is precisely what a solo operator cannot sustain.

So the requirement is not "inventory management." It is *inventory that stays roughly right without anyone maintaining it*, and that is honest about its own uncertainty.

**F-14 — Inbound stock from documents** `P0`
Photograph a supplier invoice or delivery note; the system extracts lines, matches them to catalogue entries, learns supplier-specific naming conventions, and posts the receipt. Manual stock-in is a fallback, never the primary path.

**F-15 — Probabilistic stock with declared confidence** `P1`
Hold stock as an estimate with an error band that widens as unreconciled time passes, rather than as a false precise integer. Show "about 12, last confirmed Tuesday" instead of "12." Honest uncertainty is more useful and more trusted than a number the operator knows is wrong.

**F-16 — Targeted micro-counts** `P1`
Never ask for a full stocktake. When the error band on a high-value or fast-moving line exceeds a threshold, ask the operator to count *that one thing* during a quiet moment. Amortise reconciliation into seconds instead of an evening.

**F-17 — Recipe depletion shared with retail stock** `P1`
The Made facet consumes from the identical stock ledger the Stocked facet sells from. One flour balance, whether it left as a bag or as bread. Divergence here is the classic hybrid-POS failure.

---

## 10 · The two-layer knowledge system

Domain expertise that applies to every bakery, plus learned knowledge specific to *this* bakery. Keeping these separate is what allows a new tenant to be useful on day one and irreplaceable by month six.

#### Layer one — vertical domain knowledge

Curated, versioned, shared across all tenants in a vertical. What margins are normal, what spoils and how fast, what the seasonal shape looks like, what regulatory obligations attach, what the standard operating rhythms are. This is authored and reviewed, not learned from tenant data — which keeps it auditable and prevents one tenant's practices leaking into another's advice.

#### Layer two — tenant and store knowledge

Derived exclusively from that tenant's own event ledger, and never shared. Their actual demand curves, their customers' credit behaviour, their supplier reliability, their staffing rhythm, their pricing latitude. Store-level, because two branches of the same business genuinely differ.

> **Isolation is a security requirement, not a preference.** OWASP added **LLM08:2025** specifically for multi-tenant vector and embedding weaknesses. The tenant filter must be enforced at the vector store query layer, driven by a signed JWT claim — never in application code, where a single missed filter leaks one merchant's business to a competitor *(Truto / Zylos)*. Cross-tenant leakage in this product is existential, because our tenants' neighbours *are* their competitors.

**F-18 — Pool isolation with namespace enforcement** `P0`
Shared index with mandatory tenant-ID namespace filtering, enforced below the application layer. Silo (dedicated index) available for large tenants who require it contractually. Pool-by-default is what keeps per-tenant cost viable at our price point.

**F-19 — Structured data beats retrieval for numbers** `P0`
Financial and operational questions must be answered by generated queries against the ledger, not by embedding similarity. RAG handles knowledge and explanation; SQL handles arithmetic. An advisor that hallucinates a revenue figure is destroyed on first contact with a merchant who knows their own takings.

**F-20 — Every claim traceable** `P1`
Any assertion the advisor makes must be expandable to the underlying transactions. Trust with this user is built by showing the receipts — literally.

---

## 11 · The consultant

The advisory layer is the reason this is a platform rather than a billing app, and it is also the retention mechanism — a merchant can switch POS in an afternoon, but not a system that knows two years of their trading history.

The failure mode to avoid is the dashboard. Our operator will not open a dashboard. Sidekick's reported 40% reduction in admin time comes from the assistant surfacing things *proactively*, not from merchants querying it *(Presta)*.

**F-21 — Ask anything, in any language, any time** `P0`
"Did I make money this week?" "Should I buy more mangoes?" "Which customer owes me the most?" Answered conversationally against the tenant's ledger and the vertical pack, in the operator's language, by voice or text.

**F-22 — Proactive interventions at decision points** `P0`
Not a feed of insights. A small number of high-value interruptions timed to when they are actionable: at closing, before a supplier order, when a margin silently inverts, when a reliable customer's credit drifts. Cap the frequency — an advisor that speaks constantly gets muted, and a muted advisor is a churned customer.

**F-23 — Advice states its own confidence and reasoning** `P1`
"Sales are down 12% versus the last four Tuesdays; two of those were holidays, so treat this cautiously." A consultant that hedges appropriately is trusted longer than one that is confidently wrong once.

**F-24 — Advisory memory** `P2`
Track what was suggested, whether it was taken, and what happened. Both to improve, and to demonstrate accumulated value: "the six suggestions you acted on are associated with ₹X." This is the renewal conversation, pre-written.

---

## 12 · Money — payments and credit

Two things matter disproportionately here: accepting payment without forcing hardware purchase, and handling informal credit, which is the single most important unmet need in the research.

SoftPOS turns any NFC Android phone into a card terminal with zero hardware investment, and NPCI is developing offline UPI over NFC for payments up to **₹2,000**, with terminal certification beginning in 2026 *(Worldline / Medianama)*. That combination means a merchant can start with nothing but the phone in their pocket.

On credit: the research is blunt that the credit backlog is the defining pain — customers pay later, and the merchant themselves buys from wholesalers on credit, with both sides tracked on paper *(ORF)*. Khatabook's 10 million merchants are the proof of demand. Critically, credit is *bidirectional*, and most POS products model only the receivable side.

**F-25 — Zero-hardware payment acceptance** `P0`
SoftPOS / tap-to-phone plus UPI QR as the default. Hardware terminals supported but never required.

**F-26 — Bidirectional credit ledger** `P0`
Customer receivables and supplier payables in one view, with reminders. This is the Khatabook wedge — and plausibly a better entry point into a merchant than billing, because it digitises a paper artefact they already maintain.

**F-27 — Split and partial settlement** `P1`
Part cash, part UPI, part on credit — routine in these businesses, awkward in most POS software.

**F-28 — Cash is a first-class citizen** `P0`
Fast denomination entry, change calculation, drawer reconciliation, and detection of the divergence between recorded and actual cash. Products that treat cash as legacy fail in these markets.

> **A strategic option worth naming early.** An accurate, verified transaction history is the raw material for merchant credit underwriting — there is active research on using digital sales and inventory data for creditworthiness assessment *(CEGA Berkeley)*. That is a much larger business than POS subscriptions, and it is the reason the affordability constraint in §15 may not have to be solved with subscription revenue at all. It also changes the data model requirements, so it should be a deliberate decision now rather than a retrofit later.

---

## 13 · Non-functional requirements

### Performance budgets

**N-01 — Local-first latency targets** `P0`
Item add to visual confirmation under 100 ms. Sale completion under 400 ms. Cold start to sellable under 2 s. All measured on a low-end Android device on the slowest network the target market has, not on a developer's laptop.

**N-02 — No AI call on the critical path** `P0`
Model latency must never sit between the operator and a completed sale. Inference runs speculatively, in parallel, or after the fact. If a model is slow or unreachable, the sale still completes — the enrichment lands later.

### Offline-first and sync

Loyverse — the closest thing to a competitor on simplicity — restricts refunds, customer registration, and item creation while offline. That is the standard to beat, and beating it is a genuine differentiator in markets with unreliable connectivity.

**N-03 — Full capability offline, indefinitely** `P0`
The local database is the primary store, not a cache. Every operation available online is available offline, including item creation, refunds, and customer registration. Only inherently networked actions (card authorisation, aggregator sync) may degrade, and each has a defined fallback.

**N-04 — Convergent multi-device sync** `P0`
CRDT-based merge for concurrent edits across devices in a store. Evaluate PowerSync (Postgres ↔ SQLite with declarative sync rules), Ditto (peer-to-peer, no server required — significant for a store whose uplink is down but whose devices can see each other), and Automerge 3.0. Monetary events are append-only and therefore commutative; the hard cases are catalogue edits and stock levels.

### Multi-tenancy and scale

**N-05 — Shared schema, tenant_id everywhere, RLS as backstop** `P0`
The 2026 consensus default, and the only model whose per-tenant cost supports our price point. Row-level security is the safety net, not the mechanism — tenant context must propagate through application code, connection pools, background workers, caches, and analytics pipelines. Each of those is a documented leak vector.

**N-06 — Escape hatch to silo** `P1`
Large or regulated tenants get a dedicated database without a rewrite. Design the data access layer for this on day one; retrofitting it is expensive.

**N-07 — Noisy-neighbour governance** `P1`
Per-tenant rate and cost budgets on inference. One high-volume tenant must not be able to degrade service or margin for others.

### Security, privacy, compliance

**N-08 — Never touch a PAN** `P0`
Tokenisation and processor redirection so cardholder data never enters our infrastructure, reducing PCI DSS 4.0 scope to near zero. For a company at this price point, carrying CDE scope is not survivable. Note that tokenisation rarely eliminates scope entirely for a SaaS platform — plan for a reduced-scope assessment, not none.

**N-09 — India GST e-invoicing, correct and current** `P0`
IRN generation via the IRP with signed QR on the invoice, HSN at 4 or 6 digits by turnover, e-way bill with Ship-To GSTIN (mandatory from 15 June 2026), 30-day reporting windows for larger taxpayers, and **six-year retention** of signed JSON, IRN and QR data. The schema version changes — validate against the current schema on every generation rather than pinning.

**N-10 — DPDP Act compliance** `P0`
No blanket localisation requirement, and cross-border transfer runs on a negative list — but there is *no legitimate-interest basis*, so consent architecture is mandatory, alongside 72-hour breach notification and automated deletion workflows. Multi-tenant architectures with long sub-processor chains carry elevated exposure. Penalty scale needs legal verification (§17) — sources conflict, and the figure materially affects risk posture.

**N-11 — Compliance is a pluggable pack** `P1`
Tax and fiscal rules are versioned, dated, per-jurisdiction data — not application logic. Historic invoices must be reproducible under the rules in force when issued. This is also the mechanism for entering a second country without forking the product.

---

## 14 · The device and peripheral platform

"Any device, any peripheral" is the requirement. There is one hard technical constraint standing in the way, and it needs to be confronted in the architecture rather than discovered in month four.

> **The browser cannot talk to a receipt printer.** ESC/POS is the de facto standard for thermal printers over USB, serial, Bluetooth and network. Browsers expose no raw TCP or Bluetooth serial access, so **no ESC/POS connection type is functional from a pure web app** *(unified_esc_pos_printer)*. A web-only client therefore cannot print receipts, read a scale, or open a cash drawer directly. Any "runs anywhere in a browser" plan must account for this.

The resolution is a **device bridge**: a small local agent — native app, companion daemon, or LAN print server — that owns hardware and exposes it over a stable local protocol. Thin clients on any device talk to the bridge. This keeps the surface layer genuinely device-agnostic while placing hardware access where the OS permits it.

**N-12 — Device bridge abstraction** `P0`
A capability-based protocol — *print*, *weigh*, *scan*, *display*, *open-drawer*, *read-sensor* — with pluggable drivers beneath. The application layer addresses capabilities, never specific devices.

**N-13 — Baseline driver set** `P0`
ESC/POS printers over USB, BLE, Bluetooth Classic and network; HID and BLE barcode scanners; serial and BLE weighing scales; cash drawers; customer displays; kitchen display screens. UnifiedPOS/OPOS concepts inform the model but should not constrain it.

**N-14 — Open peripheral SDK** `P1`
Third parties — and we ourselves, per vertical — must be able to add device support without touching core. This is what makes "compatible with any sensor the business needs" a real claim: temperature probes for cold chain, fuel dispensers, occupancy sensors, IoT scales, queue displays.

**N-15 — Graceful hardware degradation** `P0`
No printer → digital receipt via WhatsApp or QR. No scanner → camera. No scale → manual weight. No bridge at all → the phone alone completes the sale. Every peripheral is optional at runtime, and the system must say so plainly rather than erroring.

### F&B-specific surfaces

For food businesses the peripheral story extends to order routing. Kitchen tickets to the correct station, kitchen display with timers, and aggregator integration — Swiggy and Zomato deliver orders by webhook within 1–2 seconds and expect bidirectional menu and availability sync. For a solo operator, aggregator orders arriving in the same queue as walk-ins is not a convenience feature; it is the difference between coping and not.

---

## 15 · Unit economics as a design constraint

Affordability is not a pricing decision made at the end. It is an architectural constraint that invalidates certain designs, and it should be enforced from the first commit.

The Indian market prices the reference point: ₹399/year at the bottom (myBillBook mobile), ₹3,420–8,999/year for established players. Call it **₹300–800 per month** as the realistic ceiling for a solo merchant. That is roughly $4–10. Every architectural choice has to survive that number.

The reason this is now possible: inference costs fell from ~$20 to ~$0.40 per million tokens for GPT-4-class capability, roughly 10× annually, with cheaper distilled models at $0.20 *(AI Magicx / Silicon Data)*. Gartner projects a further 90%+ reduction by 2030. An AI-native product at this ARPU was not viable three years ago and will be comfortable in three more. **The timing is the opportunity.**

**N-16 — Explicit per-tenant cost ceiling** `P0`
Set a monthly infrastructure-plus-inference budget per tenant, instrument it from day one, and treat exceeding it as a build-breaking regression. Without this, AI features silently destroy the margin.

**N-17 — Tiered model routing** `P0`
Most interactions should never reach a frontier model. On-device or small models for classification, catalogue matching, and routine speech; mid-tier for structured extraction; frontier models only for genuine advisory reasoning. Route by task, and measure the mix.

**N-18 — Aggressive caching and precomputation** `P1`
Advisory answers to common questions are computed on a schedule, not per query. Cache embeddings and extraction results. Deduplicate across tenants wherever it is provably safe — vertical-layer knowledge is shared, tenant-layer never is.

**N-19 — Zero-touch onboarding as a cost requirement** `P0`
At this ARPU there is no budget for a human implementation call — ever. Onboarding must be entirely self-service and AI-assisted. This is why F-13 (photo-to-catalogue) is P0: it is simultaneously the adoption feature and the gross-margin feature.

---

## 16 · Hard constraints and risks

Collected from the research, worst first. Each of these has killed a product before.

| Risk | Evidence | Mitigation |
|---|---|---|
| Voice unreliable in a real shop | 78–83% accuracy at 65+ dB; Hinglish WER 27–70% | Confidence ladder; voice never unattended on money; multimodal parity (F-10) |
| Week-two abandonment | Half of microentrepreneurs lapsed in a controlled pilot | Value inside 90 seconds; credit-ledger wedge; proactive advisor creates a return reason |
| Inventory drifts, trust collapses | 63–83% accuracy on manual systems | Probabilistic stock with visible error bands (F-15); micro-counts (F-16) |
| Web client cannot drive peripherals | Browsers expose no raw TCP/SPP/USB | Device bridge (N-12); native shell where hardware is required |
| Cross-tenant knowledge leakage | OWASP LLM08:2025 | Enforcement below the app layer; signed JWT namespace claims; leakage tests in CI |
| Inference cost exceeds ARPU | ₹300–800/mo realistic ceiling | Hard per-tenant budget (N-16); tiered routing (N-17) |
| Advisor hallucinates a financial figure | Inherent to retrieval-based answering | Numbers only from generated queries over the ledger (F-19); traceable claims (F-20) |
| Compliance drift breaks invoicing | Schema and rules changed repeatedly through 2026 | Versioned compliance packs (N-11); validate against live schema |
| Incumbents ship the same AI layer | Tote at 225+ stores; Square and Shopify shipping AI | Their constraint is the trained-operator assumption baked into their UX and price; speed matters |

---

## 17 · Open decisions

These are yours to make, and each one changes the build materially. My recommendation is attached to each.

**01 — Launch geography**
India-first and Western-first imply different products. India means GST e-invoicing, UPI, code-mixed voice, ₹300–800/month, and a fiercely competitive low-price field. The West means higher ARPU and payment-processing revenue, but Square and Toast are entrenched and the affordability constraint largely disappears.
> **Recommendation** — India-first. The affordability constraint is a feature — it forces an architecture nobody with Western ARPU would build, and that architecture travels upward into other price-sensitive markets. The reverse journey does not work.

**02 — Wedge feature**
Do we enter as a biller, or as a credit ledger? Khatabook's 10 million merchants came from digitising the credit book, not the bill. Billing is a bigger product; credit is an easier first yes.
> **Recommendation** — Lead with billing but ship credit in the same release, and let acquisition messaging lead with credit. It is the more urgent pain and the lower-friction install.

**03 — Client architecture**
The peripheral constraint forces a choice: native-first (full hardware, higher build cost per platform), web-first with a bridge (broad reach, degraded hardware story), or cross-platform with native modules.
> **Recommendation** — Cross-platform shell with a native device-bridge module. Preserves the "any device" promise without conceding hardware access.

**04 — Payments: facilitate or integrate?**
Becoming a payment facilitator adds a revenue stream that could subsidise near-free software — Square's entire model — but adds regulatory weight, capital requirements, and PCI scope.
> **Recommendation** — Integrate first, keep the data model facilitator-ready. Revisit once transaction volume makes the economics obvious. Note this interacts with the lending option in §12.

**05 — First vertical pack**
The vertical pack model needs one vertical done exceptionally well to prove domain expertise is real rather than marketing.
> **Recommendation** — Pick a genuine hybrid — a bakery-café or a sweet shop with a hot counter. It exercises retail and F&B on one bill from day one, which is the architectural claim we most need to validate early.

**06 — Legal verification needed**
Sources conflict on DPDP penalty scale, and GST e-invoicing thresholds have moved repeatedly. Neither should be taken from secondary research.
> **Recommendation** — Commission a compliance review before the architecture freezes. Retention, consent, and residency decisions are expensive to reverse.

---

## 18 · Suggested phasing

Sequenced so that each phase is independently useful to a merchant, and so the riskiest assumptions get tested earliest rather than last.

**Phase 00 — Prove the wedge**
*Before writing production code, test the two assumptions that invalidate everything downstream.*
Can photo-to-catalogue populate a real shop's inventory accurately enough to sell from? Can voice and camera input survive a genuinely noisy shop at 65+ dB? Build throwaway prototypes, take them into five real stores, and measure. If F-13 does not work, the onboarding thesis collapses and the plan changes.

**Phase 01 — Sell and remember**
*A solo operator can run their entire day on it, offline, on a phone.*
Unified sellable model, the three-second sale, unknown-item capture, cash and UPI, bidirectional credit ledger, photo-to-catalogue onboarding, full offline operation, single-tenant-correct multi-tenancy. No advisor yet — but the event ledger is accumulating from day one, which is what makes the advisor possible later.

**Phase 02 — Understand the shop**
*The system starts knowing things the operator did not tell it.*
Probabilistic inventory with micro-counts, invoice-driven stock-in, the first vertical pack, tenant knowledge layer, and the first proactive interventions. Compliance pack for the launch geography. The device bridge with the baseline driver set.

**Phase 03 — The consultant**
*Ask it anything about the business and get a grounded, traceable answer.*
Full conversational advisory over the ledger, advisory memory, multi-store comparison and roll-up, F&B routing and aggregator integration, peripheral SDK opened to third parties.

**Phase 04 — Platform**
*Vertical packs and hardware from outside the company.*
Additional verticals and geographies via packs rather than code. Optionally, the financial-data business hinted at in §12 — which by this point has years of verified transaction history behind it.

---

*Draft 01 · 29 August 2026 · Compiled from market research conducted August 2026.*
*Figures marked with a source citation are from secondary research and are directional; vendor pricing and market sizing require primary verification before external use.*
