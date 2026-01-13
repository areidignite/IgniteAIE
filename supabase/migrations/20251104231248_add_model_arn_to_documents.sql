/*
  # Add model_arn column to documents table

  1. Changes
    - Add `model_arn` column to `documents` table to track which model was used to generate each document
    - Add `model_name` column to store a user-friendly display name for the model

  2. Notes
    - Using `text` type for model_arn as it's a string identifier from AWS Bedrock
    - Using `text` type for model_name for display purposes
    - Both columns are nullable for backward compatibility with existing documents
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