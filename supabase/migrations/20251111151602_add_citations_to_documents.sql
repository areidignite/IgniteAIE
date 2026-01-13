/*
  # Add citations column to documents table

  1. Changes
    - Add `citations` JSONB column to `documents` table to store citation data with links
    - Citations will include text snippets and location metadata (S3 URIs, URLs, etc.)
    - Allows users to see and click on source links in generated documents
  
  2. Notes
    - JSONB format allows structured storage and querying of citation data
    - Each citation contains: text (snippet) and location (with URIs/links)
    - Default value is empty array for backwards compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'citations'
  ) THEN
    ALTER TABLE documents ADD COLUMN citations JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
