## Portfolio Agent Plan

### 1. Vision
- Conversational command center that lets users import blockchain addresses (BTC, ETH, SOL), physical holdings (gold, USD), and equity positions, keeping the portfolio current through AI-assisted workflows.
- Runs entirely on Cloudflare Workers + Agents; the same stack powers chat, orchestration, and background automation.
- Ships lightweight vanilla HTML/CSS/JS experiences for both the live portfolio view and the import console—no SPA tooling required.
- Uses [Cloudflare Agents](https://developers.cloudflare.com/agents/api-reference/) as the execution backend so agent tooling, streaming, and orchestration run within the Workers platform.

### 2. Core Agent Responsibilities
1. **Portfolio Planner Agent**
   - Goal: orchestrate end-to-end intake of portfolio data—parsing chat, CSV, or API hints—and transform them into safe, auditable mutations (`add`, `update`, `remove`, `stage`, `discard`) using Cloudflare Agents runtime primitives with a built-in human-in-the-loop checkpoint.
   - Capabilities:
     - **State awareness**: snapshot portfolio + import session before planning; diff proposed changes; highlight conflicts.
     - **Validation pipeline**:
       1. Identify asset type (blockchain, physical, stock) using heuristics + prior context.  
       2. Call balance/quote tools or external validators; flag unresolved fields with actionable prompts.  
       3. Enforce schema completeness (chain, address, unit, quantity, ticker) prior to readiness.
     - **Staging management**: write to `/api/import-session` with detailed metadata (`source`, `confidence`, `pendingQuestions`, `notes`); support `stage`, `update-stage`, `commit`, and `reject` operations.
     - **Human-in-the-loop**: invoke `agent.waitForHuman()` when ready for approval, passing a payload summarizing staged changes so the UI can surface Approve/Decline controls.
     - **User guidance**: explain each required follow-up, provide examples, and summarize changes before routing to human approval.
   - Tooling (Cloudflare Agent toolkit IDs):
     - `tool.portfolio.read` / `tool.portfolio.write` → KV state access.  
     - `tool.import-session.read` / `tool.import-session.write` → Durable Object-backed staging.  
     - `tool.balance.bitcoin`, `tool.balance.ethereum`, `tool.balance.solana` → on-chain lookups.  
     - `tool.prices.quote` → crypto + metals quotes (stocks TBD).  
     - Optional `tool.reference.lookup` → ticker metadata, unit conversions.  
     - Cloudflare Agent APIs (per HITL guide):
       - `agent.run` for synchronous orchestrations (planner action).  
       - `agent.stream` (or `agent.run` with `stream: true`) to emit incremental updates.  
       - `tool.event.emit` for UI streaming via Vercel AI SDK bridge.  
       - `agent.waitForHuman()` to pause execution until the user approves or rejects.  
       - `agent.resume()` supplied with the human decision event to continue processing.  
   - Behaviors:
     - Never mutate canonical portfolio data without a confirmed session commit.
     - Preserve provenance (`source`, `userIntent`, `validatedBy`) on every staged asset.
     - Emit structured `operations` array with explicit status codes (`pending`, `ready`, `committed`, `rejected`) plus `requiresApproval` metadata.
     - Stream interim reasoning tokens (for Vercel AI SDK) so the UI can display progress mid-validation.
2. **Analytics Agent (later milestone)**
   - Goal: summarize performance, highlight concentration risk, and surface suggestions.
   - Tools mirror planner access with additional historical data once captured.
   - Triggered manually (“analyze today”) or via cron once the analytics loop is ready.

### 3. Data Surface
- `POMA_KV`
  - `portfolio:<user>` → canonical list of assets (id, schema metadata, quantities, notes).
  - `import-session:<sessionId>` → staged assets during AI/manual intake (status, pending questions, approval state).
- `LOGS_DO`
  - Durable Object that stores planner transcripts, confirmations, and audit trails.
- Human decision events (approve/reject) are captured and replayed to the agent via `agent.resume()` following the Cloudflare Agents HITL guide.
- Client fetches live prices directly; worker summaries return raw assets with zeroed price/value fields that the browser enriches.

### 4. Chat + Import Flow
1. User interacts in the Imports console at `/imports` (chat or CSV).
2. Browser sends `{ sessionId, messages }` to `/api/chat`.
3. Worker loads staged session data, forwards history + portfolio snapshot + session context to the planner through `agent.run` (streaming enabled).
4. Planner streams intermediate reasoning; when validations pass it calls `agent.waitForHuman()` with staged operations:
   ```json
   {
     "reply": "All set to import two assets. Confirm?",
     "operations": [
       { "type": "stage", "asset": { "...": "..." }, "status": "ready", "requiresApproval": true }
     ],
     "followUps": ["Need the Ethereum address checksum."],
     "nextAction": "WAIT_FOR_HUMAN",
     "waitForHuman": {
       "event": "portfolio_import.review",
       "payload": { "sessionId": "...", "operations": ["..."] }
     }
   }
   ```
5. Worker updates `import-session:<sessionId>` with staged rows and pending questions, returning `{ reply, operations, summary? }`.
6. UI renders approval controls; user response is posted to `/api/import-session/decision`, which resumes the agent run with `agent.resume({ event: "portfolio_import.review", data: { approved, notes } })`.
7. Approved assets trigger final `commit` operations persisted to `portfolio:<user>`; rejected assets capture notes and remain staged for revision.

### 5. Price + Analysis Loop
- Current milestone: prices fetched in-browser (CoinGecko crypto, gold API, manual stock placeholder). Worker does not cache prices.
- Future enhancement: daily cron to snapshot valuations and feed analytics agent. When enabled it will store `{ timestamp, totals, byAsset }` for charting and insights.

### 6. Headless UI Surfaces
- Application runs in headless mode so any frontend (vanilla HTML/CSS/JS, Svelte, React, or CLI) can consume the same APIs.
- **Portfolio view**
  - Pulls from `/api/portfolio` to render metrics, allocations, and holdings; price hydration handled client-side.
- **Import workspace**
  - Uses `/api/chat` and `/api/import-session` to drive conversational or manual staging flows and commit updates.
  - Displays staged assets with readiness status and handles “price pending” stock entries until equities pricing is wired.
- Implements the [Cloudflare Agents human-in-the-loop pattern](https://github.com/cloudflare/agents/tree/main/guides/human-in-the-loop): staged proposals surface Approve/Decline actions that feed the agent via `/api/import-session/decision`.

### 7. Agent Prompt Seeds
- **System**: “You are Portfolio Planner. Manage blockchain wallets (BTC/ETH/SOL), physical assets (gold troy ounces, USD cash), and stocks. Respond with JSON operations plus a concise human reply. Stage assets until data is validated.”
- **Instructions**:
  - Never hallucinate addresses or tickers; validate via tools or request clarification.
  - Reject unsupported chains or unknown asset types.
  - Quantities must be numeric; omit if unknown and ask for the value.
  - Reference existing assets by `id`/`label`.
  - Use follow-up questions until each staged asset is marked ready for import.

### 8. Next Steps Checklist
1. Finalize Worker bindings in `wrangler.jsonc` (`POMA_KV`, `LOGS_DO`, optional Workers AI).  
2. Implement Worker routes: `/`, `/imports`, `/api/portfolio`, `/api/chat`, `/api/import-session`.  
3. Landing pages: scaffold `src/ui/portfolio.html` and `src/ui/imports.html` with navigation and client-side price fetch.  
4. Implement import-session lifecycle utilities (create/update/commit/reject + decision webhook) shared with the planner.  
5. Document AI-assisted import walkthrough (CSV + chat) and add smoke tests for summary builder + staging helpers.  
6. Prepare for streaming responses (Vercel AI SDK planned next phase) by shaping `/api/chat` to optionally upgrade to stream transport and buffering partial replies until the client switches.
7. Implement Cloudflare HITL resume flow (`WAIT_FOR_HUMAN` + approval event) end-to-end.
