'use strict';

const nodemailer = require('nodemailer');
const { getDb } = require('../db');

function checkRenewals() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Find contracts where renewal_date is within notice_days
  const contracts = db.prepare(`
    SELECT c.*, v.name as vendor_name, v.contact_email
    FROM contracts c
    JOIN vendors v ON v.id = c.vendor_id
    WHERE c.status = 'active'
      AND c.renewal_date > date('now')
      AND c.renewal_date <= date('now', '+' || c.notice_days || ' days')
  `).all();

  for (const contract of contracts) {
    const daysUntil = Math.ceil(
      (new Date(contract.renewal_date) - new Date()) / 86400000
    );

    // Check if we've already alerted for this contract today
    const existing = db.prepare(`
      SELECT id FROM alerts
      WHERE type = 'renewal_upcoming'
        AND contract_id = ?
        AND date(created_at) = date('now')
    `).get(contract.id);

    if (!existing) {
      const severity = daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info';
      db.prepare(`
        INSERT INTO alerts (type, contract_id, message, severity)
        VALUES ('renewal_upcoming', ?, ?, ?)
      `).run(
        contract.id,
        `Contract renewal in ${daysUntil} day(s): ${contract.vendor_name} — ${contract.description} ($${contract.amount} ${contract.currency})`,
        severity
      );
      console.log(`[renewal] Alert created: ${contract.vendor_name} renews in ${daysUntil}d`);
    }
  }

  // Find overdue unpaid invoices
  const overdueInvoices = db.prepare(`
    SELECT i.*, v.name as vendor_name
    FROM invoices i JOIN vendors v ON v.id = i.vendor_id
    WHERE i.paid = 0 AND i.due_date < date('now')
      AND NOT EXISTS (
        SELECT 1 FROM alerts
        WHERE type='overdue' AND invoice_id=i.id AND date(created_at)=date('now')
      )
  `).all();

  for (const inv of overdueInvoices) {
    db.prepare(`
      INSERT INTO alerts (type, invoice_id, message, severity)
      VALUES ('overdue', ?, ?, 'critical')
    `).run(inv.id, `Overdue invoice from ${inv.vendor_name}: $${inv.amount} was due ${inv.due_date}`);
    console.log(`[renewal] Overdue alert: ${inv.vendor_name} $${inv.amount}`);
  }

  // Send email digest if configured
  if (process.env.SMTP_HOST && (contracts.length > 0 || overdueInvoices.length > 0)) {
    sendEmailDigest(contracts, overdueInvoices).catch(console.error);
  }

  return { renewals: contracts.length, overdue: overdueInvoices.length };
}

async function sendEmailDigest(renewals, overdue) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  let html = '<h2>Invoice Radar — Daily Alert Digest</h2>';

  if (renewals.length > 0) {
    html += '<h3>⏰ Upcoming Renewals</h3><ul>';
    for (const c of renewals) {
      const days = Math.ceil((new Date(c.renewal_date) - new Date()) / 86400000);
      html += `<li><strong>${c.vendor_name}</strong> — ${c.description}: $${c.amount} renews in ${days} days (${c.renewal_date})</li>`;
    }
    html += '</ul>';
  }

  if (overdue.length > 0) {
    html += '<h3>🚨 Overdue Invoices</h3><ul>';
    for (const i of overdue) {
      html += `<li><strong>${i.vendor_name}</strong> — $${i.amount} was due ${i.due_date}</li>`;
    }
    html += '</ul>';
  }

  await transporter.sendMail({
    from: process.env.ALERT_FROM_EMAIL || 'alerts@invoice-radar.app',
    to: process.env.ALERT_TO_EMAIL,
    subject: `Invoice Radar: ${renewals.length} renewal(s), ${overdue.length} overdue`,
    html,
  });
}

module.exports = { checkRenewals };
