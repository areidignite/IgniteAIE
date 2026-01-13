/*
  # Add used_knowledge_base column to documents table

  1. Changes
    - Add `used_knowledge_base` boolean column to `documents` table
    - Defaults to true for backward compatibility with existing records
    - Tracks whether the Knowledge Base (RAG) was used to generate the document

  2. Notes
    - Existing documents will have this field set to true by default
    - New documents will explicitly set this based on user's checkbox selection
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'used_knowledge_base'
  ) THEN
    ALTER TABLE documents ADD COLUMN used_knowledge_base boolean DEFAULT true;
  END IF;
END $$;