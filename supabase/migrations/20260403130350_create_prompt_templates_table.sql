/*
  # Create prompt_templates table

  1. New Tables
    - `prompt_templates`
      - `id` (uuid, primary key) - Unique identifier for each template
      - `user_id` (uuid, foreign key) - References the auth user who owns this template
      - `name` (text, not null) - Display name for the template
      - `description` (text) - Optional short description of what the template is for
      - `content` (text, not null) - The actual prompt template text with optional placeholders
      - `category` (text) - Optional category for organizing templates (e.g., "Technical", "Past Performance")
      - `is_favorite` (boolean, default false) - Whether the user has marked this as a favorite for quick access
      - `usage_count` (integer, default 0) - Tracks how often the template is used for sorting
      - `created_at` (timestamptz, default now()) - When the template was created
      - `updated_at` (timestamptz, default now()) - When the template was last modified

  2. Security
    - Enable RLS on `prompt_templates` table
    - Add policy for authenticated users to read their own templates
    - Add policy for authenticated users to insert their own templates
    - Add policy for authenticated users to update their own templates
    - Add policy for authenticated users to delete their own templates

  3. Indexes
    - Index on user_id for fast lookups
    - Index on category for filtering

  4. Notes
    - Each user can only access their own templates
    - Templates are personal and not shared between users
    - The usage_count helps surface frequently used templates
*/

CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  content text NOT NULL,
  category text DEFAULT '',
  is_favorite boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own templates"
  ON prompt_templates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON prompt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON prompt_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON prompt_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
