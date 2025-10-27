## Milestone 1 — AI-ready Portfolio Scaffold

### Objective
Stand up the foundational worker, storage bindings, and vanilla UI (single-user scope) so we can start testing manual portfolio management before the Agent orchestration layer is plugged in.

### Deliverables
1. **Worker routes**  
   - Serve HTML shells at `/` and `/manage`.  
   - JSON APIs: `/api/portfolio` (summary) and `/api/chat` (LLM planner stub).  
   - Cron hook reserved for future automation; price polling happens in the browser.
2. **Persistence layer**  
   - KV schema for `portfolio:<user>` (canonical assets).  
   - Helper utilities for asset CRUD and blockchain balance fetchers; market pricing is client-driven.  
   - Type definitions for assets, operations, and summaries.
3. **Vanilla UI**  
   - Responsive metrics cards, pie chart, holdings table, and chat log.  
   - Fetch portfolio on load, request live prices client-side, display operations feedback, gracefully handle empty state.  
   - Accessible form controls with keyboard-friendly defaults.
4. **DX**  
   - Documentation in `AGENTS.md` explaining agent plan + tool expectations.  
   - Instructions in README covering KV setup + how to run `wrangler dev`.

### Exit Criteria
- `wrangler dev` serves the dashboard and can add/remove assets via the chat stub (even if operations are currently rule-based, not agent-driven).  
- Browser-side price fetch populates USD totals and allocations after the portfolio loads.  
- Milestone demo video or notes showing manual walkthrough of adding assets, seeing balances, and confirming client-computed chart update.
