## Milestone 1 — AI-ready Portfolio Scaffold

### Objective
Stand up the foundational worker, storage bindings, and vanilla UI (single-user scope) so we can start testing manual portfolio management before the Agent orchestration layer is plugged in. Milestone 1 now also establishes AI-assisted import scaffolding and a unified asset schema covering on-chain, physical, and equity positions.

### Deliverables
1. **Worker routes**  
   - Serve HTML shell for the portfolio overview at `/` (or `/portfolio`) via `src/ui/portfolio.html`.  
   - Serve a dedicated import console at `/imports` via `src/ui/imports.html`, including navigation links between views.  
   - Expose JSON APIs: `/api/portfolio` (summary), `/api/chat` (planner), and `/api/import-session` (create/update staged import items).  
   - Cron hook reserved for future automation; price polling happens in the browser.
2. **Persistence layer**  
   - KV schema for `portfolio:<user>` (canonical assets) plus `import-session:<sessionId>` entries that capture staged assets and validator status.  
   - Durable Object binding `LOGS_DO` (or similar) records planner interaction notes; document binding names in `wrangler.jsonc`.  
   - Helper utilities for asset CRUD, blockchain balance fetchers, and import-session lifecycle (create/update/commit/discard).  
   - Canonical asset schema definitions (on-chain, physical, stock) shared between worker, AI planner, and client.
3. **AI-assisted import flow**  
   - Prompt/response templates so the planner agent can validate uploaded addresses, tickers, or CSV data.  
   - Conversational loop that keeps requesting missing or invalid details until each asset is ready to import (e.g., chain clarification, quantity units), using session IDs to resume context.  
   - Hooks for staging imported assets in storage before committing to KV, including follow-up questions for missing metadata, duplicate detection, and user confirmation.
4. **Vanilla UI**  
   - Portfolio page: responsive metrics cards, pie chart, holdings table, “last updated” indicator, navigation to imports.  
   - Imports page: AI/manual intake section with CSV upload stub, validation transcript, staged asset list, and confirmation controls wired to `/api/import-session`.  
   - Both pages fetch portfolio data on load, request live prices client-side where needed, and handle empty/error states gracefully.  
   - Stock holdings display placeholder pricing until equities feed is wired; UI flags unpriced assets for transparency.  
   - Accessible form controls with keyboard-friendly defaults.  
5. **DX**  
   - Documentation in `AGENTS.md` explaining agent plan + tool expectations.  
   - Instructions in README covering KV setup + how to run `wrangler dev`.

### Exit Criteria
- `wrangler dev` serves the portfolio and imports pages; navigation links work bidirectionally. Users can add/remove assets via the chat stub (even if operations are currently rule-based, not agent-driven).  
- Browser-side price fetch populates USD totals and allocations after the portfolio loads; stock assets display explicit “price pending” when feeds are unavailable.  
- Asset schema is implemented and referenced by planner prompts, UI rendering, persistence utilities, and import-session staging.  
- Initial AI-assisted import walkthrough documented (e.g., CSV upload + planner validation mock) showing the conversational loop and final confirmation.  
- Manual import (CSV only) follows the same staging/confirmation path as AI chat before committing to KV.  
- Milestone demo video or notes showing manual walkthrough of adding assets, seeing balances, and confirming client-computed chart update.
