CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_system_settings
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('currency_code', 'NIO', 'Codigo de moneda principal del sistema')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('routine_price', '0', 'Precio configurado para la rutina')
ON CONFLICT (setting_key) DO NOTHING;
