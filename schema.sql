-- =============================================================================
-- STITCH / FITFORGE GYM MANAGEMENT SYSTEM - DATABASE SCHEMA DDL
-- Target DB Engine: PostgreSQL 14+
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE subscription_status AS ENUM ('Active', 'Expiring_Soon', 'Expired', 'Paused');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'quarterly', 'annual');
CREATE TYPE payment_method AS ENUM ('credit_card', 'debit_card', 'cash', 'bank_transfer', 'pix_stripe');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE notification_channel AS ENUM ('push', 'whatsapp', 'email', 'sms');
CREATE TYPE notification_type AS ENUM ('7_days', '3_days', '1_day', 'expired', 'custom_promo');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');

-- -----------------------------------------------------------------------------
-- 1. USERS / MEMBERS
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL UNIQUE,
    avatar_url TEXT,
    status subscription_status NOT NULL DEFAULT 'Active',
    join_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email_phone ON users(email, phone);

-- -----------------------------------------------------------------------------
-- 2. MEMBERSHIPS / PLANS
-- -----------------------------------------------------------------------------
CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    cycle billing_cycle NOT NULL DEFAULT 'monthly',
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. SUBSCRIPTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    status subscription_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sub_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_subscriptions_member_id ON subscriptions(member_id);
CREATE INDEX idx_subscriptions_status_end_date ON subscriptions(status, end_date);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

-- -----------------------------------------------------------------------------
-- 4. PAYMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method payment_method NOT NULL DEFAULT 'credit_card',
    transaction_status transaction_status NOT NULL DEFAULT 'completed',
    external_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_sub_id ON payments(subscription_id);
CREATE INDEX idx_payments_status_date ON payments(transaction_status, payment_date);

-- -----------------------------------------------------------------------------
-- 5. NOTIFICATIONS LOG (Idempotency and Audit)
-- -----------------------------------------------------------------------------
CREATE TABLE notifications_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivery_status delivery_status NOT NULL DEFAULT 'sent',
    payment_link TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_notifications_member_type ON notifications_log(member_id, type, sent_at);
CREATE INDEX idx_notifications_sub_type ON notifications_log(subscription_id, type, sent_at);

-- -----------------------------------------------------------------------------
-- 6. PROMOTIONS / CAMPAIGNS
-- -----------------------------------------------------------------------------
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    discount_rate NUMERIC(5, 2) NOT NULL CHECK (discount_rate >= 0 AND discount_rate <= 100),
    target_month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    conversion_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_promotions_target_month ON promotions(target_month);

-- -----------------------------------------------------------------------------
-- AUTOMATIC SUBSCRIPTION STATUS UPDATE TRIGGER / FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_subscription_statuses()
RETURNS VOID AS $$
BEGIN
    -- Update Active -> Expiring_Soon (if 7 days or less remaining)
    UPDATE subscriptions
    SET status = 'Expiring_Soon', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'Active'
      AND end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days');

    -- Update Expiring_Soon / Active -> Expired (if end_date < CURRENT_DATE)
    UPDATE subscriptions
    SET status = 'Expired', updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('Active', 'Expiring_Soon')
      AND end_date < CURRENT_DATE;

    -- Sync user status with subscription status
    UPDATE users u
    SET status = s.status, updated_at = CURRENT_TIMESTAMP
    FROM subscriptions s
    WHERE u.id = s.member_id;
END;
$$ LANGUAGE plpgsql;

-- Timestamp auto-update trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
