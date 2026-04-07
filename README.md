# invoice-radar

> Vendor invoice & contract renewal tracker with automatic price-hike detection and renewal alerts for SMBs.

## The Problem

Finance teams and startup operators lose thousands of dollars yearly to:
- **Auto-renewals** they forgot to cancel or renegotiate
- **Silent price increases** buried in vendor invoices
- **Overdue invoices** causing late fees or service interruptions
- No single place to track all vendor contracts and spending

Excel spreadsheets break at scale. Enterprise tools like Coupa cost $50k+/year. There's a massive gap for SMBs (10–200 employees).

## Features

- **Vendor management** — Track all your software/service vendors in one place
- **Contract tracking** — Store renewal dates, amounts, billing cycles, auto-renew status
- **Invoice logging** — Record invoices and mark them paid
- **Price-hike detection** — Automatically flags when a new invoice is higher than the previous one
- **Renewal alerts** — Configurable notice window (7/14/30/60 days before renewal)
- **Overdue detection** — Daily cron flags unpaid past-due invoices
- **Email digests** — Morning email with all alerts (SMTP)
- **Dashboard summary** — Outstanding amounts, overdue count, upcoming renewals
- **REST API** — Integrate with your existing finance stack

## Tech Stack

- **Node.js 18+** / Express
- **SQLite** (via better-sqlite3, zero-config)
- **node-cron** — daily renewal check at 9am
- **nodemailer** — email alert digests

## Installation

```bash
git clone https://github.com/Everaldtah/invoice-radar
cd invoice-radar
npm install
cp .env.example .env
# Edit .env — set API_SECRET at minimum
```

## Running

```bash
# Development (auto-reload)
npm run dev

# Production
npm start

# Seed with demo data
node src/seed.js
```

## API Reference

All endpoints require `x-api-key` header except `/health` and `/`.

### Vendors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendors` | List all vendors with totals |
| GET | `/vendors/:id` | Get vendor + contracts + invoices |
| POST | `/vendors` | Create vendor |
| PUT | `/vendors/:id` | Update vendor |
| POST | `/vendors/:id/contracts` | Add contract to vendor |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/invoices` | List invoices (filter: vendor_id, paid, overdue) |
| POST | `/invoices` | Create invoice (auto-detects price increases) |
| PATCH | `/invoices/:id/pay` | Mark invoice as paid |
| GET | `/invoices/summary/dashboard` | Dashboard metrics |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/alerts` | List alerts (filter: acknowledged, severity) |
| PATCH | `/alerts/:id/ack` | Acknowledge alert |
| POST | `/alerts/ack-all` | Acknowledge all |

## Usage Example

```bash
# Create a vendor
curl -X POST http://localhost:3000/vendors \
  -H "x-api-key: changeme" -H "Content-Type: application/json" \
  -d '{"name": "Salesforce", "category": "crm", "contact_email": "billing@salesforce.com"}'

# Add a contract
curl -X POST http://localhost:3000/vendors/VENDOR_ID/contracts \
  -H "x-api-key: changeme" -H "Content-Type: application/json" \
  -d '{"description": "Salesforce Enterprise", "renewal_date": "2025-03-15", "amount": 12000, "notice_days": 60}'

# Log an invoice
curl -X POST http://localhost:3000/invoices \
  -H "x-api-key: changeme" -H "Content-Type: application/json" \
  -d '{"vendor_id": "VENDOR_ID", "amount": 14400, "invoice_date": "2025-01-01", "due_date": "2025-01-30"}'
# ↑ This will auto-create a price_increase alert (20% higher than $12000)

# Check unacknowledged alerts
curl http://localhost:3000/alerts?acknowledged=false -H "x-api-key: changeme"

# Dashboard
curl http://localhost:3000/invoices/summary/dashboard -H "x-api-key: changeme"
```

## Monetization Model

| Plan | Price | Features |
|------|-------|---------|
| **Free** | $0 | 5 vendors, 10 contracts, email alerts |
| **Starter** | $29/mo | 25 vendors, unlimited contracts, price-hike detection |
| **Business** | $79/mo | Unlimited vendors, CSV export, Slack alerts, multi-user |
| **Enterprise** | $299/mo | SSO, QuickBooks sync, audit trail, priority support |

**Target:** 300 SMB finance teams × $79/mo = **$23,700 MRR**

## License

MIT
