## Portfolio Monitor Assistant Plan (Milestone 1)

### 1. Vision
- Single-user Cloudflare Worker that tracks blockchain wallets (BTC, ETH, SOL) and physical holdings (gold, USD).
- Minimal vanilla HTML/CSS/JS UI for the portfolio overview and import console.
- JSON APIs for portfolio summary and chat-driven updates.
- KV as the only persistence layer for portfolio state plus cached prices.
- Chat commands use Workers AI when available, with a rule-based fallback during development.

### 2. Core Responsibilities
1. **Chat + Import Orchestrator**
   - Parse chat or import hints into portfolio mutations (`add`, `update`, `remove`).
   - Validate required fields (chain, address, unit, quantity) and ask follow-up questions when missing.
   - Use Workers AI when configured; otherwise rely on deterministic heuristic parsing.
2. **Portfolio Summary API**
   - Return holdings summary for the dashboard UI.
   - Include cached price data when available; otherwise mark as pending.
3. **Price Cache Maintenance**
   - Store last-known quotes in KV with timestamps for reuse in the UI.
   - Optional cron trigger to refresh prices daily (per `wrangler.jsonc`).

### 3. Data Surface (KV)
- `POMA_KV`
  - `portfolio:single-user` → canonical holdings + metadata.
  - `prices:*` → cached quotes and timestamps (if used).
  - `import-session:*` → staged import data (optional).

### 4. UI + API Routes
- `/` → portfolio overview (metrics, chart, holdings, manual refresh).
- `/imports` → import console (AI/manual intake, chat controls).
- `GET /api/portfolio` → current holdings summary.
- `POST /api/chat` → chat-driven mutations (`{ messages: [...] }`).
- `POST /api/import-session` → (stub) manage staged import data.

### 5. Chat + Import Flow
1. UI posts user messages to `/api/chat`.
2. Worker selects Workers AI when configured; otherwise runs the fallback parser.
3. Response returns either proposed changes or precise follow-up questions.
4. Accepted mutations are persisted in `POMA_KV` for `portfolio:single-user`.

### 6. Workers AI Prompt (Baseline)
Use this base prompt when the Workers AI runtime is enabled:

```text
You are the Portfolio Monitor Assistant.
- Mission: help the single user add, update, or remove holdings for BTC, ETH, SOL wallets and physical holdings (gold, USD).
- Always ask for any missing fields (asset type, chain, address, quantity, unit).
- Return concise, structured mutations so the worker can apply them safely.
- If unsure or conflicting data appears, ask a clarification question before proposing writes.
```

### 7. Next Steps Checklist
1. Confirm `POMA_KV` namespace bindings in `wrangler.jsonc`.
2. Implement `/api/portfolio` to return the single-user summary.
3. Implement `/api/chat` with Workers AI + rule-based fallback.
4. Flesh out `/imports` with staging UI that calls `/api/import-session`.
5. Add optional cron trigger for daily price refresh.
