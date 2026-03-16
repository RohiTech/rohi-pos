INSERT INTO products (
  category_id, sku, name, description, sale_price, cost_price, stock_quantity,
  minimum_stock, unit_label, barcode, image_url, is_active
)
VALUES
  (
    4, 'PROD-0001', 'Protein Bar', 'Barra de proteina para venta rapida en mostrador.',
    3.50, 2.00, 10, 2, 'unidad', '750000000001', '/product-images/protein-bar.svg', TRUE
  ),
  (
    1, '12345', 'Creatina', 'Creatina monohidratada para fuerza y recuperacion.',
    280.00, 210.00, 38, 5, 'bote', '12345', '/product-images/creatina.svg', TRUE
  ),
  (
    3, '987654', 'Guantes de Gym', 'Guantes para entrenamiento y agarre.',
    760.00, 560.00, 34, 4, 'par', '987654', '/product-images/guantes-gym.svg', TRUE
  ),
  (
    1, 'SUP-0002', 'Whey Protein 2LB', 'Proteina whey sabor vainilla para recuperacion muscular.',
    52.00, 38.00, 18, 4, 'bote', '750000000102', '/product-images/whey-protein.svg', TRUE
  ),
  (
    1, 'SUP-0003', 'Pre Workout', 'Pre entreno energizante para sesiones intensas.',
    38.00, 27.00, 14, 3, 'bote', '750000000103', '/product-images/pre-workout.svg', TRUE
  ),
  (
    1, 'SUP-0004', 'BCAA Recovery', 'Aminoacidos para hidratacion y recuperacion.',
    34.00, 24.00, 12, 3, 'bote', '750000000104', '/product-images/bcaa-recovery.svg', TRUE
  ),
  (
    2, 'BEB-0001', 'Isotonic Drink', 'Bebida isotonica fria para despues del cardio.',
    2.50, 1.20, 40, 8, 'botella', '750000000201', '/product-images/isotonic-drink.svg', TRUE
  ),
  (
    2, 'BEB-0002', 'Electrolyte Water', 'Agua con electrolitos para hidratacion funcional.',
    1.75, 0.85, 32, 8, 'botella', '750000000202', '/product-images/electrolyte-water.svg', TRUE
  ),
  (
    3, 'ACC-0001', 'Shaker Bottle', 'Shaker para batidos y suplementos.',
    9.99, 5.20, 25, 5, 'unidad', '750000000301', '/product-images/shaker-bottle.svg', TRUE
  ),
  (
    3, 'ACC-0002', 'Wrist Straps', 'Straps para peso muerto y jalones.',
    14.00, 8.50, 20, 4, 'par', '750000000302', '/product-images/wrist-straps.svg', TRUE
  ),
  (
    3, 'ACC-0003', 'Gym Towel', 'Toalla compacta para entrenamiento.',
    12.00, 6.00, 16, 4, 'unidad', '750000000303', '/product-images/gym-towel.svg', TRUE
  ),
  (
    4, 'SNK-0002', 'Oat Energy Cookies', 'Galletas de avena para snack saludable.',
    4.25, 2.30, 22, 5, 'paquete', '750000000401', '/product-images/oat-energy-cookies.svg', TRUE
  ),
  (
    4, 'SNK-0003', 'Peanut Butter Cups', 'Snack de mani para post entreno.',
    5.50, 3.10, 18, 4, 'paquete', '750000000402', '/product-images/peanut-butter-cups.svg', TRUE
  )
ON CONFLICT (sku) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sale_price = EXCLUDED.sale_price,
  cost_price = EXCLUDED.cost_price,
  stock_quantity = EXCLUDED.stock_quantity,
  minimum_stock = EXCLUDED.minimum_stock,
  unit_label = EXCLUDED.unit_label,
  barcode = EXCLUDED.barcode,
  image_url = EXCLUDED.image_url,
  is_active = EXCLUDED.is_active;
