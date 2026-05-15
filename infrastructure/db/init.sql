-- AegisLedger — Master Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA identity_svc;
CREATE ROLE identity_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA identity_svc TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity_svc TO identity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO identity_app;

CREATE SCHEMA wallet_svc;
CREATE ROLE wallet_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA wallet_svc TO wallet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA wallet_svc TO wallet_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wallet_app;

CREATE SCHEMA compliance_svc;
CREATE ROLE compliance_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA compliance_svc TO compliance_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA compliance_svc TO compliance_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA compliance_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO compliance_app;

CREATE SCHEMA trade_svc;
CREATE ROLE trade_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA trade_svc TO trade_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trade_svc TO trade_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA trade_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trade_app;

CREATE SCHEMA fiat_svc;
CREATE ROLE fiat_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA fiat_svc TO fiat_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fiat_svc TO fiat_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA fiat_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fiat_app;

CREATE SCHEMA billing_svc;
CREATE ROLE billing_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA billing_svc TO billing_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing_svc TO billing_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO billing_app;

CREATE SCHEMA kyb_svc;
CREATE ROLE kyb_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA kyb_svc TO kyb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kyb_svc TO kyb_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kyb_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kyb_app;

CREATE SCHEMA notification_svc;
CREATE ROLE notification_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA notification_svc TO notification_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notification_svc TO notification_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA notification_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notification_app;

CREATE SCHEMA analytics_svc;
CREATE ROLE analytics_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA analytics_svc TO analytics_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics_svc TO analytics_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO analytics_app;

CREATE SCHEMA auth_svc;
CREATE ROLE auth_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA auth_svc TO auth_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth_svc TO auth_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_app;

CREATE SCHEMA developer_portal_svc;
CREATE ROLE developer_portal_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA developer_portal_svc TO developer_portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA developer_portal_svc TO developer_portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA developer_portal_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO developer_portal_app;

CREATE SCHEMA trading_svc;
CREATE ROLE trading_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA trading_svc TO trading_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trading_svc TO trading_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA trading_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trading_app;

CREATE SCHEMA scheduler_svc;
CREATE ROLE scheduler_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA scheduler_svc TO scheduler_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA scheduler_svc TO scheduler_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA scheduler_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scheduler_app;

CREATE SCHEMA webhook_svc;
CREATE ROLE webhook_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA webhook_svc TO webhook_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA webhook_svc TO webhook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA webhook_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO webhook_app;

CREATE SCHEMA business_model_svc;
CREATE ROLE business_model_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA business_model_svc TO business_model_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA business_model_svc TO business_model_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA business_model_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO business_model_app;

CREATE SCHEMA ai_svc;
CREATE ROLE ai_app LOGIN PASSWORD 'aegis_dev_password';
GRANT USAGE ON SCHEMA ai_svc TO ai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_svc TO ai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_svc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_app;

