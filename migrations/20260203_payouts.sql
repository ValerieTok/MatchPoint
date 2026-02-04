-- Payouts and multi-slot cart support

ALTER TABLE users
  ADD COLUMN payout_email VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS payout_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coach_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'SGD',
  paypal_email VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL,
  payout_batch_id VARCHAR(64) NULL,
  payout_item_id VARCHAR(64) NULL,
  failure_reason VARCHAR(255) NULL,
  INDEX idx_payout_requests_coach (coach_id),
  INDEX idx_payout_requests_status (status)
);

CREATE TABLE IF NOT EXISTS payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  coach_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'SGD',
  payout_batch_id VARCHAR(64) NULL,
  payout_item_id VARCHAR(64) NULL,
  payout_status VARCHAR(32) NOT NULL,
  raw_response TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payouts_coach (coach_id),
  INDEX idx_payouts_request (request_id)
);
