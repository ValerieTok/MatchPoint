CREATE TABLE IF NOT EXISTS aml_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  alert_type VARCHAR(32) NOT NULL,
  reference_type VARCHAR(32) NOT NULL,
  reference_id INT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'SGD',
  reason VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  review_note VARCHAR(255) NULL,
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aml_user (user_id),
  INDEX idx_aml_created (created_at),
  INDEX idx_aml_type (alert_type),
  INDEX idx_aml_reference (reference_type, reference_id)
);
