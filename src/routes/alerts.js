'use strict';

const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// List alerts
router.get('/', (req, res) => {
  const db = getDb();
  const { acknowledged, severity } = req.query;
  let query = 'SELECT * FROM alerts WHERE 1=1';
  const params = [];
  if (acknowledged !== undefined) { query += ' AND acknowledged = ?'; params.push(acknowledged === 'true' ? 1 : 0); }
  if (severity) { query += ' AND severity = ?'; params.push(severity); }
  query += ' ORDER BY created_at DESC LIMIT 50';
  res.json(db.prepare(query).all(...params));
});

// Acknowledge alert
router.patch('/:id/ack', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE alerts SET acknowledged=1 WHERE id=?').run(req.params.id);
  res.json({ acknowledged: true });
});

// Acknowledge all
router.post('/ack-all', (req, res) => {
  const db = getDb();
  const result = db.prepare('UPDATE alerts SET acknowledged=1 WHERE acknowledged=0').run();
  res.json({ acknowledged: result.changes });
});

module.exports = router;
