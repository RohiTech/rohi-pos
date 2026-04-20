-- Additional sample clients and memberships for RohiPOS demos.
-- Safe to run multiple times.

INSERT INTO clients (
    client_code,
    first_name,
    last_name,
    email,
    phone,
    gender,
    join_date,
    notes,
    is_active
)
VALUES
    ('CLI-0100', 'Maria', 'Gonzalez', 'maria.gonzalez@demo.local', '8888-1000', 'female', CURRENT_DATE - 120, 'Cliente frecuente de clases funcionales', TRUE),
    ('CLI-0101', 'Carlos', 'Martinez', 'carlos.martinez@demo.local', '8888-1001', 'male', CURRENT_DATE - 95, 'Prefiere horario matutino', TRUE),
    ('CLI-0102', 'Lucia', 'Herrera', 'lucia.herrera@demo.local', '8888-1002', 'female', CURRENT_DATE - 61, 'Compradora habitual de suplementos', TRUE),
    ('CLI-0103', 'Miguel', 'Torres', 'miguel.torres@demo.local', '8888-1003', 'male', CURRENT_DATE - 45, 'Regreso despues de una pausa de 6 meses', TRUE),
    ('CLI-0104', 'Sofia', 'Ramirez', 'sofia.ramirez@demo.local', '8888-1004', 'female', CURRENT_DATE - 28, 'Se inscribio con promocion trimestral', TRUE),
    ('CLI-0105', 'Kevin', 'Flores', 'kevin.flores@demo.local', '8888-1005', 'male', CURRENT_DATE - 18, 'Pendiente de completar pago', TRUE),
    ('CLI-0106', 'Andrea', 'Castillo', 'andrea.castillo@demo.local', '8888-1006', 'female', CURRENT_DATE - 12, 'Cancelacion solicitada por viaje', FALSE),
    ('CLI-0107', 'Daniel', 'Mendoza', 'daniel.mendoza@demo.local', '8888-1007', 'male', CURRENT_DATE - 7, 'Cliente nuevo plan anual', TRUE)
ON CONFLICT (client_code) DO NOTHING;

WITH admin_user AS (
    SELECT id
    FROM users
    WHERE username = 'admin'
    LIMIT 1
),
plans AS (
    SELECT id, name, price
    FROM membership_plans
),
target_clients AS (
    SELECT id, client_code
    FROM clients
    WHERE client_code IN (
        'CLI-0100',
        'CLI-0101',
        'CLI-0102',
        'CLI-0103',
        'CLI-0104',
        'CLI-0105',
        'CLI-0106',
        'CLI-0107'
    )
)
INSERT INTO memberships (
    client_id,
    plan_id,
    sold_by_user_id,
    membership_number,
    start_date,
    end_date,
    status,
    price,
    discount,
    amount_paid,
    notes,
    cancelled_at
)
SELECT
    c.id,
    p.id,
    (SELECT id FROM admin_user),
    seed.membership_number,
    seed.start_date,
    seed.end_date,
    seed.status,
    p.price,
    seed.discount,
    seed.amount_paid,
    seed.notes,
    seed.cancelled_at
FROM (
    VALUES
        ('CLI-0100', 'Mensual',     'MEM-0100', CURRENT_DATE - 10, CURRENT_DATE + 20, 'active',    0.00::numeric, 35.00::numeric, 'Membresia al dia y muy constante', NULL::timestamptz),
        ('CLI-0101', 'Trimestral',  'MEM-0101', CURRENT_DATE - 40, CURRENT_DATE + 50, 'active',    5.00::numeric, 90.00::numeric, 'Pago con descuento corporativo', NULL::timestamptz),
        ('CLI-0102', 'Semanal',     'MEM-0102', CURRENT_DATE - 14, CURRENT_DATE - 7,  'expired',   0.00::numeric, 10.00::numeric, 'No renovo la ultima semana', NULL::timestamptz),
        ('CLI-0103', 'Mensual',     'MEM-0103', CURRENT_DATE + 2,  CURRENT_DATE + 32, 'pending',   0.00::numeric, 15.00::numeric, 'Inicio programado para la proxima semana', NULL::timestamptz),
        ('CLI-0104', 'Trimestral',  'MEM-0104', CURRENT_DATE - 27, CURRENT_DATE + 63, 'active',   10.00::numeric, 85.00::numeric, 'Promocion de temporada aplicada', NULL::timestamptz),
        ('CLI-0105', 'Mensual',     'MEM-0105', CURRENT_DATE - 5,  CURRENT_DATE + 25, 'pending',   0.00::numeric, 10.00::numeric, 'Solo dejo adelanto en recepcion', NULL::timestamptz),
        ('CLI-0106', 'Mensual',     'MEM-0106', CURRENT_DATE - 20, CURRENT_DATE + 10, 'cancelled', 0.00::numeric, 20.00::numeric, 'Cancelada por viaje prolongado', CURRENT_TIMESTAMP - INTERVAL '3 days'),
        ('CLI-0107', 'Anual Plus',  'MEM-0107', CURRENT_DATE - 3,  CURRENT_DATE + 362,'active',   25.00::numeric, 274.99::numeric, 'Plan anual premium', NULL::timestamptz)
) AS seed(client_code, plan_name, membership_number, start_date, end_date, status, discount, amount_paid, notes, cancelled_at)
INNER JOIN target_clients c
    ON c.client_code = seed.client_code
INNER JOIN plans p
    ON p.name = seed.plan_name
ON CONFLICT (membership_number) DO NOTHING;
