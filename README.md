# Invoice Radar

> Automated invoice tracking, payment reminders, and overdue flagging for freelancers and small agencies.

## Problem It Solves

Freelancers and agencies lose thousands of dollars each year to late payments — not because clients won't pay, but because nobody followed up. Invoice Radar monitors your invoices, automatically sends smart reminder emails (7 days before, 1 day before, on due date, and weekly after overdue), and gives you a real-time dashboard of what's owed, what's late, and what's been paid.

## Features

- Client and invoice management via REST API
- Smart reminder schedule: 7d before, 1d before, due date, every 7d overdue
- Overdue flagging with days-past-due calculation
- Mark invoices as paid with one API call
- Dashboard showing total pending, overdue, and paid this month
- Beautiful HTML reminder emails with invoice details
- Filter invoices by status (pending, overdue, paid)
- SQLite storage — zero-ops, works out of the box

## Tech Stack

- **Python 3.11+**
- **FastAPI** — REST API
- **APScheduler** — scheduled reminder sweeps
- **smtplib** — HTML email delivery
- **SQLite** — persistent storage

## Installation

```bash
git clone https://github.com/Everaldtah/invoice-radar.git
cd invoice-radar

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env with your SMTP credentials and business name
```

## Usage

### Start the server
```bash
uvicorn main:app --reload --port 8001
```

### Add a client
```bash
curl -X POST http://localhost:8001/clients \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "email": "billing@acme.com", "company": "Acme Corp"}'
```

### Create an invoice
```bash
curl -X POST http://localhost:8001/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_number": "INV-001",
    "client_id": 1,
    "amount": 3500.00,
    "currency": "USD",
    "description": "Website redesign — Phase 1",
    "issue_date": "2026-04-01",
    "due_date": "2026-04-30"
  }'
```

### Run reminder sweep manually
```bash
curl -X POST http://localhost:8001/reminders/run
```

### View dashboard
```bash
curl http://localhost:8001/dashboard
```

### Get overdue invoices
```bash
curl http://localhost:8001/invoices/overdue
```

### Mark invoice as paid
```bash
curl -X PATCH http://localhost:8001/invoices/1/mark-paid
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/clients` | Create a client |
| GET | `/clients` | List all clients |
| POST | `/invoices` | Create an invoice |
| GET | `/invoices` | List invoices (filter by status) |
| GET | `/invoices/overdue` | Get all overdue invoices |
| PATCH | `/invoices/{id}/mark-paid` | Mark as paid |
| POST | `/reminders/run` | Trigger reminder sweep |
| GET | `/dashboard` | Financial summary |

## Monetization Model

- **Free**: Up to 5 active invoices, manual reminders only
- **Solo ($12/mo)**: Unlimited invoices, automated reminders, dashboard
- **Agency ($39/mo)**: Multi-user, client portal, PDF invoice generation, Stripe integration
- **White-label**: Custom branding for accounting software vendors

## Why It Has Traction Potential

Freelancers are a massive, underserved market. The average US freelancer has 2–3 overdue invoices at any time. Tools like FreshBooks charge $17–$55/mo for a full suite — Invoice Radar is the focused, affordable alternative that does the one thing that matters most.
