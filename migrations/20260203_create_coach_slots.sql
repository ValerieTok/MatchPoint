-- Create coach slots table (per listing availability)

CREATE TABLE IF NOT EXISTS coach_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coach_id INT NOT NULL,
  listing_id INT NULL,
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  duration_minutes INT NOT NULL,
  location VARCHAR(255) NULL,
  note TEXT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coach_slots_coach (coach_id),
  INDEX idx_coach_slots_listing (listing_id)
);
