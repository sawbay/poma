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
- Agent state (`PomaAgent.state`)
  - `portfolios[userId]` → canonical list of assets (id, schema metadata, quantities, notes) persisted inside the Durable Object SQLite store.
- `LOGS_DO`
  - Durable Object that stores planner transcripts, approvals, tool invocations, and audit trails.
- Human decision events (approve/reject) are captured and replayed to the agent via `agent.resume()` following the Cloudflare Agents HITL guide; on approval, the agent immediately calls write tools with the approved operations.
- Client fetches live prices directly; worker summaries return raw assets with zeroed price/value fields that the browser enriches.

### 4. Chat + Import Flow
1. On UI, it calls `POST /agents/poma/chat` (handled by `routeAgentRequest`).
2. `routeAgentRequest` instantiates `PomaAgent`, which pulls the latest history and wires up the server toolset via `createServerTools(this)`—portfolio read/write stubs, import helpers, balance lookups, and price quotes.
3. When the most recent message contains a human decision for `tool.portfolio.write`, `hasToolConfirmation` triggers the confirmation branch. `processToolCalls` replays the captured `part.input` into `executePortfolioWrite` only when the user replied with `APPROVAL.YES` (`"Yes, confirmed."`). A `"No, denied."` response short-circuits the write and streams the rejection back to the UI.
4. If there is no pending confirmation, `PomaAgent` streams model output by calling `streamText` with Workers AI (`this.env.AI`, `MODEL_NAME`) and the same toolset. The run is bounded with `stopWhen(stepCountIs(5))` to avoid runaway tool loops.
5. The streaming response is surfaced through `toUIMessageStreamResponse`, which enriches the payload with metadata (model id, creation timestamp, token usage) for the frontend.
6. The import process happens in HITL, it keeps asking user until the data is valid. Once valid, The agent proposes to use tool `tool.portfolio.write`.
7. Human approval is sent back as a UI message part with the tool name, original arguments, and confirmation text, for example:
   ```json
   {
     "type": "tool-tool.portfolio.write",
     "input": {
       "userId": "single-user",
       "operations": [
         { "type": "add", "asset": { "label": "Ledger wallet", "category": "blockchain", "chain": "bitcoin", "address": "..." } }
       ],
       "reason": "CSV import"
     },
     "output": "Yes, confirmed."
   }
   ```
   `processToolCalls` streams the portfolio write summary (e.g. `added 1, updated 0`) back to the UI, after which normal chat resumes to acknowledge the change or gather any remaining details.

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

### 7. Agent System Prompt
Use this base prompt when instantiating the planner agent:

```text
You are the POMA portfolio planner agent running on Cloudflare Agents.
- Mission: guide users through conversational imports of portfolio data and prepare safe, auditable `tool.portfolio.write` operations.
- Tooling: `tool.portfolio.read`, `tool.portfolio.write`, blockchain balance lookups, price quotes, and any helpers the runtime exposes.

Workflow:
1. Greet briefly, restate the user intent, and request any missing schema fields (asset type, chain/ticker, quantity, source).
2. Validate inputs by consulting tools; flag unresolved fields and tell the user exactly what you still need.
3. Keep the loop tight: stream concise updates, limit speculative tool calls, and avoid more than five tool invocations per turn unless new user data arrives.
4. Once every proposed change is validated, assemble an `operations` array (`add`, `update`, `remove`) with provenance metadata and call `agent.waitForHuman()` with a clear approval summary.
5. When resumed with approval, immediately call `tool.portfolio.write` using the previously proposed operations, then report the applied changes.

Rules:
- Never modify portfolio state without an explicit human approval event.
- Always explain pending requirements or follow-ups before pausing for approval.
- Surface conflicts or risky deltas and recommend clarification steps.
- Close each reply with the next action you expect from the user (data needed, confirmation, or acknowledgement of completion).
```

### 8. Next Steps Checklist
1. Finalize Worker bindings in `wrangler.jsonc` (`POMA_KV`, `LOGS_DO`, optional Workers AI).  
2. Implement Worker routes: `/`, `/imports`, `/api/portfolio`, `/api/chat`, decision webhook for `portfolio_import.review`.  
3. Landing pages: scaffold `src/ui/portfolio.html` and `src/ui/imports.html` with navigation and client-side price fetch.  
4. Implement decision handling utilities that log pending operations, resume the agent, and orchestrate `tool.portfolio.write` calls on approval.  
5. Document AI-assisted import walkthrough (CSV + chat) and add smoke tests for summary builder + write-path helpers.  
6. Prepare for streaming responses (Vercel AI SDK planned next phase) by shaping `/api/chat` to optionally upgrade to stream transport and buffering partial replies until the client switches.
7. Implement Cloudflare HITL resume flow (`WAIT_FOR_HUMAN` + approval event) end-to-end.
