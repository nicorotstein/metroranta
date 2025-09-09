-- Migration: Fix amenity ID data type mismatch
-- Date: 2025-01-08
-- Description: Change external_amenity_id from bigint to text to match Overpass API IDs

-- Drop the existing flagging function first
DROP FUNCTION IF EXISTS flag_amenity_and_check_threshold(TEXT, TEXT);

-- Drop views that depend on the columns we need to modify
DROP VIEW IF EXISTS active_amenities;
DROP VIEW IF EXISTS fresh_cached_amenities;

-- Change external_amenity_id column type to TEXT
ALTER TABLE user_flagged_amenities 
ALTER COLUMN external_amenity_id TYPE TEXT;

-- Also update cached_amenities if needed (make sure external_id is TEXT)
ALTER TABLE cached_amenities 
ALTER COLUMN external_id TYPE TEXT;

-- Recreate the fresh_cached_amenities view
CREATE VIEW fresh_cached_amenities AS
SELECT *
FROM cached_amenities
WHERE cached_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
AND archived_at IS NULL;

-- Recreate the active_amenities view
CREATE VIEW active_amenities AS
SELECT 
    'cached' as source,
    id::text as id,
    external_id::text as source_id,
    type,
    name,
    latitude,
    longitude,
    tags,
    distance_to_route,
    cached_at as created_at
FROM fresh_cached_amenities
WHERE archived_at IS NULL  -- Only non-archived items
UNION ALL
SELECT
    'user_suggested' as source,
    id::text as id,
    id::text as source_id,
    type,
    name,
    latitude,
    longitude,
    '{}'::jsonb as tags,
    distance_to_route,
    suggested_at as created_at
FROM user_suggested_amenities
WHERE status = 'approved' 
AND archived_at IS NULL;  -- Only non-archived items

-- Recreate the flagging function with correct types
CREATE OR REPLACE FUNCTION flag_amenity_and_check_threshold(
    amenity_id TEXT,
    amenity_type TEXT
)
RETURNS JSONB AS $$
DECLARE
    flag_count INTEGER;
    amenity_archived BOOLEAN := FALSE;
BEGIN
    -- Insert the flag
    INSERT INTO user_flagged_amenities (
        external_amenity_id,
        amenity_type,
        user_agent
    ) VALUES (
        amenity_id,
        amenity_type,
        COALESCE(current_setting('request.headers', true)::jsonb->>'user-agent', 'Unknown')
    );
    
    -- Count total flags for this amenity
    SELECT COUNT(*) INTO flag_count
    FROM user_flagged_amenities ufa
    WHERE ufa.external_amenity_id = flag_amenity_and_check_threshold.amenity_id
    AND ufa.amenity_type = flag_amenity_and_check_threshold.amenity_type
    AND ufa.archived_at IS NULL;
    
    -- If 3 or more flags, archive the cached amenity
    IF flag_count >= 3 THEN
        UPDATE cached_amenities ca
        SET 
            archived_at = CURRENT_TIMESTAMP,
            archival_reason = 'too many flags'
        WHERE 
            ca.external_id = flag_amenity_and_check_threshold.amenity_id
            AND ca.type = flag_amenity_and_check_threshold.amenity_type
            AND ca.archived_at IS NULL;
        
        -- Check if any rows were updated
        amenity_archived = FOUND;
        
        IF amenity_archived THEN
            -- Also archive all flags for this amenity to clean up
            UPDATE user_flagged_amenities ufa2
            SET archived_at = CURRENT_TIMESTAMP
            WHERE ufa2.external_amenity_id = flag_amenity_and_check_threshold.amenity_id
            AND ufa2.amenity_type = flag_amenity_and_check_threshold.amenity_type
            AND ufa2.archived_at IS NULL;
        END IF;
    END IF;
    
    -- Return result
    RETURN jsonb_build_object(
        'flag_count', flag_count,
        'amenity_archived', amenity_archived,
        'threshold_reached', flag_count >= 3
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION flag_amenity_and_check_threshold(TEXT, TEXT) TO anon, authenticated;

-- Update indexes to work with TEXT type
DROP INDEX IF EXISTS idx_user_flags_external_amenity;
CREATE INDEX IF NOT EXISTS idx_user_flags_external_amenity 
ON user_flagged_amenities(external_amenity_id, amenity_type) 
WHERE archived_at IS NULL;

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('005_fix_amenity_id_type', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;