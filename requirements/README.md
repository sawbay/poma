# Portfolio Manager – Feature Requirements

This document outlines all features needed to build a full **CoinGecko‑style multi‑portfolio tracker**, including Overview dashboard, individual portfolio views, transactions, charts, and data pipelines.

---

## 1. Multi‑Portfolio Management
- Create, edit, rename, delete portfolios  
- Set default portfolio  
- Portfolio icon selector (emoji‑style)  
- Multiple portfolio categories supported:
  - **Crypto Hodl** (long‑term crypto holding)
  - **Hedge** (gold, USD, VND)
  - **Stocks** (US + VN)
  - **Crypto DCA** (short‑term systematic purchases)
- Switch portfolios easily via sidebar or dropdown navigation  

---

## 2. Portfolio Overview (Global Dashboard)

### 2.1 Global Metrics
- Aggregate **current balance** across all portfolios  
- Aggregate **24h change** (absolute & percentage)  
- Aggregate **total profit/loss since inception**  
- Identify **Top Performer** across all portfolios  

### 2.2 Global Holdings Visualization
- Holdings allocation donut chart (aggregated across all portfolios)  
- Clickable “View All” breakdown  

### 2.3 Global Performance Chart
- Interactive performance line chart  
- Selectable time ranges:
  - **24H**, **7D**, **1M**, **3M**, **1Y**
- Hover tooltips (timestamp + portfolio value)  

### 2.4 Portfolio Summary Cards (Mini Dashboards)
For each portfolio:
- Current balance  
- 24h change  
- Total profit/loss  
- Top performer  
- Mini allocation chart  
- Mini performance chart  

---

## 3. Individual Portfolio Dashboard

### 3.1 Summary Cards
- Current balance  
- 24h change (value + percentage)  
- Total profit/loss  
- Top performer (24h or chosen timeframe)  

### 3.2 Controls
- **Add Coin** modal  
- **Get Recommendations** (asset discovery)  
- **Customize** portfolio:
  - Rename  
  - Change base currency  
  - Toggle visibility of charts  
- **Share** (public read‑only link)  
- Toggle performance chart visibility  

### 3.3 Charts
- **Holdings donut chart**  
- **Portfolio performance line chart** (24H / 7D / 1M / 3M / 1Y)  
- Interactive hover tooltips  

### 3.4 Asset Table
Each asset row displays:
- Logo + symbol  
- Current price  
- 1h / 24h / 7d % change  
- 24h volume  
- Market cap  
- Sparkline (last 7 days)  
- Holdings quantity  
- Holdings value  
- PNL (profit/loss for that asset)  
- **Add Transaction** action button  
- Optional **Buy** button (exchange partner link)  

---

## 4. Transaction Logging System

Transaction modal includes **Buy**, **Sell**, **Transfer** tabs.

### 4.1 Buy Transaction
- Select asset  
- Total spent (fiat)  
- Quantity  
- Price per coin (auto‑calculate; “Use Market Price” option)  
- Date & time picker  
- Optional fees  
- Optional notes  

### 4.2 Sell Transaction
- Total received  
- Quantity (with **MAX** shortcut)  
- Price per coin (auto‑calculate; “Use Market Price”)  
- Date & time picker  
- Optional fees  
- Optional notes  

### 4.3 Transfer Transaction
- **Transfer In / Transfer Out** toggle  
- Quantity (with MAX shortcut)  
- Date & time picker  
- Fees (network gas optional)  
- Notes  

---

## 5. Security & UX
- Clear safety warnings:
  - Platform **does not execute trades**
  - Platform **does not custody assets**
- Tooltips and help links  
- Notices when charts or widgets are hidden  

---

## 6. Data & Backend Requirements

### 6.1 Unified Asset Registry
Must support:
- Cryptocurrencies  
- Fiat currencies  
- Gold / silver  
- US stocks  
- VN stocks  
- Tokenized stocks (e.g., Ondo MSFTON, AAPLON)  

### 6.2 Price Ingestion Pipeline
External providers:
- CoinGecko  
- Ondo Finance API  
- TradingEconomics (forex, gold, macro)  
- Finnhub / TwelveData (US stocks)  
- VN stock data source (SSI, SBV, or Cafef scraping)

### 6.3 Historical Snapshots
- Scheduled pipeline captures periodic prices (5m, hourly, daily)
- Used for performance charts
- Used for PNL + 24h change calculations  

### 6.4 PNL Calculation Service
Handles:
- Cost basis per transaction  
- Aggregated PNL per asset  
- Total PNL per portfolio  
- 24h change calculations  

### 6.5 Transaction History
- Per asset  
- Per portfolio  
- Editable (future feature)  

---

## 7. Optional Advanced Features
- Wallet / API syncing:
  - Binance, Coinbase, CEX API keys  
  - MetaMask / WalletConnect  
- Tax lot accounting (FIFO / LIFO / HIFO)  
- Auto‑categorization of transactions (DCA / trading / long‑term)  
- Benchmark comparison (vs BTC, S&P500, Gold, VN Index)  

---

This document is the full specification for building a production‑grade, CoinGecko‑style portfolio manager.
