"""
Demo script: Seeds invoice data and tests Invoice Radar end-to-end.
Run: python demo.py (server must be running on port 8001)
"""

import requests
from datetime import date, timedelta

BASE = "http://localhost:8001"


def run_demo():
    print("=== Invoice Radar Demo ===\n")

    # Create clients
    print("1. Creating clients...")
    clients = [
        {"name": "Acme Corp", "email": "billing@acme.com", "company": "Acme Corporation"},
        {"name": "StartupXYZ", "email": "cfo@startupxyz.io", "company": "StartupXYZ Inc"},
        {"name": "Old Client LLC", "email": "accounts@oldclient.com", "company": "Old Client LLC"},
    ]
    client_ids = []
    for c in clients:
        r = requests.post(f"{BASE}/clients", json=c)
        data = r.json()
        client_ids.append(data["id"])
        print(f"   Created: {c['name']} (id={data['id']})")

    today = date.today()
    print("\n2. Creating invoices...")
    invoices = [
        {
            "invoice_number": "INV-001",
            "client_id": client_ids[0],
            "amount": 5000.00,
            "currency": "USD",
            "description": "Website redesign Phase 1",
            "issue_date": (today - timedelta(days=10)).isoformat(),
            "due_date": (today + timedelta(days=7)).isoformat(),
        },
        {
            "invoice_number": "INV-002",
            "client_id": client_ids[1],
            "amount": 1200.00,
            "currency": "USD",
            "description": "Monthly retainer — March",
            "issue_date": (today - timedelta(days=5)).isoformat(),
            "due_date": (today + timedelta(days=1)).isoformat(),
        },
        {
            "invoice_number": "INV-003",
            "client_id": client_ids[2],
            "amount": 800.00,
            "currency": "USD",
            "description": "Logo design",
            "issue_date": (today - timedelta(days=45)).isoformat(),
            "due_date": (today - timedelta(days=15)).isoformat(),
        },
    ]
    for inv in invoices:
        r = requests.post(f"{BASE}/invoices", json=inv)
        print(f"   {inv['invoice_number']} — ${inv['amount']} — due {inv['due_date']}")

    print("\n3. Dashboard snapshot:")
    r = requests.get(f"{BASE}/dashboard")
    data = r.json()
    for k, v in data.items():
        print(f"   {k}: {v}")

    print("\n4. Overdue invoices:")
    r = requests.get(f"{BASE}/invoices/overdue")
    data = r.json()
    for inv in data["overdue"]:
        print(f"   INV {inv['invoice_number']} — ${inv['amount']} — {inv['days_overdue']}d overdue")

    print("\n5. Running reminder sweep (sends emails if SMTP configured)...")
    r = requests.post(f"{BASE}/reminders/run")
    print(f"   {r.json()}")

    print("\n=== Demo complete! ===")


if __name__ == "__main__":
    run_demo()
