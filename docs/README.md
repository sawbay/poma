# Technical Requirements (Trait-driven Asset System)

## 1) Goal

Build an asset & cashflow management system with **minimal UI**.  
The system must support multi-asset holdings (physical gold, XAUT, BTC/altcoins, cash USD/VND, stablecoins, land), group assets to a portfolio, and run extensible processes (eg. **refresh prices** to value assets at analysis time, **suggest rebalancing** between assets in a portfolio, legacy Poma).

Poma is Portfolio Management Agent. It's legacy docs could be find here [docs](/docs/AGENTS.md), could not totally match the new requirement below.

---

## 2) Hard Constraints
1) **Database schema is limited to ONLY two tables**:
   - `asset`
   - `trait`
   No other storage schemas/tables (e.g., no `position`, no `price_quote`, no `snapshot` tables).
2) “**If an asset has a trait, run the corresponding functions for that trait**” (trait-driven execution).
3) Must run on **Cloudflare Workers + Cloudflare D1** (serverless).
4) Price refresh must follow pattern:
   - **Parent job** queries assets from DB
   - **Child job per asset** processes its traits (especially pricing traits)

---

## 3) Platform & Services
### 3.1 Cloudflare components
- **Cloudflare Workers**
  - API entrypoints (Telegram webhook + internal endpoints)
  - Queue consumer logic (per-asset processing)
- **Cloudflare Workflows**
  - Durable orchestration for the *parent job* (“refresh all prices”)
- **Cloudflare Queues**
  - Fan-out execution: one message per asset (child jobs), parallel processing
- **Cloudflare D1**
  - Only persistence layer (2 tables: `asset`, `trait`)

---

## 4) Data Model (D1) — Only 2 tables

### 4.1 `asset` table
- `id` (TEXT, PK)
- `asset_type` (TEXT) — used for UX/grouping only; core logic must not hardcode behavior by `asset_type`
- `meta` (TEXT JSON)
- timestamps `created_at`, `updated_at`

### 4.2 `trait` table
- `id` (TEXT, PK)
- `asset_id` (TEXT, FK-ish)
- `trait_type` (TEXT) — e.g. `AMOUNT`, `UNIT`, `PRICE_FEED`, ...
- `trait_props` (TEXT JSON) — all trait-specific data lives here
- `active` (INTEGER boolean)
- timestamps `created_at`, `updated_at`
- Constraint: `unique(asset_id, trait_type)`

> **Important:** “Latest price” is stored inside the trait’s trait_props.  
No separate price history table is allowed.

---

## 5) Trait System

### 5.1 Trait Registry
A registry maps `trait_type -> handler`.  
Handlers implement only the hooks they need.

**Minimum hooks**
- `validate(trait_props)`
- `process(ctx)` (or hook-specific: `resolvePrice`, `accrueInterest`, etc.)

### 5.2 Minimal trait set for MVP
- `AMOUNT`
  - `trait_props: { "value": number }`
- `UNIT`
  - `trait_props: { "unit": string }`
- `PRICE_FEED`
  - `trait_props` must include:
    - `source`: provider config
    - `latest`: cached quote (mutable)
    - optional `history`: capped rolling window

Example `PRICE_FEED.trait_props`
```json
{
  "source": {
    "provider_key": "vn_gold_v1",
    "series_key": "SJC:SELL:LUONG",
    "quote_currency": "VND",
    "refresh_interval_sec": 3600,
    "stale_after_sec": 7200
  },
  "latest": {
    "price": 80000000,
    "currency": "VND",
    "as_of": "2025-12-26T00:00:00Z",
    "status": "ok",
    "meta": {}
  },
  "history": []
}
```

### 5.3 Asset-specific behavior via trait_props (not schema)
- **Physical gold vs XAUT**
  - both have `PRICE_FEED`, but different `provider_key` and `series_key`
- **Cash deposit vs cash on hand**
  - cash deposit can later be modeled via an `INTEREST_BEARING` trait
  - gold does not need that trait

---

## 6) Pricing Architecture (Trait-driven)

### 6.1 Provider Registry
Pricing handlers must route by `PRICE_FEED.source.provider_key`.

Provider interface
- `getQuote({ seriesKey, quoteCurrency, asOf }) -> {price, currency, as_of, meta}`

### 6.2 Price Refresh Job Design (Required)
#### Parent job (Workflow)
- Queries D1:
  - `select distinct asset_id from trait where trait_type='PRICE_FEED' and active=1`
- Fan-out:
  - enqueue **one Queue message per asset**: `{ assetId, asOf }`

#### Child job (Queue consumer)
For each `{assetId, asOf}`:
1) Load all traits for that asset: `select * from trait where asset_id=? and active=1`
2) For each trait present, call its handler:
   - if `PRICE_FEED` exists → call provider → update `trait.trait_props.latest` (and optional capped `history`)
3) Must use **optimistic locking**:
   - update only when `updated_at` matches (avoid races and tolerate retries)

### 6.3 Reliability requirements
- Queue processing is **at-least-once**; handlers must be **idempotent**.
- Provider failures:
  - update `latest.status = "error"` and store error in `latest.meta.error`
- Staleness:
  - if `now - latest.as_of > stale_after_sec` → mark `latest.status = "stale"`

---

## 7) Analytics & Advisor (Read-only consumers of traits)
- Analytics must compute asset value using only traits:
  - `value = AMOUNT.value * PRICE_FEED.latest.price` (plus FX if needed)
- No direct provider calls in analytics; analytics reads `PRICE_FEED.latest`.
- Advisor (future):
  - rule-based suggestions using current trait-derived valuations
  - explainable output (reasons + assumptions + timestamps)

> If FX is needed, model FX rates as another **asset** with `PRICE_FEED` (still only 2 tables).

---

## 8) Telegram Integration (Adapter-only)
- Telegram bot is an **adapter**:
  - Parses user inputs/files
  - Produces commands (create asset/traits, update trait props)
  - Does **not** embed financial logic (pricing, valuation, advisor)
- Telegram can be replaced later without changing core trait engine.

---

## 9) Security & Access
- Whitelist Telegram user IDs (owner-only for MVP)
- All write operations should support preview/confirm at the adapter layer (Telegram UX), but the **core remains stateless** about Telegram.

---

## 10) Non-functional Requirements
- Performance:
  - price refresh must scale to thousands of assets using queue parallelism
- Observability:
  - structured logs for workflow run + per-asset consumer results
- Extensibility:
  - add a new asset type by attaching new traits + adding handlers/providers
  - avoid schema migrations (beyond the two tables)

---

## 11) Acceptance Criteria (MVP)
- With two assets:
  - `GOLD_SJC` and `XAUT`, each has `AMOUNT`, `UNIT`, `PRICE_FEED`
- Running the workflow:
  - enqueues one message per asset
  - consumer updates `PRICE_FEED.trait_props.latest` for both assets
- Physical gold and XAUT use different provider configs and update correctly.
- No tables beyond `asset` and `trait` exist in D1.