-- ─── COMPANIES ─────────────────────────────────────────────────────
CREATE TABLE identity_svc.companies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    jurisdiction        CHAR(2) NOT NULL,           -- ISO 3166-1 alpha-2
    company_type        TEXT,
    kyb_status          TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (kyb_status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','SUSPENDED')),
    risk_rating         TEXT CHECK (risk_rating IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    elr_qualified       BOOLEAN DEFAULT FALSE,      -- Russian ELR status
    vara_status         TEXT,                        -- VARA-specific status
    annual_revenue      NUMERIC(20,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_company_reg UNIQUE (registration_number, jurisdiction)
);

CREATE INDEX idx_companies_kyb_status ON identity_svc.companies(kyb_status);
CREATE INDEX idx_companies_jurisdiction ON identity_svc.companies(jurisdiction);

-- ─── USERS ─────────────────────────────────────────────────────────
CREATE TABLE identity_svc.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES identity_svc.companies(id) ON DELETE CASCADE,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,                  -- bcrypt, cost=12
    role            TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','COMPLIANCE','TREASURY_MGR','OPERATOR','LOGISTICS','AUDITOR')),
    mfa_secret      TEXT,                           -- Encrypted TOTP secret
    mfa_enabled     BOOLEAN DEFAULT TRUE,
    is_active       BOOLEAN DEFAULT TRUE,
    failed_attempts INT DEFAULT 0,
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_company ON identity_svc.users(company_id);
CREATE INDEX idx_users_email ON identity_svc.users(email);

-- ─── KYB APPLICATIONS ──────────────────────────────────────────────
CREATE TABLE kyb_svc.kyb_applications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID REFERENCES identity_svc.companies(id),
    company_name        TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    jurisdiction        CHAR(2) NOT NULL,
    annual_revenue      NUMERIC(20,2),
    directors           JSONB NOT NULL DEFAULT '[]',    -- Encrypted PII in real deployment
    ubos                JSONB NOT NULL DEFAULT '[]',    -- UBO structures
    documents           JSONB NOT NULL DEFAULT '[]',    -- Document references (S3 keys)
    elr_qualified       BOOLEAN DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED')),
    risk_rating         TEXT,
    reviewed_by         UUID REFERENCES identity_svc.users(id),
    review_notes        TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ
);

CREATE INDEX idx_kyb_status ON kyb_svc.kyb_applications(status);
CREATE INDEX idx_kyb_company ON kyb_svc.kyb_applications(company_id);

-- ─── VAULTS ────────────────────────────────────────────────────────
CREATE TABLE wallet_svc.vaults (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES identity_svc.companies(id),
    fireblocks_vault_id TEXT UNIQUE NOT NULL,
    created_by          UUID REFERENCES identity_svc.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WALLET ADDRESSES ──────────────────────────────────────────────
CREATE TABLE wallet_svc.wallet_addresses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES identity_svc.companies(id),
    asset_key           TEXT NOT NULL,              -- USDC_ETH, USDT_POLY, AE_COIN
    address             TEXT NOT NULL,
    network             TEXT NOT NULL,
    fireblocks_vault_id TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wallet_addr UNIQUE (company_id, asset_key)
);

CREATE INDEX idx_wallet_addr_company ON wallet_svc.wallet_addresses(company_id);

-- ─── TRANSFERS ─────────────────────────────────────────────────────
CREATE TABLE trade_svc.transfers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_company        UUID NOT NULL REFERENCES identity_svc.companies(id),
    to_company          UUID NOT NULL REFERENCES identity_svc.companies(id),
    asset_key           TEXT NOT NULL,
    amount              NUMERIC(30,6) NOT NULL CHECK (amount > 0),
    status              TEXT NOT NULL DEFAULT 'QUEUED'
                        CHECK (status IN ('QUEUED','PENDING_APPROVAL','SUBMITTED','PROCESSING','COMPLETED','FAILED','FROZEN','REJECTED')),
    fireblocks_tx_id    TEXT,
    blockchain_hash     TEXT,
    network_fee         NUMERIC(20,8),
    initiated_by        UUID REFERENCES identity_svc.users(id),
    approved_by         UUID REFERENCES identity_svc.users(id),
    approval_reason     TEXT,
    needs_approval      BOOLEAN DEFAULT FALSE,
    memo                TEXT,
    trade_id            UUID,
    risk_score          INT,
    fatf_compliant      BOOLEAN DEFAULT TRUE,
    sanctions_clear     BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfers_from ON trade_svc.transfers(from_company);
CREATE INDEX idx_transfers_to ON trade_svc.transfers(to_company);
CREATE INDEX idx_transfers_status ON trade_svc.transfers(status);
CREATE INDEX idx_transfers_created ON trade_svc.transfers(created_at DESC);
CREATE INDEX idx_transfers_hash ON trade_svc.transfers(blockchain_hash) WHERE blockchain_hash IS NOT NULL;

-- ─── SCREENING RESULTS ─────────────────────────────────────────────
CREATE TABLE compliance_svc.screening_results (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id          UUID REFERENCES trade_svc.transfers(id),
    entity_name             TEXT,
    risk_score              INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    alerts                  JSONB NOT NULL DEFAULT '[]',
    travel_rule_compliant   BOOLEAN NOT NULL DEFAULT TRUE,
    sanctions_lists_checked TEXT[] NOT NULL DEFAULT '{}',
    hits                    INT NOT NULL DEFAULT 0,
    screened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_screening_tx ON compliance_svc.screening_results(transaction_id);
CREATE INDEX idx_screening_score ON compliance_svc.screening_results(risk_score);

-- ─── TRADE ESCROWS ─────────────────────────────────────────────────
CREATE TABLE trade_svc.trade_escrows (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    smart_contract_id       TEXT UNIQUE NOT NULL,   -- On-chain escrow ID (bytes32)
    buyer_company           UUID NOT NULL REFERENCES identity_svc.companies(id),
    seller_company          UUID NOT NULL REFERENCES identity_svc.companies(id),
    asset_key               TEXT NOT NULL,
    amount                  NUMERIC(30,6) NOT NULL,
    platform_fee            NUMERIC(30,6) NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'CREATED'
                            CHECK (status IN ('CREATED','FUNDED','CONDITIONS_MET','RELEASED','DISPUTED','REFUNDED','FROZEN')),
    conditions              JSONB NOT NULL DEFAULT '[]',
    trade_reference         TEXT,
    product_description     TEXT,
    expiry_date             DATE NOT NULL,
    contract_address        TEXT NOT NULL,
    network                 TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    funded_at               TIMESTAMPTZ,
    released_at             TIMESTAMPTZ
);

CREATE INDEX idx_escrow_buyer ON trade_svc.trade_escrows(buyer_company);
CREATE INDEX idx_escrow_seller ON trade_svc.trade_escrows(seller_company);
CREATE INDEX idx_escrow_status ON trade_svc.trade_escrows(status);

-- ─── AUDIT LOGS ────────────────────────────────────────────────────
-- Immutable audit trail — no updates/deletes allowed
CREATE TABLE compliance_svc.audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES identity_svc.users(id),
    company_id  UUID REFERENCES identity_svc.companies(id),
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   UUID,
    ip          INET,
    user_agent  TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON compliance_svc.audit_logs(user_id);
CREATE INDEX idx_audit_action ON compliance_svc.audit_logs(action);
CREATE INDEX idx_audit_created ON compliance_svc.audit_logs(created_at DESC);

-- Prevent modifications to audit log
CREATE RULE no_audit_update AS ON UPDATE TO compliance_svc.audit_logs DO INSTEAD NOTHING;
CREATE RULE no_audit_delete AS ON DELETE TO compliance_svc.audit_logs DO INSTEAD NOTHING;

-- ─── FIAT RAMP REQUESTS ────────────────────────────────────────────
CREATE TABLE fiat_svc.fiat_ramp_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES identity_svc.companies(id),
    direction       TEXT NOT NULL CHECK (direction IN ('ON_RAMP','OFF_RAMP')),
    fiat_currency   CHAR(3) NOT NULL,               -- RUB, AED
    fiat_amount     NUMERIC(20,2) NOT NULL,
    crypto_asset    TEXT NOT NULL,
    crypto_amount   NUMERIC(30,6),
    exchange_rate   NUMERIC(20,8),
    status          TEXT NOT NULL DEFAULT 'PENDING',
    provider_ref    TEXT,                            -- OpenPayd reference
    initiated_by    UUID REFERENCES identity_svc.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ─── SESSIONS ──────────────────────────────────────────────────────
CREATE TABLE auth_svc.sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES identity_svc.users(id),
    ip          INET NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON auth_svc.sessions(user_id);

-- ─── TRIGGERS — auto-update updated_at ─────────────────────────────
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_ts BEFORE UPDATE ON identity_svc.companies FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_users_ts     BEFORE UPDATE ON identity_svc.users     FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_transfers_ts BEFORE UPDATE ON trade_svc.transfers  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ─── SEED: Approved stablecoins ────────────────────────────────────
-- These are inserted as reference data — actual approval is per smart contract
INSERT INTO identity_svc.companies (id, name, registration_number, jurisdiction, kyb_status, risk_rating)
VALUES ('00000000-0000-0000-0000-000000000001', 'AegisLedger Platform', 'PLATFORM-001', 'AE', 'APPROVED', 'LOW');

COMMENT ON TABLE identity_svc.companies IS 'Corporate entities onboarded via KYB. PII in directors/ubos fields is encrypted.';
COMMENT ON TABLE trade_svc.transfers IS 'All stablecoin transfer records. Immutable once status=COMPLETED.';
COMMENT ON TABLE compliance_svc.audit_logs IS 'Immutable audit trail for VARA and Rosfinmonitoring compliance.';
