-- Add email column to user_profiles if it does not exist.
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS email VARCHAR(255);
