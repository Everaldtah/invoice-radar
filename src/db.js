'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'radar.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      contact_email TEXT,
      contact_name TEXT,
      website TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      description TEXT NOT NULL,
      start_date TEXT NOT NULL,
      renewal_date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      billing_cycle TEXT DEFAULT 'annual',  -- annual, monthly, quarterly
      auto_renews INTEGER DEFAULT 1,        -- 0 = false, 1 = true
      notice_days INTEGER DEFAULT 30,       -- days before renewal to alert
      status TEXT DEFAULT 'active',         -- active, cancelled, expired
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL REFERENCES vendors(id),
      contract_id TEXT REFERENCES contracts(id),
      invoice_number TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      paid INTEGER DEFAULT 0,
      paid_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,           -- renewal_upcoming, price_increase, overdue
      contract_id TEXT REFERENCES contracts(id),
      invoice_id TEXT REFERENCES invoices(id),
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'info', -- info, warning, critical
      acknowledged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('[db] Database initialized');
}

module.exports = { getDb, initDb };
