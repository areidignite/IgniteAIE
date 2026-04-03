/*
  # Add knowledge_base_name column to documents

  1. Modified Tables
    - `documents`
      - `knowledge_base_name` (text, nullable) - stores the name of the knowledge base used to generate the document

  2. Notes
    - Existing documents will have NULL for this column
    - Only populated when a knowledge base was used (used_knowledge_base = true)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'knowledge_base_name'
  ) THEN
    ALTER TABLE documents ADD COLUMN knowledge_base_name text;
  END IF;
END $$;