'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { initDb } = require('./db');
const vendorRoutes = require('./routes/vendors');
const invoiceRoutes = require('./routes/invoices');
const alertRoutes = require('./routes/alerts');
const { checkRenewals } = require('./services/renewalChecker');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Simple API key auth middleware
app.use((req, res, next) => {
  const publicPaths = ['/health', '/'];
  if (publicPaths.includes(req.path)) return next();
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — provide x-api-key header' });
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    service: 'invoice-radar',
    version: '1.0.0',
    docs: 'https://github.com/Everaldtah/invoice-radar',
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/vendors', vendorRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/alerts', alertRoutes);

// Daily cron: check for upcoming renewals at 9am
cron.schedule('0 9 * * *', () => {
  console.log('[cron] Running renewal check...');
  checkRenewals();
});

initDb();
app.listen(PORT, () => {
  console.log(`invoice-radar running on http://localhost:${PORT}`);
  console.log(`API Key: ${process.env.API_SECRET || 'changeme'}`);
});

module.exports = app;
