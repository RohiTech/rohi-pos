-- RohiPOS initial schema for PostgreSQL
-- This schema covers the MVP for:
-- clients, memberships, POS, inventory, cash sessions, payments and check-ins.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email CITEXT NOT NULL UNIQUE,
    username CITEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
    id BIGSERIAL PRIMARY KEY,
    client_code VARCHAR(30) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email CITEXT,
    phone VARCHAR(30),
    birth_date DATE,
    gender VARCHAR(20),
    address TEXT,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(30),
    photo_url TEXT,
    join_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT clients_gender_chk
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say'))
);

CREATE UNIQUE INDEX clients_email_unique_idx
    ON clients (email)
    WHERE email IS NOT NULL;

CREATE TABLE membership_plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    duration_days INTEGER NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_name VARCHAR(80) NOT NULL DEFAULT 'Exento',
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    price NUMERIC(12, 2) NOT NULL,
    allows_multiple_checkins_per_day BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT membership_plans_duration_chk CHECK (duration_days > 0),
    CONSTRAINT membership_plans_price_chk CHECK (price >= 0),
    CONSTRAINT membership_plans_base_price_chk CHECK (base_price >= 0),
    CONSTRAINT membership_plans_tax_rate_chk CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE TABLE memberships (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id),
    plan_id BIGINT NOT NULL REFERENCES membership_plans(id),
    sold_by_user_id BIGINT REFERENCES users(id),
    membership_number VARCHAR(30) NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    price NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT memberships_dates_chk CHECK (end_date >= start_date),
    CONSTRAINT memberships_status_chk
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    CONSTRAINT memberships_price_chk CHECK (price >= 0),
    CONSTRAINT memberships_discount_chk CHECK (discount >= 0),
    CONSTRAINT memberships_amount_paid_chk CHECK (amount_paid >= 0)
);

CREATE INDEX memberships_client_id_idx ON memberships (client_id);
CREATE INDEX memberships_status_idx ON memberships (status);
CREATE INDEX memberships_end_date_idx ON memberships (end_date);

CREATE TABLE product_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT REFERENCES product_categories(id),
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    sale_price NUMERIC(12, 2) NOT NULL,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_name VARCHAR(60) NOT NULL DEFAULT 'Exento',
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    minimum_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit_label VARCHAR(20) NOT NULL DEFAULT 'unit',
    barcode VARCHAR(100),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT products_sale_price_chk CHECK (sale_price >= 0),
    CONSTRAINT products_cost_price_chk CHECK (cost_price >= 0),
    CONSTRAINT products_tax_rate_chk CHECK (tax_rate >= 0 AND tax_rate <= 100),
    CONSTRAINT products_stock_quantity_chk CHECK (stock_quantity >= 0),
    CONSTRAINT products_minimum_stock_chk CHECK (minimum_stock >= 0)
);

CREATE UNIQUE INDEX products_barcode_unique_idx
    ON products (barcode)
    WHERE barcode IS NOT NULL;

CREATE INDEX products_name_idx ON products (name);

CREATE TABLE cash_register_sessions (
    id BIGSERIAL PRIMARY KEY,
    opened_by_user_id BIGINT NOT NULL REFERENCES users(id),
    closed_by_user_id BIGINT REFERENCES users(id),
    opening_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    closing_amount NUMERIC(12, 2),
    expected_amount NUMERIC(12, 2),
    difference_amount NUMERIC(12, 2),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_register_sessions_status_chk CHECK (status IN ('open', 'closed')),
    CONSTRAINT cash_register_sessions_opening_amount_chk CHECK (opening_amount >= 0)
);

CREATE INDEX cash_register_sessions_status_idx ON cash_register_sessions (status);

CREATE TABLE sales (
    id BIGSERIAL PRIMARY KEY,
    sale_number VARCHAR(30) NOT NULL UNIQUE,
    client_id BIGINT REFERENCES clients(id),
    cashier_user_id BIGINT NOT NULL REFERENCES users(id),
    cash_register_session_id BIGINT REFERENCES cash_register_sessions(id),
    sale_type VARCHAR(20) NOT NULL DEFAULT 'product',
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    subtotal NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sales_sale_type_chk CHECK (sale_type IN ('product', 'membership', 'mixed')),
    CONSTRAINT sales_status_chk CHECK (status IN ('pending', 'completed', 'cancelled')),
    CONSTRAINT sales_subtotal_chk CHECK (subtotal >= 0),
    CONSTRAINT sales_discount_chk CHECK (discount >= 0),
    CONSTRAINT sales_tax_chk CHECK (tax >= 0),
    CONSTRAINT sales_total_chk CHECK (total >= 0)
);

