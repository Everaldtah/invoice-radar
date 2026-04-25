"""
invoice-radar: Invoice tracking, automated payment reminders, and overdue flagging
for freelancers and small agencies.
"""

import os
import sqlite3
import smtplib
from datetime import datetime, date, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler

app = FastAPI(title="Invoice Radar", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FREELANCER_NAME = os.getenv("FREELANCER_NAME", "Your Business")
DB_PATH = os.getenv("DB_PATH", "invoices.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            company TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            client_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            description TEXT,
            issue_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            reminder_count INTEGER DEFAULT 0,
            last_reminder_at TEXT,
            paid_at TEXT,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        )
    """)
    conn.commit()
    conn.close()


init_db()


class ClientCreate(BaseModel):
    name: str
    email: str
    company: Optional[str] = None


class InvoiceCreate(BaseModel):
    invoice_number: str
    client_id: int
    amount: float
    currency: str = "USD"
    description: Optional[str] = None
    issue_date: str
    due_date: str


class InvoiceUpdate(BaseModel):
    status: str


def send_reminder_email(client_email: str, client_name: str, invoice_number: str,
                         amount: float, currency: str, due_date: str, days_overdue: int):
    msg = MIMEMultipart("alternative")

    if days_overdue > 0:
        subject = f"OVERDUE ({days_overdue}d): Invoice {invoice_number} — {currency} {amount:.2f}"
        urgency = f"This invoice is now **{days_overdue} days overdue**."
        color = "#e74c3c"
    else:
        days_until = abs(days_overdue)
        subject = f"Payment Reminder: Invoice {invoice_number} due in {days_until} day(s)"
        urgency = f"Your invoice is due in **{days_until} day(s)**."
        color = "#f39c12"

    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:{color}">Payment Reminder</h2>
      <p>Dear {client_name},</p>
      <p>{urgency.replace('**', '<strong>').replace('**', '</strong>')}</p>
      <table style="border-collapse:collapse;width:100%;margin:20px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Invoice #</strong></td>
            <td style="padding:8px;border:1px solid #ddd">{invoice_number}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount Due</strong></td>
            <td style="padding:8px;border:1px solid #ddd;color:{color}">
              <strong>{currency} {amount:.2f}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Due Date</strong></td>
            <td style="padding:8px;border:1px solid #ddd">{due_date}</td></tr>
      </table>
      <p>Please process payment at your earliest convenience.</p>
      <p>Best regards,<br><strong>{FREELANCER_NAME}</strong></p>
    </div>
    """

    msg["Subject"] = subject
    msg["From"] = SMTP_USER or "noreply@invoice-radar.app"
    msg["To"] = client_email
    msg.attach(MIMEText(html, "html"))

    if not SMTP_USER or not SMTP_PASS:
        print(f"[SMTP not configured] Would send reminder to {client_email}: {subject}")
        return False

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, client_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[invoice-radar] Email error: {e}")
        return False


def run_reminder_sweep():
    """Check all pending invoices and send reminders as needed."""
    conn = get_db()
    today = date.today()
    invoices = conn.execute("""
        SELECT i.*, c.name as client_name, c.email as client_email
        FROM invoices i JOIN clients c ON i.client_id = c.id
        WHERE i.status IN ('pending', 'overdue')
    """).fetchall()

    reminded = []
    for inv in invoices:
        due = date.fromisoformat(inv["due_date"])
        days_overdue = (today - due).days

        # Update status
        if days_overdue > 0 and inv["status"] == "pending":
            conn.execute("UPDATE invoices SET status = 'overdue' WHERE id = ?", (inv["id"],))

        # Reminder logic: 7 days before, 1 day before, on due date, then every 7 days overdue
        should_remind = False
        days_until = -days_overdue

        if days_until in (7, 1, 0):
            should_remind = True
        elif days_overdue > 0 and days_overdue % 7 == 0:
            should_remind = True

        if should_remind:
            sent = send_reminder_email(
                inv["client_email"], inv["client_name"],
                inv["invoice_number"], inv["amount"], inv["currency"],
                inv["due_date"], days_overdue
            )
            if sent:
                conn.execute(
                    "UPDATE invoices SET reminder_count = reminder_count + 1, last_reminder_at = ? WHERE id = ?",
                    (datetime.utcnow().isoformat(), inv["id"])
                )
                reminded.append(inv["invoice_number"])

    conn.commit()
    conn.close()
    return reminded


@app.post("/clients", status_code=201)
def create_client(client: ClientCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO clients (name, email, company, created_at) VALUES (?, ?, ?, ?)",
        (client.name, client.email, client.company, datetime.utcnow().isoformat())
    )
    conn.commit()
    client_id = cur.lastrowid
    conn.close()
    return {"id": client_id, "name": client.name, "email": client.email}


@app.get("/clients")
def list_clients():
    conn = get_db()
    rows = conn.execute("SELECT * FROM clients").fetchall()
    conn.close()
    return {"clients": [dict(r) for r in rows]}


@app.post("/invoices", status_code=201)
def create_invoice(invoice: InvoiceCreate):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO invoices (invoice_number, client_id, amount, currency, description, "
            "issue_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (invoice.invoice_number, invoice.client_id, invoice.amount,
             invoice.currency, invoice.description, invoice.issue_date, invoice.due_date)
        )
        conn.commit()
        inv_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Invoice number already exists")
    finally:
        conn.close()
    return {"id": inv_id, "invoice_number": invoice.invoice_number, "status": "pending"}


