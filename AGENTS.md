## Portfolio Agent Brainstorm

### 1. Vision
- Conversational command center that lets users add blockchain addresses (BTC, ETH, SOL) or physical holdings (gold, USD) and keeps the portfolio in sync every day.
- Runs entirely on Cloudflare Workers + Agents so the same stack powers chat, orchestration, and background refresh.
- Ships a single vanilla HTML/CSS/JS page that calls Worker APIs for chat and data refresh; no SPA tooling required.

### 2. Core Agent Responsibilities
1. **Portfolio Planner Agent**
   - Goal: translate natural-language chat into structured portfolio mutations (add, adjust quantity, remove).
   - Tools:
     - `tool.portfolio.read` / `tool.portfolio.write` (KV bindings for state).
     - `tool.balance.bitcoin`, `tool.balance.ethereum`, `tool.balance.solana` (on-chain balance fetchers).
     - `tool.prices.quote` (CoinGecko/metal feed for BTC, ETH, SOL, GOLD, USD).
     - Optional D1 table tool for activity log snapshots.
   - Behaviors:
     - Inspect current holdings before planning.
     - Validate addresses/symbols; ask user for missing data.
     - Emit JSON operations (`add`, `update`, `remove`) that the Worker applies.
2. **Analytics Agent (optional second persona)**
   - Goal: summarize daily performance, highlight concentration risk, and surface suggestions.
   - Tools:
     - `tool.prices.quote` for fresh prices.
     - `tool.balance.*` to confirm live balances on demand.
     - Vector store / KV for historical analysis memory.
   - Triggers: manual (“analyze today”) or scheduled Worker cron job that lets the agent write a note back to KV/Durable Object.

### 3. Data Surface
- `POMA_KV`
  - `portfolio:<user>` → canonical list of assets (id, label, category, address/symbol, quantity).
  - `prices:latest` → `{ timestamp, BTC, ETH, SOL, GOLD, USD }`.
- `LOGS_DO` (Durable Object, optional)
  - Append chat instructions + resulting operations for auditability.
- `insights:<date>` → analytics snippets the agent can show on the dashboard or read back during chat.

### 4. Chat Flow (vanilla JS front end)
1. Browser posts `{ messages }` to `/api/chat`.
2. Worker forwards history + latest portfolio snapshot to Cloudflare Agent.
3. Agent decides plan → returns:
   ```json
   {
     "reply": "Baseline text to show user",
     "operations": [
       { "type": "add", "target": "bitcoin", "address": "...", "label": "Cold storage" },
       { "type": "update", "identifier": "gold", "quantity": 2.5 }
     ],
     "followUps": ["Need the exact SOL address for your staking wallet."]
   }
   ```
4. Worker mutates KV, recomputes summaries, and responds with `{ reply, operations, summary }`.
5. Front end updates the chat log, metrics cards, and pie chart (Canvas) with the new summary.

### 5. Price + Analysis Loop
- **Daily cron Worker**:
  1. Fetch BTC/ETH/SOL via CoinGecko (cached).
  2. Fetch gold via goldprice.org (fallback to previous value).
  3. Store snapshot in KV.
  4. Invoke Analytics Agent with `{ portfolio, prices }` to produce a note like “66% BTC, consider rebalancing.”
  5. Expose latest note at `/api/insights`.
- **Dashboard**:
  - On load: call `/api/portfolio` (summary + last analysis).
  - Every 24h or on demand: hit `/api/prices/refresh` (auth-protected) to force new data if needed.

### 6. Vanilla UI Sketch
- Sections:
  1. **Metrics strip** (total USD, blockchain vs physical split, last refresh).
  2. **Pie chart** (Canvas drawing) + list of allocations.
  3. **Holdings table** (label, type, quantity, price, value, status).
  4. **Insights panel** (latest analytics text).
  5. **Chat area** (textarea + send button, scrollable transcript).
- JS responsibilities:
  - Maintain `state.messages`.
  - `fetchPortfolio()` on load/reply to refresh UI.
  - Render operations feedback (“Added cold wallet”, “Removed legacy SOL address”).

### 7. Agent Prompt Seeds
- **System**: “You are Portfolio Planner, managing blockchain addresses (BTC/ETH/SOL) and physical assets (gold in troy ounces, USD cash). You must respond with JSON describing operations and a short human reply.”
- **Instructions**:
  - Never hallucinate addresses.
  - Reject unsupported chains.
  - Quantities are numbers; omit if unknown.
  - Prefer id/label/address when referencing existing assets.
  - Provide follow-up questions if info is missing.

### 8. Next Steps Checklist
1. Finalize KV + AI/Agent bindings in `wrangler.jsonc`.
2. Implement Worker routes: `/`, `/api/portfolio`, `/api/chat`, `/api/insights`, `/api/prices/refresh`.
3. Stand up cron worker invoking price job + analytics agent.
4. Polish vanilla UI (responsive grid, chart drawing, chat transcript).
5. Add smoke tests (Vitest) for operation application + summary builder.
