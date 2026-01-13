/*
  # Add Password Reset Codes Table

  1. New Tables
    - `password_reset_codes`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid) - Reference to auth.users
      - `code` (text) - 4-digit reset code
      - `email` (text) - User email for verification
      - `expires_at` (timestamptz) - Expiration time (10 minutes)
      - `used` (boolean) - Whether code has been used
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on `password_reset_codes` table
    - Add policy for service role to manage codes
    - Add index on email and code for faster lookups
    - Add index on expires_at for cleanup

  3. Important Notes
    - Codes expire after 10 minutes
    - Codes are single-use only
    - Old codes are automatically invalidated when new ones are created
*/

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage reset codes"
  ON password_reset_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_code 
  ON password_reset_codes(email, code);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at 
  ON password_reset_codes(expires_at);
