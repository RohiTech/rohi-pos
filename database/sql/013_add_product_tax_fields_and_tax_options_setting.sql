ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tax_name VARCHAR(60) NOT NULL DEFAULT 'Exento',
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_tax_rate_chk'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_tax_rate_chk CHECK (tax_rate >= 0 AND tax_rate <= 100);
  END IF;
END $$;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'tax_options',
  '[{"name":"Exento","rate":0},{"name":"IVA","rate":15}]',
  'Listado de impuestos disponibles para productos en formato JSON'
)
ON CONFLICT (setting_key) DO NOTHING;
