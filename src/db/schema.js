/*
 * Ma'lumotlar bazasi sxemasi (REJA.md 3-bo'lim, D1–D24) — migratsiyalar ro'yxati.
 * SQL PostgreSQL ga ko'chirishga mos yozilgan: TEXT/INTEGER/REAL turlari, JSON — TEXT ustunda,
 * vaqt — ISO 8601 matn. Yangi o'zgarish faqat ro'yxat oxiriga yangi migratsiya qo'shish orqali kiritiladi.
 */
"use strict";

const MIGRATIONS = [
  /* 1 — asosiy sxema */
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL,
    operator_id TEXT, verifier_id TEXT, importer_id TEXT,
    password_hash TEXT NOT NULL, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_last_step INTEGER,
    disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mfa_ok INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE operators (
    id TEXT PRIMARY KEY, stir TEXT NOT NULL UNIQUE, name TEXT NOT NULL, oked TEXT, address TEXT,
    o3ci_operator_id TEXT, contact_person TEXT, contact_phone TEXT, contact_email TEXT,
    example INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE installations (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), name TEXT NOT NULL,
    address TEXT, region TEXT, lat REAL, lon REAL, unlocode TEXT, capacity_t REAL, o3ci_installation_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX installations_operator ON installations(operator_id);
  CREATE TABLE processes (
    id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), name TEXT NOT NULL,
    goods_group TEXT NOT NULL, route TEXT, tif_code TEXT, boundary TEXT, al_capacity REAL,
    export_price_usd REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX processes_installation ON processes(installation_id);
  CREATE TABLE meters (
    id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), type TEXT, serial TEXT,
    calibration_date TEXT, certificate_doc_id TEXT, uncertainty REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE streams (
    id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES processes(id), name TEXT NOT NULL, type TEXT NOT NULL,
    method TEXT, fuel_key TEXT, material_key TEXT, gas TEXT, unit TEXT,
    ef REAL, ncv REAL, of REAL, cf REAL, carbon REAL, eta REAL, ef_source TEXT,
    precursor_source TEXT, precursor_process_id TEXT, precursor_tif TEXT, supplier_see_dir REAL, supplier_see_ind REAL,
    tier TEXT, source_level TEXT, meter_id TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX streams_process ON streams(process_id);
  CREATE TABLE activity (
    id TEXT PRIMARY KEY, stream_id TEXT NOT NULL REFERENCES streams(id), year INTEGER NOT NULL, month INTEGER NOT NULL,
    value REAL NOT NULL, extra TEXT, source_level TEXT, uncertainty REAL, evidence_id TEXT,
    status TEXT NOT NULL DEFAULT 'actual', note TEXT, entered_by TEXT, entered_at TEXT NOT NULL,
    UNIQUE (stream_id, year, month)
  );
  CREATE INDEX activity_year ON activity(year);
  CREATE TABLE documents (
    id TEXT PRIMARY KEY, operator_id TEXT, entity TEXT, entity_id TEXT, name TEXT NOT NULL, mime TEXT, size INTEGER,
    sha256 TEXT NOT NULL, content BLOB, uploaded_by TEXT, uploaded_at TEXT NOT NULL, ocr TEXT
  );
  CREATE TABLE importers (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), name TEXT NOT NULL, eori TEXT,
    country TEXT, contract TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE batches (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), declaration_no TEXT NOT NULL, date TEXT NOT NULL,
    tif_code TEXT NOT NULL, net_t REAL NOT NULL, importer_id TEXT, eori TEXT, country TEXT, process_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (declaration_no, tif_code)
  );
  CREATE INDEX batches_operator ON batches(operator_id, date);
  CREATE TABLE calc_results (
    id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES processes(id), year INTEGER NOT NULL, version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', result TEXT NOT NULL, refs TEXT NOT NULL, inputs_hash TEXT NOT NULL,
    see_cbam REAL, see_applied REAL, basis TEXT, created_by TEXT, created_at TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE (process_id, year, version)
  );
  CREATE TABLE monitoring_plans (
    id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', snapshot TEXT NOT NULL, note TEXT, created_by TEXT, created_at TEXT NOT NULL,
    submitted_at TEXT, decided_by TEXT, decided_at TEXT, decision_note TEXT,
    UNIQUE (installation_id, version)
  );
  CREATE TABLE verifiers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, accreditation_no TEXT, accredited_until TEXT, sectors TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE verifications (
    id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), year INTEGER NOT NULL,
    verifier_id TEXT NOT NULL REFERENCES verifiers(id), status TEXT NOT NULL DEFAULT 'assigned',
    opinion TEXT, conclusion TEXT, signed_at TEXT, signed_by TEXT, signature TEXT, assigned_by TEXT, created_at TEXT NOT NULL,
    UNIQUE (installation_id, year, verifier_id)
  );
  CREATE TABLE findings (
    id TEXT PRIMARY KEY, verification_id TEXT NOT NULL REFERENCES verifications(id), kind TEXT NOT NULL, text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', response TEXT, created_by TEXT, created_at TEXT NOT NULL,
    responded_by TEXT, responded_at TEXT, closed_at TEXT
  );
  CREATE TABLE tax_payments (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), installation_id TEXT, year INTEGER NOT NULL,
    period TEXT NOT NULL, kind TEXT NOT NULL, amount_uzs REAL NOT NULL, fx REAL NOT NULL, rebate_uzs REAL NOT NULL DEFAULT 0,
    covered_t REAL, budget_code TEXT, status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT 'manual',
    confirmed_by TEXT, confirmed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE refdata (
    id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT NOT NULL, unit TEXT, source TEXT,
    valid_from TEXT NOT NULL, valid_to TEXT, recorded_at TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
    proposed_by TEXT NOT NULL, approved_by TEXT, approved_at TEXT, note TEXT
  );
  CREATE INDEX refdata_key ON refdata(key, status);
  CREATE TABLE audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, role TEXT, action TEXT NOT NULL,
    entity TEXT, entity_id TEXT, before TEXT, after TEXT, ip TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
  );
  CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit izi o''zgartirilmaydi'); END;
  CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit izi o''chirilmaydi'); END;
  CREATE TABLE notifications (
    id TEXT PRIMARY KEY, user_id TEXT, operator_id TEXT, role TEXT, kind TEXT NOT NULL, text TEXT NOT NULL,
    link TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE notification_reads (notification_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY (notification_id, user_id));
  CREATE TABLE share_links (
    token_hash TEXT PRIMARY KEY, operator_id TEXT NOT NULL, installation_id TEXT NOT NULL, year INTEGER NOT NULL,
    importer_id TEXT, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE ai_log (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, model TEXT NOT NULL, model_version TEXT NOT NULL, subject TEXT,
    output TEXT NOT NULL, factors TEXT, status TEXT NOT NULL DEFAULT 'new', decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE integration_log (
    id TEXT PRIMARY KEY, system TEXT NOT NULL, direction TEXT NOT NULL, summary TEXT, request TEXT, response TEXT,
    status TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE itmo_projects (
    id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), name TEXT NOT NULL, year INTEGER NOT NULL,
    be REAL NOT NULL, pe REAL NOT NULL, le REAL NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
    scope TEXT NOT NULL DEFAULT 'other', linked_process_id TEXT, state_owned INTEGER NOT NULL DEFAULT 0,
    registry_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE login_attempts (key TEXT NOT NULL, at TEXT NOT NULL);
  CREATE INDEX login_attempts_key ON login_attempts(key, at);
  `,
];

module.exports = { MIGRATIONS };
