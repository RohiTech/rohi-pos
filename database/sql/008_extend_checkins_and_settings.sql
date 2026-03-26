ALTER TABLE checkins
ADD COLUMN IF NOT EXISTS access_type VARCHAR(20) NOT NULL DEFAULT 'membership',
ADD COLUMN IF NOT EXISTS payment_id BIGINT REFERENCES payments(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'checkins_access_type_chk'
    ) THEN
        ALTER TABLE checkins
        ADD CONSTRAINT checkins_access_type_chk
        CHECK (access_type IN ('membership', 'daily_pass'));
    END IF;
END $$;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('membership_expiry_alert_days', '3', 'Dias de anticipacion para avisar vencimiento de membresia')
ON CONFLICT (setting_key) DO NOTHING;
