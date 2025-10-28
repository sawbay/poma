# Portfolio Design

## Asset Model Goals
- Provide a unified shape that the worker, browser UI, and planner agent can share.
- Preserve source metadata (wallet address, exchange, custody) so AI-assisted imports can validate and enrich records.
- Support incremental enrichment: start with minimal fields, allow AI/import flows to attach optional context later.

## Shared Fields
| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID) | Canonical identifier stored in KV and referenced by planner operations. |
| `category` | `"blockchain" \| "physical" \| "stock"` | Drives downstream handling, valuation, and validation. |
| `label` | string | Human readable name shown in tables/charts (e.g., “Cold BTC”, “iShares Gold”). |
| `createdAt` | ISO string | Timestamp when the asset record was first stored. |
| `tags` | string[] | Optional descriptors applied during import (e.g., `["imported:csv", "custody:ledger"]`). |
| `notes` | string? | Freeform AI/user annotations captured during planning. |

## Blockchain Assets
| Field | Type | Description |
| --- | --- | --- |
| `chain` | `"bitcoin" \| "ethereum" \| "solana"` (extensible) | Enumerated chain identifier for balance tooling. |
| `address` | string | Normalized address or xpub; planner must validate format before commit. |
| `custody` | `"self_custody" \| "exchange" \| "unknown"` | Helps AI suggest security guidance. |
| `derivationPath` | string? | Optional HD path if supplied during import. |
| `quantity` | number? | Persisted snapshot quantity (optional—live balance fetch preferred). |
| `source` | `"manual" \| "ai-import" \| "synced"` | Indicates how the asset entered the system. |

### Import Considerations
- AI planner should call `tool.balance.*` to confirm the address before marking status `ok`.
- If CSV import lacks chain metadata, planner follows up with the user before writing.
- `quantity` is optional to keep compatibility with live balance refresh; if provided, UI treats as hint until confirmed.

## Physical Assets
| Field | Type | Description |
| --- | --- | --- |
| `symbol` | `"GOLD" \| "USD" \| string` | Commodity or currency code; allow extension for silver, cash variants. |
| `unit` | `"troy_oz" \| "grams" \| "unit"` | Clarifies quantity semantics. |
| `quantity` | number | Amount in unit terms. |
| `costBasis` | number? | Optional USD cost basis. |
| `location` | string? | Storage description (e.g., “Home safe”, “Bank vault”). |

### Import Considerations
- AI import reads natural language (“2oz gold in safe”) and maps to `symbol = "GOLD"`, `unit = "troy_oz"`.
- For cash, `unit` defaults to `"unit"` and `symbol` holds ISO currency (`USD`, `EUR`).
- Planner can prompt for missing unit if ambiguous (“5 gold”).

## Stock Assets
| Field | Type | Description |
| --- | --- | --- |
| `ticker` | string | Exchange ticker without suffix (e.g., `AAPL`). |
| `exchange` | string | MIC or friendly name (e.g., `NASDAQ`). |
| `quantity` | number | Number of shares held. |
| `currency` | string | Quote currency (USD, GBP, etc.). |
| `costBasis` | number? | Aggregate cost basis in quote currency. |
| `portfolioAccount` | string? | Optional brokerage/account tag. |

### Import Considerations
- CSV uploads may contain tickers and ISINs; planner prefers tickers, stores ISIN in `tags` if present.
- AI should validate ticker via lookup tool (future) or flag as pending verification.
- Support fractional shares by allowing decimal `quantity`.

## Derived Snapshot Structure
- Live prices are fetched client-side; valuations stored transiently in UI layer.
- Worker summary returns raw asset records with zeroed price/value; front end multiplies by fetched price map.
- Historical analytics (later milestone) can persist daily valuations keyed by asset `id`.

## AI Workflow Notes
1. User uploads CSV or describes holdings.  
2. Planner normalizes rows into the schema above, asking clarifying questions (unit, chain, ticker).  
3. Natural-language chat loop continues until every asset candidate passes validation (address checksum, ticker lookup, physical unit). The planner must explicitly confirm readiness (“Ready to import <n> assets”) before the worker applies mutations.  
4. Validated assets staged in memory with `source = "ai-import"` and only written to KV after user confirmation.  
5. Agent attaches `notes` summarizing import context for audit logs.
