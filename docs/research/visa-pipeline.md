# Automated lab purchasing via Visa (with grant guardrails)

Researched 2026-10-23. Addresses pain points 06, 07, 08, 09, 10.

## Idea in one line
An AI agent buys lab supplies for a lab, each purchase is checked against the
grant's rules at checkout (which grant, allowed category, remaining balance,
not in the last 90 days), and every transaction carries clean line-item data
that feeds reconciliation and auto-written drawdown justifications.

## Reality check on Visa access [agent-reported; re-check if a sponsor offers credentials]
- **Visa Intelligent Commerce (VIC)** APIs (enroll, passkey, instructions /
  mandates, credentials, confirmations) are documented but **gated**: sandbox
  needs a token requester ID + relationship ID from a Visa account manager;
  docs marked "pilot"; a developer reported a week with no reply.
  https://developer.visaacceptance.com/docs/vas/en-us/intelligent-commerce/developer/all/rest/intelligent-commerce.html
  · https://community.developer.visa.com/t5/Sandbox-Test-Data/How-can-I-get-full-access-of-the-VPP-APIs-in-sandbox/m-p/19366
- **Usable now:** Visa **Trusted Agent Protocol** (open spec + code,
  https://github.com/visa/trusted-agent-protocol), the read-only **Visa
  Developer MCP** / docs MCP (https://github.com/visa/mcp,
  https://developer.visa.com/mcp-docs), Visa B2B Virtual Account sandbox
  (free, two-way SSL setup; https://developer.visa.com/capabilities/vpa).
- Visa's agentic B2B invoice pilot with BILL and Billtrust announced
  2026-10-21 (pitch reference only).
  https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.22866.html
- **If a hackathon sponsor hands out VIC credentials, use them.** Otherwise:

## Recommended prototype architecture
| Layer | Real or mocked | How |
|---|---|---|
| Grant ledger | real | Our DB: grant ID, allowed categories + exclusions, balance, start/end, PI |
| Supplier catalog | **mocked** | JSON shaped like Fisher/VWR/Sigma items (real ordering is cXML/OCI punchout via Jaggaer/Coupa/Workday; no public APIs found) |
| Agent | real | LLM parses "2× 500 mL ethanol on NIH-R01-123", picks grant, runs policy engine; human approval above a threshold or for flagged categories |
| Mandate | mocked, VIC-shaped | Mirror VIC `POST /acp/v1/instructions`: `mandates[].declineThreshold.amount/currencyCode`, `effectiveUntilTime` = grant end date, `preferredMerchantName`, `description` |
| Payment credential | **real: Stripe Issuing sandbox** | single-use virtual card per order: `POST /v1/issuing/cards` with `spending_controls[allowed_categories]`, `spending_limits`, metadata `grant_id`/`po_id`/`agent_id` |
| Live authorization | real | `issuing_authorization.request` webhook re-checks balance + end date (≤2 s to respond) |
| Simulated purchase | real (test helpers) | `POST /v1/test_helpers/issuing/authorizations` (show an out-of-category decline), then `/capture` with `purchase_details[receipt]` line items = Level-3-style data |
| Reconciliation | real | `issuing_transaction.created` → match via card metadata, flag auth≠settle, decrement balance, export per-grant CSV |
| Agent identity | real | Sign agent requests to the mock supplier with Visa TAP (HTTP Message Signatures) |
| Drawdown justification | real (LLM) | Generate ≤1,000-char PMS justification per draw from ledger (pain point 10) |

Stripe docs: https://docs.stripe.com/issuing/testing ·
https://docs.stripe.com/api/issuing/authorizations/test_mode_capture ·
https://docs.stripe.com/api/issuing/transactions/object ·
https://docs.stripe.com/issuing/agents

## Guardrail rules to implement (from pain point 08 evidence)
1. Block/flag supply purchases in an award's last 90 days.
2. Block categories excluded by policy (radioactive, select agents, acutely
   toxic chemicals, biohazards, animals) and generally-unallowable items
   (e.g. office supplies as direct costs).
3. Enforce per-grant remaining balance and per-purchase thresholds (e.g.
   P-card style ≤ $5k; above → route to PO / human).
4. Require purpose + grant code at purchase time; attach line items.
5. Shared purchases: require an allocation split across grants.

## Options compared [agent-reported]
| Option | Access | 24–48 h feasibility |
|---|---|---|
| Stripe Issuing sandbox | self-serve, free | **high** |
| Visa Intelligent Commerce | gated pilot | low without sponsor |
| Visa Intelligent Commerce Connect (Apr 2026) | select partners | not feasible |
| Visa TAP / Developer MCP | open | high (signing demo / docs) |
| Visa B2B Virtual Account sandbox | free, 2-way SSL | medium |
| Mastercard Agent Pay for Machines | early access opened 2026-10-20, terms unclear | low–medium |
| Google AP2 | open repo, needs Gemini key | medium (mandate model) |
| ACP (OpenAI/Stripe) | open spec; SPTs gated | medium as spec |
| Ramp API | sandbox via third parties only | unverified |
| Brex API | no self-serve sandbox | low |

## Risks
- Universities often require punchout/PO for big vendors; P-cards limited to
  small buys. Pitch as policy-bounded autonomy with human approval.
- Line-item data isn't guaranteed: Visa replaced Level 3 with the Commercial
  Enhanced Data Program (Oct 2025); merchants may not send line items, so **our
  order record is the source of truth**; network data is a cross-check.
  https://support.stripe.com/questions/understand-the-visa-commercial-enhanced-data-program-%28cedp%29
- Captures/force-captures can bypass spending controls → mismatch detection
  and disputes are required.
- Agent liability for wrong payments is unresolved; use single-use cards,
  merchant locks, velocity checks, TAP identity.
- Don't make the demo depend on any pilot/preview program.

## Unverified
Visa Consumer Transaction Controls sandbox; Visa B2B Payment Controls API
(page 404); exact text of 2 CFR 200.309; Ramp first-party sandbox docs;
Mastercard admission terms.
