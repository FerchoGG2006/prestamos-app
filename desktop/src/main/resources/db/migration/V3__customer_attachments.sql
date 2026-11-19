CREATE TABLE customer_attachment (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer(id), original_name TEXT NOT NULL,
 stored_name TEXT NOT NULL UNIQUE, media_type TEXT NOT NULL, byte_size BIGINT NOT NULL,
 sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_attachment_customer ON customer_attachment(customer_id);
