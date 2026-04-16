CREATE TABLE IF NOT EXISTS cash_movements (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    movement_type VARCHAR(20) NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_movements_type_chk CHECK (movement_type IN ('income', 'expense')),
    CONSTRAINT cash_movements_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS cash_movements_created_at_idx ON cash_movements (created_at);
CREATE INDEX IF NOT EXISTS cash_movements_type_idx ON cash_movements (movement_type);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_updated_at_cash_movements'
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER set_updated_at_cash_movements
        BEFORE UPDATE ON cash_movements
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;
