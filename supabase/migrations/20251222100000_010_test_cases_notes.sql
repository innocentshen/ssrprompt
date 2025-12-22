/*
  # Add notes field to test_cases

  1. Changes
    - Add `notes` column to `test_cases` table
    - Notes are for user reference only, not sent to AI during evaluation

  2. Notes
    - This migration adds a text column to store test case notes/comments
    - The field is nullable and has no default value
*/

-- Add notes column to test_cases if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases' AND column_name = 'notes'
  ) THEN
    ALTER TABLE test_cases ADD COLUMN notes text;
  END IF;
END $$;
