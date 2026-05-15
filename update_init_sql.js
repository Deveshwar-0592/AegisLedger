const fs = require('fs');

let content = fs.readFileSync('D:/AegisLedger_v4_Complete/AegisLedger/infrastructure/db/init.sql', 'utf8');

const schemas = [
  'identity_svc', 'wallet_svc', 'compliance_svc', 'trade_svc', 
  'fiat_svc', 'billing_svc', 'kyb_svc', 'notification_svc', 
  'analytics_svc', 'auth_svc', 'developer_portal_svc', 
  'trading_svc', 'scheduler_svc', 'webhook_svc', 
  'business_model_svc', 'ai_svc'
];

let header = `-- AegisLedger — Master Database Schema\n`;
header += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n`;
header += `CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n`;

for (const s of schemas) {
  header += `CREATE SCHEMA ${s};\n`;
  const role = s.replace('_svc', '_app');
  header += `CREATE ROLE ${role} LOGIN PASSWORD 'aegis_dev_password';\n`;
  header += `GRANT USAGE ON SCHEMA ${s} TO ${role};\n`;
  header += `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${role};\n`;
  header += `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};\n\n`;
}

// Strip out existing CREATE EXTENSION so we don't duplicate
content = content.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/, '');
content = content.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/, '');

// Now we need to qualify tables
// companies -> identity_svc.companies
// users -> identity_svc.users
// kyb_applications -> kyb_svc.kyb_applications
// vaults -> wallet_svc.vaults
// wallet_addresses -> wallet_svc.wallet_addresses
// transfers -> trade_svc.transfers
// screening_results -> compliance_svc.screening_results
// trade_escrows -> trade_svc.trade_escrows
// audit_logs -> compliance_svc.audit_logs
// fiat_ramp_requests -> fiat_svc.fiat_ramp_requests
// sessions -> auth_svc.sessions

const mapping = {
  'companies': 'identity_svc',
  'users': 'identity_svc',
  'kyb_applications': 'kyb_svc',
  'vaults': 'wallet_svc',
  'wallet_addresses': 'wallet_svc',
  'transfers': 'trade_svc',
  'screening_results': 'compliance_svc',
  'trade_escrows': 'trade_svc',
  'audit_logs': 'compliance_svc',
  'fiat_ramp_requests': 'fiat_svc',
  'sessions': 'auth_svc'
};

for (const [table, schema] of Object.entries(mapping)) {
  // CREATE TABLE table ( -> CREATE TABLE schema.table (
  content = content.replace(new RegExp(`CREATE TABLE ${table} \\(`, 'g'), `CREATE TABLE ${schema}.${table} (`);
  // REFERENCES table( -> REFERENCES schema.table(
  content = content.replace(new RegExp(`REFERENCES ${table}\\(`, 'g'), `REFERENCES ${schema}.${table}(`);
  // ON table( -> ON schema.table( for indexes and triggers
  content = content.replace(new RegExp(`ON ${table}\\(`, 'g'), `ON ${schema}.${table}(`);
  content = content.replace(new RegExp(`ON ${table} `, 'g'), `ON ${schema}.${table} `);
  // INSERT INTO table -> INSERT INTO schema.table
  content = content.replace(new RegExp(`INSERT INTO ${table} `, 'g'), `INSERT INTO ${schema}.${table} `);
  // UPDATE table -> UPDATE schema.table
  content = content.replace(new RegExp(`TO ${table} `, 'g'), `TO ${schema}.${table} `);
  // COMMENT ON TABLE table -> COMMENT ON TABLE schema.table
  content = content.replace(new RegExp(`COMMENT ON TABLE ${table} `, 'g'), `COMMENT ON TABLE ${schema}.${table} `);
}

// Remove the old header up to -- ─── COMPANIES
content = content.substring(content.indexOf('-- ─── COMPANIES'));

fs.writeFileSync('D:/AegisLedger_v4_Complete/AegisLedger/infrastructure/db/init.sql', header + content);
