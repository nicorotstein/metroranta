-- Migration: Fix cache_metadata unique constraint
-- Date: 2025-01-08  
-- Description: Update cache_metadata table to handle JSONB bounds properly

-- Drop the existing unique constraint (it was causing issues with JSONB comparison)
ALTER TABLE cache_metadata DROP CONSTRAINT IF EXISTS cache_metadata_area_bounds_amenity_type_key;

-- Since JSONB comparison for exact equality can be tricky, we'll use a different approach
-- Add a hash column for faster lookups and proper uniqueness
ALTER TABLE cache_metadata ADD COLUMN IF NOT EXISTS bounds_hash VARCHAR(64);

-- Create an index on the hash instead of the JSONB directly  
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_metadata_bounds_hash_type 
ON cache_metadata(bounds_hash, amenity_type);

-- Create a function to generate consistent bounds hash
CREATE OR REPLACE FUNCTION generate_bounds_hash(bounds_json TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(bounds_json, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing records to have bounds_hash
UPDATE cache_metadata 
SET bounds_hash = generate_bounds_hash(area_bounds::text)
WHERE bounds_hash IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN cache_metadata.bounds_hash IS 'SHA256 hash of area_bounds for efficient lookups and uniqueness';
COMMENT ON COLUMN cache_metadata.area_bounds IS 'JSONB object containing north, south, east, west coordinates';

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('002_fix_cache_metadata_constraint', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;