'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

// List invoices (with optional filters)
router.get('/', (req, res) => {
  const db = getDb();
  const { vendor_id, paid, overdue } = req.query;
  let query = `
    SELECT i.*, v.name as vendor_name
    FROM invoices i
    JOIN vendors v ON v.id = i.vendor_id
    WHERE 1=1
  `;
  const params = [];

  if (vendor_id) { query += ' AND i.vendor_id = ?'; params.push(vendor_id); }
  if (paid !== undefined) { query += ' AND i.paid = ?'; params.push(paid === 'true' ? 1 : 0); }
  if (overdue === 'true') {
    query += " AND i.paid = 0 AND i.due_date < date('now')";
  }

  query += ' ORDER BY i.invoice_date DESC LIMIT 100';
  res.json(db.prepare(query).all(...params));
});

// Get single invoice
router.get('/:id', (req, res) => {
  const db = getDb();
  const inv = db.prepare(`
    SELECT i.*, v.name as vendor_name
    FROM invoices i JOIN vendors v ON v.id = i.vendor_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

// Create invoice
router.post('/', (req, res) => {
  const { vendor_id, contract_id, invoice_number, amount, currency, invoice_date, due_date, notes } = req.body;
  if (!vendor_id || amount == null || !invoice_date) {
    return res.status(400).json({ error: 'vendor_id, amount, and invoice_date are required' });
  }

  const db = getDb();
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vendor_id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO invoices (id, vendor_id, contract_id, invoice_number, amount, currency, invoice_date, due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, vendor_id, contract_id, invoice_number, amount, currency || 'USD', invoice_date, due_date, notes);

  // Auto-detect price increase vs last invoice for same vendor
  const lastInvoice = db.prepare(`
    SELECT amount FROM invoices
    WHERE vendor_id = ? AND id != ?
    ORDER BY invoice_date DESC LIMIT 1
  `).get(vendor_id, id);

  if (lastInvoice && amount > lastInvoice.amount) {
    const pctIncrease = (((amount - lastInvoice.amount) / lastInvoice.amount) * 100).toFixed(1);
    const vendorRow = db.prepare('SELECT name FROM vendors WHERE id = ?').get(vendor_id);
    db.prepare(`
      INSERT INTO alerts (type, invoice_id, message, severity)
      VALUES ('price_increase', ?, ?, ?)
    `).run(id,
      `Price increase detected for ${vendorRow.name}: $${lastInvoice.amount} → $${amount} (+${pctIncrease}%)`,
      pctIncrease > 10 ? 'critical' : 'warning'
    );
  }

  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id));
});

// Mark invoice as paid
router.patch('/:id/pay', (req, res) => {
  const db = getDb();
  const paid_date = req.body.paid_date || new Date().toISOString().split('T')[0];
  db.prepare('UPDATE invoices SET paid=1, paid_date=? WHERE id=?').run(paid_date, req.params.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

// Dashboard summary
router.get('/summary/dashboard', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const totalOutstanding = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE paid=0").get();
  const overdue = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM invoices WHERE paid=0 AND due_date < ?").get(today);
  const upcomingRenewals = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status='active' AND renewal_date BETWEEN ? AND ?").get(today, in30Days);
  const monthSpend = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE invoice_date >= date('now','start of month')").get();

  res.json({
    outstanding_amount: totalOutstanding.total,
    overdue_invoices: overdue.count,
    overdue_amount: overdue.amount,
    upcoming_renewals_30d: upcomingRenewals.count,
    spend_this_month: monthSpend.total,
  });
});

module.exports = router;
