/*
  # Add model information to documents table

  ## Changes
  - Add `model_arn` column to store the full model ARN used for generation
  - Add `model_name` column to store the human-readable model name for display
  
  ## Purpose
  This allows users to see which foundation model was used to generate each document,
  making it easier to track and compare outputs from different models.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'model_arn'
  ) THEN
    ALTER TABLE documents ADD COLUMN model_arn text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'model_name'
  ) THEN
    ALTER TABLE documents ADD COLUMN model_name text;
  END IF;
END $$;
