/*
  # Add workspace table

  1. New Tables
    - `workspace`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `content` (text) - The workspace content being built
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `workspace` table
    - Add policy for users to read their own workspace
    - Add policy for users to insert their own workspace
    - Add policy for users to update their own workspace
    - Add policy for users to delete their own workspace

  3. Notes
    - Each user can have one workspace
    - The workspace is where they build documents by combining generated content
*/

CREATE TABLE IF NOT EXISTS workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workspace"
  ON workspace FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspace"
  ON workspace FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspace"
  ON workspace FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workspace"
  ON workspace FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_workspace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_updated_at
  BEFORE UPDATE ON workspace
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_updated_at();
