## Milestone 1 — AI-ready Portfolio Scaffold

### Objective
Stand up the foundational worker, storage bindings, and vanilla UI (single-user scope) so we can start testing manual portfolio management before the Agent orchestration layer is plugged in.

### Deliverables
1. **Worker routes**  
   - Serve HTML shell at `/`.  
   - JSON APIs: `/api/portfolio` (summary), `/api/chat` (LLM planner stub), `/api/prices/refresh` (manual refresh).  
   - Daily cron handler that updates price cache + recomputes summaries.
2. **Persistence layer**  
   - KV schema for `portfolio:<user>` and `prices:latest`.  
   - Helper utilities for asset CRUD, balance fetchers, and price storage.  
   - Type definitions for assets, operations, and summaries.
3. **Vanilla UI**  
   - Responsive metrics cards, pie chart, holdings table, and chat log.  
   - Fetch portfolio on load, display operations feedback, gracefully handle empty state.  
   - Accessible form controls with keyboard-friendly defaults.
4. **Testing & DX**  
   - Vitest coverage for summary builder, price caching, and operation application.  
   - Documentation in `AGENTS.md` explaining agent plan + tool expectations.  
   - Instructions in README section on how to set up KV bindings + run `wrangler dev`.

### Exit Criteria
- `wrangler dev` serves the dashboard and can add/remove assets via the chat stub (even if operations are currently rule-based, not agent-driven).  
- Daily cron (triggered via `wrangler cron trigger`) populates `prices:latest`.  
- Tests pass locally, and lint/type checks succeed.  
- Milestone demo video or notes showing manual walkthrough of adding assets and seeing chart update.
