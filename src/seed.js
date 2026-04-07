'use strict';

/**
 * seed.js — Populate the database with sample data for demo purposes.
 * Run: node src/seed.js
 */

require('dotenv').config();
const { initDb, getDb } = require('./db');
const { v4: uuidv4 } = require('uuid');

initDb();
const db = getDb();

const vendors = [
  { name: 'AWS', category: 'infrastructure', contact_email: 'billing@amazon.com', website: 'https://aws.amazon.com' },
  { name: 'GitHub', category: 'devtools', contact_email: 'billing@github.com', website: 'https://github.com' },
  { name: 'Zendesk', category: 'support', contact_email: 'billing@zendesk.com', website: 'https://zendesk.com' },
  { name: 'HubSpot', category: 'crm', contact_email: 'billing@hubspot.com', website: 'https://hubspot.com' },
  { name: 'Figma', category: 'design', contact_email: 'billing@figma.com', website: 'https://figma.com' },
];

const vendorIds = [];
for (const v of vendors) {
  const id = uuidv4();
  vendorIds.push(id);
  db.prepare(`
    INSERT OR IGNORE INTO vendors (id, name, category, contact_email, website)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, v.name, v.category, v.contact_email, v.website);
}

// Contracts with various renewal dates (some soon)
const today = new Date();
const in5Days = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0];
const in20Days = new Date(today.getTime() + 20 * 86400000).toISOString().split('T')[0];
const in90Days = new Date(today.getTime() + 90 * 86400000).toISOString().split('T')[0];

const contracts = [
  { vendor: 0, description: 'AWS Enterprise Support', renewal_date: in5Days, amount: 4800, billing_cycle: 'annual', notice_days: 14 },
  { vendor: 1, description: 'GitHub Enterprise', renewal_date: in20Days, amount: 2400, billing_cycle: 'annual', notice_days: 30 },
  { vendor: 2, description: 'Zendesk Suite Pro', renewal_date: in90Days, amount: 1800, billing_cycle: 'annual', notice_days: 30 },
  { vendor: 3, description: 'HubSpot Marketing Hub', renewal_date: in90Days, amount: 9600, billing_cycle: 'annual', notice_days: 60 },
  { vendor: 4, description: 'Figma Organization Plan', renewal_date: in20Days, amount: 1440, billing_cycle: 'annual', notice_days: 30 },
];

const contractIds = [];
for (const c of contracts) {
  const id = uuidv4();
  contractIds.push(id);
  db.prepare(`
    INSERT OR IGNORE INTO contracts (id, vendor_id, description, start_date, renewal_date, amount, billing_cycle, auto_renews, notice_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, vendorIds[c.vendor], c.description, '2024-01-01', c.renewal_date, c.amount, c.billing_cycle, c.notice_days);
}

// Sample invoices (including one price increase)
const pastMonth = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0];
const overdueDate = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
const nextWeek = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

db.prepare(`INSERT INTO invoices (id, vendor_id, contract_id, invoice_number, amount, invoice_date, due_date, paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
  .run(uuidv4(), vendorIds[0], contractIds[0], 'AWS-2024-001', 380.50, pastMonth, overdueDate, 1);

db.prepare(`INSERT INTO invoices (id, vendor_id, contract_id, invoice_number, amount, invoice_date, due_date, paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
  .run(uuidv4(), vendorIds[0], contractIds[0], 'AWS-2024-002', 520.75, today.toISOString().split('T')[0], nextWeek);

// Overdue invoice
db.prepare(`INSERT INTO invoices (id, vendor_id, invoice_number, amount, invoice_date, due_date, paid)
  VALUES (?, ?, ?, ?, ?, ?, 0)`)
  .run(uuidv4(), vendorIds[2], 'ZD-2024-001', 150.00, pastMonth, overdueDate);

console.log('✅ Seed data inserted successfully!');
console.log(`   ${vendors.length} vendors, ${contracts.length} contracts, 3 invoices`);
console.log('\nRun the renewal checker to generate alerts:');
console.log('  node -e "require(\'./src/services/renewalChecker\').checkRenewals()"');
