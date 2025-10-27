## Portfolio Monitor Assistant (Milestone 1)

Single-user Cloudflare Worker that tracks blockchain wallets (BTC, ETH, SOL) and physical holdings (gold, USD). The worker serves a vanilla HTML/CSS/JS dashboard, exposes JSON APIs, and stores state plus cached prices in KV. Chat commands are handled through Workers AI when available, with a rule-based fallback so the workflow still operates during development.

### Prerequisites
1. Node.js 18+
2. Cloudflare account with Workers + KV access
3. Wrangler CLI (`npm install -g wrangler` or use the local devDependency)

### Setup
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Provision KV namespaces**
   ```bash
   npx wrangler kv:namespace create POMA_KV
   npx wrangler kv:namespace create POMA_KV --preview --env=dev
   ```
   Replace the `id` and `preview_id` values in `wrangler.jsonc`.
3. (Optional) **Configure cron trigger**  
   Add the following to `wrangler.jsonc` to refresh prices daily:
   ```jsonc
   "triggers": { "crons": ["0 2 * * *"] }
   ```

### Local development
```bash
npm run dev
```
This runs `wrangler dev`, serving the dashboard at `http://localhost:8787`. APIs:
- `GET /api/portfolio` – current holdings summary
- `POST /api/chat` – chat-driven mutations (`{ messages: [...] }`)
- `POST /api/prices/refresh` – force a price fetch and summary rebuild

### Deploy
Once satisfied locally:
```bash
npm run deploy
```

### Notes
- System currently supports a **single user**. Portfolio data lives in `portfolio:single-user`.
- The chat planner uses Workers AI when configured; otherwise it falls back to heuristic parsing so you can still demo the UI.
