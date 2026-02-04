-- Booking flow updates for slot-based availability and dual completion

ALTER TABLE booking_cart_items
  ADD COLUMN slot_id INT NULL;

ALTER TABLE booking_items
  ADD COLUMN slot_id INT NULL;

ALTER TABLE bookings
  ADD COLUMN user_completed_at DATETIME NULL,
  ADD COLUMN coach_completed_at DATETIME NULL;

-- Optional: ensure coach slots have availability flag
-- ALTER TABLE coach_slots ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1;

-- Per-listing availability
-- ALTER TABLE coach_slots ADD COLUMN listing_id INT NULL;