@app.get("/invoices")
def list_invoices(status: Optional[str] = None):
    conn = get_db()
    if status:
        rows = conn.execute(
            "SELECT i.*, c.name as client_name, c.email as client_email "
            "FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.status = ?",
            (status,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT i.*, c.name as client_name, c.email as client_email "
            "FROM invoices i JOIN clients c ON i.client_id = c.id ORDER BY i.due_date ASC"
        ).fetchall()
    conn.close()
    return {"invoices": [dict(r) for r in rows]}


@app.get("/invoices/overdue")
def get_overdue():
    conn = get_db()
    today = date.today().isoformat()
    rows = conn.execute(
        "SELECT i.*, c.name as client_name, c.email as client_email, "
        "CAST(julianday(?) - julianday(i.due_date) AS INTEGER) as days_overdue "
        "FROM invoices i JOIN clients c ON i.client_id = c.id "
        "WHERE i.status IN ('pending','overdue') AND i.due_date < ? "
        "ORDER BY days_overdue DESC",
        (today, today)
    ).fetchall()
    conn.close()
    return {"overdue": [dict(r) for r in rows], "count": len(rows)}


@app.patch("/invoices/{invoice_id}/mark-paid")
def mark_paid(invoice_id: int):
    conn = get_db()
    conn.execute(
        "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?",
        (datetime.utcnow().isoformat(), invoice_id)
    )
    conn.commit()
    conn.close()
    return {"status": "paid", "invoice_id": invoice_id}


@app.post("/reminders/run")
def trigger_reminders(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_reminder_sweep)
    return {"status": "reminder_sweep_queued"}


@app.get("/dashboard")
def dashboard():
    conn = get_db()
    today = date.today().isoformat()
    stats = {}
    stats["total_pending"] = conn.execute(
        "SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='pending'"
    ).fetchone()[0]
    stats["total_overdue"] = conn.execute(
        "SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='overdue'"
    ).fetchone()[0]
    stats["total_paid_this_month"] = conn.execute(
        "SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='paid' AND paid_at LIKE ?",
        (f"{date.today().strftime('%Y-%m')}%",)
    ).fetchone()[0]
    stats["overdue_count"] = conn.execute(
        "SELECT COUNT(*) FROM invoices WHERE status='overdue'"
    ).fetchone()[0]
    stats["pending_count"] = conn.execute(
        "SELECT COUNT(*) FROM invoices WHERE status='pending'"
    ).fetchone()[0]
    conn.close()
    return stats


@app.get("/health")
def health():
    return {"status": "ok", "service": "invoice-radar", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
