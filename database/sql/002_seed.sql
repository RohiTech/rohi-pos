-- Minimal seed data for RohiPOS MVP.
-- Run this after 001_schema.sql.

INSERT INTO roles (name, description)
VALUES
    ('admin', 'Full access to the platform'),
    ('manager', 'Operational management and reporting'),
    ('cashier', 'POS and payments'),
    ('receptionist', 'Client attention, memberships and check-ins')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (
    role_id,
    first_name,
    last_name,
    email,
    username,
    password_hash,
    phone
)
SELECT
    r.id,
    'System',
    'Administrator',
    'admin@rohipos.local',
    'admin',
    '$2b$12$Bt6SIlucA5OXC2122V4cgOu6mmzQ4.a16izXo6dUxZo5lImJEF3LC',
    '00000000'
FROM roles r
WHERE r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

INSERT INTO membership_plans (
    name,
    description,
    duration_days,
    price
)
VALUES
    ('Weekly', '7-day access plan', 7, 10.00),
    ('Monthly', '30-day access plan', 30, 35.00),
    ('Quarterly', '90-day access plan', 90, 95.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO product_categories (name, description)
VALUES
    ('Supplements', 'Protein, creatine and sports nutrition'),
    ('Beverages', 'Water, isotonic drinks and shakes'),
    ('Accessories', 'Gloves, straps and training accessories')
ON CONFLICT (name) DO NOTHING;
