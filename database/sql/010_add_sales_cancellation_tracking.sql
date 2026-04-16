ALTER TABLE sales
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by_user_id BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS sales_cancelled_at_idx ON sales (cancelled_at);
