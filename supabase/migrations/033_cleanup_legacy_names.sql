-- =============================================================================
-- 033 - Cleanup legacy names and defaults
--
-- Migration 014 handled much of the rebrand from "Rock Talk" to "Earth Talk".
-- This migration cleans up remaining hardcoded defaults in the schema and
-- ensures all system-generated strings use the current platform name.
-- =============================================================================

BEGIN;

-- 1. Update validation reference labels default organization
ALTER TABLE public.validation_reference_labels 
  ALTER COLUMN reviewer_organization SET DEFAULT 'Earth Talk Geological Evaluation Group';

-- 2. Update existing 'Rock Talk' organization labels to 'Earth Talk'
UPDATE public.validation_reference_labels
SET reviewer_organization = replace(reviewer_organization, 'Rock Talk', 'Earth Talk')
WHERE reviewer_organization LIKE '%Rock Talk%';

-- 3. Update GIS layer categories and attribution for consistency
-- Note: public.gis_layers defines display_name, data_source, and source_attribution (no description column in 011).
UPDATE public.gis_layers
SET source_attribution = replace(source_attribution, 'Rock Talk', 'Earth Talk'),
    display_name = replace(display_name, 'Rock Talk', 'Earth Talk'),
    data_source = replace(data_source, 'Rock Talk', 'Earth Talk')
WHERE source_attribution LIKE '%Rock Talk%' 
   OR display_name LIKE '%Rock Talk%'
   OR data_source LIKE '%Rock Talk%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gis_layers'
      AND column_name = 'description'
  ) THEN
    EXECUTE $sql$
      UPDATE public.gis_layers
      SET description = replace(description, 'Rock Talk', 'Earth Talk')
      WHERE description LIKE '%Rock Talk%'
    $sql$;
  END IF;
END
$$;

-- 4. Update community sites and investigations for any legacy mentions
-- These are less likely but included for completeness.
UPDATE public.geological_sites
SET title = replace(title, 'Rock Talk', 'Earth Talk'),
    description = replace(description, 'Rock Talk', 'Earth Talk')
WHERE title LIKE '%Rock Talk%' OR description LIKE '%Rock Talk%';

UPDATE public.community_investigations
SET question = replace(question, 'Rock Talk', 'Earth Talk'),
    context = replace(context, 'Rock Talk', 'Earth Talk')
WHERE question LIKE '%Rock Talk%' OR context LIKE '%Rock Talk%';

-- 5. Update validation dataset codes in descriptions (sample_code was e.g. RT-VAL-0001)
-- We don't change unique sample_codes as they are primary identifiers, but we 
-- can update the comments/descriptions if any exist.
UPDATE public.validation_datasets
SET description = replace(description, 'Rock Talk', 'Earth Talk')
WHERE description LIKE '%Rock Talk%';

COMMIT;