CREATE INDEX sales_client_id_idx ON sales (client_id);
CREATE INDEX sales_cashier_user_id_idx ON sales (cashier_user_id);
CREATE INDEX sales_sold_at_idx ON sales (sold_at);

CREATE TABLE sale_items (
    id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id),
    item_type VARCHAR(20) NOT NULL DEFAULT 'product',
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12, 2) NOT NULL,
    membership_id BIGINT REFERENCES memberships(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sale_items_item_type_chk CHECK (item_type IN ('product', 'membership')),
    CONSTRAINT sale_items_quantity_chk CHECK (quantity > 0),
    CONSTRAINT sale_items_unit_price_chk CHECK (unit_price >= 0),
    CONSTRAINT sale_items_discount_chk CHECK (discount >= 0),
    CONSTRAINT sale_items_line_total_chk CHECK (line_total >= 0)
);

CREATE INDEX sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX sale_items_product_id_idx ON sale_items (product_id);

CREATE TABLE inventory_movements (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id),
    user_id BIGINT REFERENCES users(id),
    movement_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    previous_stock NUMERIC(12, 2) NOT NULL,
    new_stock NUMERIC(12, 2) NOT NULL,
    unit_cost NUMERIC(12, 2),
    reference_type VARCHAR(30),
    reference_id BIGINT,
    notes TEXT,
    moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inventory_movements_type_chk
        CHECK (movement_type IN ('purchase', 'sale', 'adjustment_in', 'adjustment_out', 'return')),
    CONSTRAINT inventory_movements_quantity_chk CHECK (quantity > 0),
    CONSTRAINT inventory_movements_previous_stock_chk CHECK (previous_stock >= 0),
    CONSTRAINT inventory_movements_new_stock_chk CHECK (new_stock >= 0),
    CONSTRAINT inventory_movements_unit_cost_chk CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

CREATE INDEX inventory_movements_product_id_idx ON inventory_movements (product_id);
CREATE INDEX inventory_movements_moved_at_idx ON inventory_movements (moved_at);

CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    payment_number VARCHAR(30) NOT NULL UNIQUE,
    client_id BIGINT REFERENCES clients(id),
    sale_id BIGINT REFERENCES sales(id),
    membership_id BIGINT REFERENCES memberships(id),
    received_by_user_id BIGINT REFERENCES users(id),
    payment_method VARCHAR(20) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    reference VARCHAR(100),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payments_payment_method_chk
        CHECK (payment_method IN ('cash', 'card', 'transfer', 'mobile', 'other')),
    CONSTRAINT payments_amount_chk CHECK (amount > 0),
    CONSTRAINT payments_target_chk
        CHECK (
            (sale_id IS NOT NULL)::integer +
            (membership_id IS NOT NULL)::integer <= 1
        )
);

CREATE INDEX payments_client_id_idx ON payments (client_id);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);

CREATE TABLE checkins (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id),
    membership_id BIGINT REFERENCES memberships(id),
    checked_in_by_user_id BIGINT REFERENCES users(id),
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT checkins_status_chk CHECK (status IN ('allowed', 'denied'))
);

CREATE INDEX checkins_client_id_idx ON checkins (client_id);
CREATE INDEX checkins_checked_in_at_idx ON checkins (checked_in_at);

CREATE TRIGGER set_updated_at_roles
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_clients
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_membership_plans
BEFORE UPDATE ON membership_plans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_memberships
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_product_categories
BEFORE UPDATE ON product_categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_products
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_cash_register_sessions
BEFORE UPDATE ON cash_register_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_sales
BEFORE UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_sale_items
BEFORE UPDATE ON sale_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_inventory_movements
BEFORE UPDATE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_payments
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_checkins
BEFORE UPDATE ON checkins
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
