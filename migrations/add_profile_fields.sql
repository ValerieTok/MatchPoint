-- Add bio and photo columns to users table
-- Run this migration if these columns don't exist

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS photo VARCHAR(255);
