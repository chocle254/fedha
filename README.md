# 💚 Fedha — Personal Finance App

A beautiful offline-first PWA for tracking money, wallets, budgets, loans and savings goals. Works fully offline and optionally syncs to Supabase when online.

---

## ✨ Features

- **Multiple Wallets** — M-Pesa, Bank, Cash, Airtel Money (and custom)
- **Transactions** — Income, expense, and wallet-to-wallet transfers
- **Budget Envelopes** — Set spending limits per category with live progress bars
- **Income Planner** — Plan how you'll allocate money before it arrives
- **Loan Tracker** — Track money you owe and money owed to you, with due dates
- **Savings Goals** — Set targets, contribute, and track progress
- **Charts & Reports** — 7-day, monthly, 6-month trends, category pie chart
- **Net Worth Tracker** — Full assets vs liabilities breakdown
- **Impulse Spend Flag** — Mark purchases as impulse for self-awareness
- **PDF & CSV Export** — Download full financial reports
- **Multi-currency** — KES, USD, EUR, GBP, UGX, TZS
- **Offline First** — All data stored in IndexedDB, works with no internet
- **PWA Installable** — Add to home screen on Android or iOS
- **Optional Cloud Sync** — Supabase integration for backup and multi-device

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment (optional — for Supabase sync)
```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL and anon key
```

The app works 100% offline without Supabase. Only add Supabase if you want cloud backup.

### 3. Run in development
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to Vercel

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option B — GitHub
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Add environment variables (optional):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click Deploy

---

## 📱 Install on Your Phone

### Android (Chrome)
1. Open your Vercel URL in Chrome
2. Tap the menu (⋮) → "Add to Home Screen"
3. Tap "Install"

### iOS (Safari)
1. Open your Vercel URL in Safari
2. Tap Share (📤) → "Add to Home Screen"
3. Tap "Add"

The app will work offline after the first load.

---

## 🗄️ Supabase Setup (Optional)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste contents of `supabase-schema.sql` → Run
3. Copy your Project URL and anon key from **Settings → API**
4. Paste into `.env.local` (local) or Vercel environment variables (production)

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 |
| Styling | Tailwind CSS + custom CSS variables |
| Offline DB | IndexedDB via `idb` |
| Cloud DB | Supabase (optional) |
| Charts | Recharts |
| PWA | next-pwa |
| PDF Export | jsPDF + jspdf-autotable |
| IDs | uuid |
| Dates | date-fns |

---

## 📂 Project Structure

```
fedha/
├── components/
│   ├── Layout.js          # Bottom nav + FAB
│   └── TransactionModal.js # Add transaction sheet
├── context/
│   └── AppContext.js       # Global state + all DB operations
├── lib/
│   ├── db.js              # IndexedDB (offline storage)
│   ├── supabase.js        # Supabase client (optional sync)
│   └── utils.js           # Currencies, categories, formatters, charts
├── pages/
│   ├── index.js           # Dashboard
│   ├── transactions.js    # Full transaction list
│   ├── wallets.js         # Wallet balances & management
│   ├── budgets.js         # Envelopes + income plans + loans
│   ├── goals.js           # Savings goals
│   └── reports.js         # Charts, PDF/CSV export, net worth
├── styles/
│   └── globals.css        # Dark navy theme
├── public/
│   └── manifest.json      # PWA manifest
└── supabase-schema.sql    # Run this in Supabase SQL editor
```

---

## 💡 Tips

- Tap any transaction to delete it (balance is automatically reversed)
- The **+** button on every screen opens the quick-add transaction sheet
- Mark expenses as ⚡ **impulse** to track unplanned spending patterns
- Use **Income Plans** to budget your salary *before* it arrives
- The **Reports → Net Worth** tab gives a full snapshot of your financial health
