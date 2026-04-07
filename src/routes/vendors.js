'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

// List all vendors
router.get('/', (req, res) => {
  const db = getDb();
  const vendors = db.prepare(`
    SELECT v.*,
      COUNT(DISTINCT c.id) as contract_count,
      COUNT(DISTINCT i.id) as invoice_count,
      COALESCE(SUM(CASE WHEN i.paid=0 THEN i.amount ELSE 0 END), 0) as outstanding_amount
    FROM vendors v
    LEFT JOIN contracts c ON c.vendor_id = v.id
    LEFT JOIN invoices i ON i.vendor_id = v.id
    GROUP BY v.id
    ORDER BY v.name
  `).all();
  res.json(vendors);
});

// Get single vendor with contracts and recent invoices
router.get('/:id', (req, res) => {
  const db = getDb();
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const contracts = db.prepare('SELECT * FROM contracts WHERE vendor_id = ? ORDER BY renewal_date').all(req.params.id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE vendor_id = ? ORDER BY invoice_date DESC LIMIT 20').all(req.params.id);

  res.json({ ...vendor, contracts, invoices });
});

// Create vendor
router.post('/', (req, res) => {
  const { name, category, contact_email, contact_name, website, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO vendors (id, name, category, contact_email, contact_name, website, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, category || 'other', contact_email, contact_name, website, notes);

  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id = ?').get(id));
});

// Update vendor
router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, category, contact_email, contact_name, website, notes } = req.body;
  db.prepare(`
    UPDATE vendors SET name=?, category=?, contact_email=?, contact_name=?, website=?, notes=?
    WHERE id=?
  `).run(name, category, contact_email, contact_name, website, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id));
});

// Delete vendor
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// Add contract to vendor
router.post('/:id/contracts', (req, res) => {
  const { description, start_date, renewal_date, amount, currency, billing_cycle, auto_renews, notice_days } = req.body;
  if (!description || !renewal_date || amount == null) {
    return res.status(400).json({ error: 'description, renewal_date, and amount are required' });
  }

  const db = getDb();
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO contracts (id, vendor_id, description, start_date, renewal_date, amount, currency, billing_cycle, auto_renews, notice_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, description, start_date || new Date().toISOString().split('T')[0],
    renewal_date, amount, currency || 'USD', billing_cycle || 'annual',
    auto_renews !== false ? 1 : 0, notice_days || 30);

  res.status(201).json(db.prepare('SELECT * FROM contracts WHERE id = ?').get(id));
});

module.exports = router;
