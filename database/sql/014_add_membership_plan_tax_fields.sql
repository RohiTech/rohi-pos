ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS tax_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2);

UPDATE membership_plans
SET
  base_price = COALESCE(base_price, price, 0),
  tax_name = COALESCE(NULLIF(BTRIM(tax_name), ''), 'Exento'),
  tax_rate = COALESCE(tax_rate, 0)
WHERE base_price IS NULL
   OR tax_name IS NULL
   OR BTRIM(tax_name) = ''
   OR tax_rate IS NULL;

ALTER TABLE membership_plans
  ALTER COLUMN base_price SET DEFAULT 0,
  ALTER COLUMN base_price SET NOT NULL,
  ALTER COLUMN tax_name SET DEFAULT 'Exento',
  ALTER COLUMN tax_name SET NOT NULL,
  ALTER COLUMN tax_rate SET DEFAULT 0,
  ALTER COLUMN tax_rate SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_plans_base_price_chk'
  ) THEN
    ALTER TABLE membership_plans
      ADD CONSTRAINT membership_plans_base_price_chk CHECK (base_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_plans_tax_rate_chk'
  ) THEN
    ALTER TABLE membership_plans
      ADD CONSTRAINT membership_plans_tax_rate_chk CHECK (tax_rate >= 0 AND tax_rate <= 100);
  END IF;
END $$;
