-- Allow multiple slots per listing in cart

CREATE INDEX idx_booking_cart_user ON booking_cart_items (user_id);

ALTER TABLE booking_cart_items
  DROP INDEX uniq_booking_cart;

CREATE UNIQUE INDEX uniq_booking_cart_slot ON booking_cart_items (user_id, slot_id);
