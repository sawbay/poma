## Portfolio Agent Plan

### 1. Vision
- Conversational command center that lets users import blockchain addresses (BTC, ETH, SOL), physical holdings (gold, USD), and equity positions, keeping the portfolio current through AI-assisted workflows.
- Runs entirely on Cloudflare Workers + Agents; the same stack powers chat, orchestration, and background automation.
- Ships lightweight vanilla HTML/CSS/JS experiences for both the live portfolio view and the import console—no SPA tooling required.
- Uses [Cloudflare Agents](https://developers.cloudflare.com/agents/api-reference/) as the execution backend so agent tooling, streaming, and orchestration run within the Workers platform.

### 2. Core Agent Responsibilities
1. **Portfolio Planner Agent**
   - Goal: orchestrate end-to-end intake of portfolio data—parsing chat, CSV, or API hints—and transform them into safe, auditable mutations (`add`, `update`, `remove`) using Cloudflare Agents runtime primitives with a built-in human-in-the-loop checkpoint before applying writes.
   - Capabilities:
     - **State awareness**: snapshot portfolio state before planning; diff proposed changes; highlight conflicts.
     - **Validation pipeline**:
       1. Identify asset type (blockchain, physical, stock) using heuristics + prior context.  
       2. Call balance/quote tools or external validators; flag unresolved fields with actionable prompts.  
       3. Enforce schema completeness (chain, address, unit, quantity, ticker) prior to readiness.
     - **Human-in-the-loop**: invoke `agent.waitForHuman()` when ready for approval, passing a payload summarizing the exact operations the agent will execute once the human signals approval via tool calls.
     - **User guidance**: explain each required follow-up, provide examples, and summarize expected writes before routing to human approval.
   - Tooling (Cloudflare Agent toolkit IDs):
     - `tool.portfolio.read` / `tool.portfolio.write` → KV state access.
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
     - Never mutate canonical portfolio data until the human explicitly approves the queued operations.
     - Preserve provenance (`source`, `userIntent`, `validatedBy`) on every applied asset change.
     - Emit a structured `operations` array detailing the exact writes (`add`, `update`, `remove`) and metadata required to replay or audit human decisions.
     - Stream interim reasoning tokens (for Vercel AI SDK) so the UI can display progress mid-validation.
2. **Analytics Agent (later milestone)**
   - Goal: summarize performance, highlight concentration risk, and surface suggestions.
   - Tools mirror planner access with additional historical data once captured.
   - Triggered manually (“analyze today”) or via cron once the analytics loop is ready.

### 3. Data Surface
- `POMA_KV`
  - `portfolio:<user>` → canonical list of assets (id, schema metadata, quantities, notes).
- `LOGS_DO`
  - Durable Object that stores planner transcripts, approvals, tool invocations, and audit trails.
- Human decision events (approve/reject) are captured and replayed to the agent via `agent.resume()` following the Cloudflare Agents HITL guide; on approval, the agent immediately calls write tools with the approved operations.
- Client fetches live prices directly; worker summaries return raw assets with zeroed price/value fields that the browser enriches.

### 4. Chat + Import Flow
1. User interacts in the Imports console at `/imports` (chat or CSV).
2. Browser sends `{ sessionId, messages }` to `/api/chat`.
3. Worker loads portfolio snapshot and conversation context, then forwards history + portfolio state + session metadata to the planner through `agent.run` (streaming enabled).
4. Planner streams intermediate reasoning; when validations pass it calls `agent.waitForHuman()` with the exact operations it will execute once approved:
   ```json
   {
     "reply": "All set to import two assets. Confirm?",
     "operations": [
       { "type": "add", "asset": { "...": "..." }, "requiresApproval": true },
       { "type": "update", "assetId": "...", "changes": { "...": "..." }, "requiresApproval": true }
     ],
     "followUps": ["Need the Ethereum address checksum."],
     "nextAction": "WAIT_FOR_HUMAN",
     "waitForHuman": {
       "event": "portfolio_import.review",
       "payload": { "sessionId": "...", "operations": ["..."] }
     }
   }
   ```
5. Worker returns `{ reply, operations, followUps }` to the client and logs the pending decision in `LOGS_DO`.
6. UI renders approval controls; user response is posted to the decision endpoint (e.g. `/api/portfolio/decision`), which resumes the agent run with `agent.resume({ event: "portfolio_import.review", data: { approved, notes } })`.
7. On approval, the agent immediately invokes `tool.portfolio.write` with the queued operations and emits a confirmation reply; on rejection, it records the notes and requests additional inputs without applying any writes.

### 5. Price + Analysis Loop
- Current milestone: prices fetched in-browser (CoinGecko crypto, gold API, manual stock placeholder). Worker does not cache prices.
- Future enhancement: daily cron to snapshot valuations and feed analytics agent. When enabled it will store `{ timestamp, totals, byAsset }` for charting and insights.

### 6. Headless UI Surfaces
- Application runs in headless mode so any frontend (vanilla HTML/CSS/JS, Svelte, React, or CLI) can consume the same APIs.
- **Portfolio view**
  - Pulls from `/api/portfolio` to render metrics, allocations, and holdings; price hydration handled client-side.
- **Import workspace**
  - Uses `/api/chat` to drive conversational commit updates.
  - Displays proposed operations awaiting approval and handles “price pending” stock entries until equities pricing is wired.
  - Implements the [Cloudflare Agents human-in-the-loop pattern](https://github.com/cloudflare/agents/tree/main/guides/human-in-the-loop): proposals surface Approve/Decline actions that resume the agent to apply tool-based writes.

### 7. Agent Prompt Seeds
- **System**: “You are Portfolio Planner. Manage blockchain wallets (BTC/ETH/SOL), physical assets (gold troy ounces, USD cash), and stocks. Respond with JSON operations plus a concise human reply. Do not call write tools until the human approves the proposed operations.”
- **Instructions**:
  - Never hallucinate addresses or tickers; validate via tools or request clarification.
  - Reject unsupported chains or unknown asset types.
  - Quantities must be numeric; omit if unknown and ask for the value.
  - Reference existing assets by `id`/`label`.
  - Use follow-up questions until each proposed operation has all required fields and validation.

### 8. Next Steps Checklist
1. Finalize Worker bindings in `wrangler.jsonc` (`POMA_KV`, `LOGS_DO`, optional Workers AI).  
2. Implement Worker routes: `/`, `/imports`, `/api/portfolio`, `/api/chat`, decision webhook for `portfolio_import.review`.  
3. Landing pages: scaffold `src/ui/portfolio.html` and `src/ui/imports.html` with navigation and client-side price fetch.  
4. Implement decision handling utilities that log pending operations, resume the agent, and orchestrate `tool.portfolio.write` calls on approval.  
5. Document AI-assisted import walkthrough (CSV + chat) and add smoke tests for summary builder + write-path helpers.  
6. Prepare for streaming responses (Vercel AI SDK planned next phase) by shaping `/api/chat` to optionally upgrade to stream transport and buffering partial replies until the client switches.
7. Implement Cloudflare HITL resume flow (`WAIT_FOR_HUMAN` + approval event) end-to-end.
