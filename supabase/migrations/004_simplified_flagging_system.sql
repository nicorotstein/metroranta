-- Migration: Simplified flagging system with auto-archival
-- Date: 2025-01-08
-- Description: Simplify flagging to single report action and auto-archive amenities with 3+ flags

-- Add archival_reason column to cached_amenities
ALTER TABLE cached_amenities 
ADD COLUMN IF NOT EXISTS archival_reason TEXT;

-- Simplify user_flagged_amenities table structure
ALTER TABLE user_flagged_amenities 
DROP COLUMN IF EXISTS flag_type,
DROP COLUMN IF EXISTS flag_reason;

-- Add simple flag_count to track multiple reports on same amenity
-- (We'll use a function to count flags instead of a column for data integrity)

-- Create function to handle flagging and auto-archival
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
        current_setting('request.headers')::jsonb->>'user-agent'
    );
    
    -- Count total flags for this amenity
    SELECT COUNT(*) INTO flag_count
    FROM user_flagged_amenities
    WHERE external_amenity_id = amenity_id
    AND amenity_type = flag_amenity_and_check_threshold.amenity_type
    AND archived_at IS NULL;
    
    -- If 3 or more flags, archive the cached amenity
    IF flag_count >= 3 THEN
        UPDATE cached_amenities
        SET 
            archived_at = CURRENT_TIMESTAMP,
            archival_reason = 'too many flags'
        WHERE 
            external_id = amenity_id
            AND type = amenity_type
            AND archived_at IS NULL;
        
        -- Check if any rows were updated
        GET DIAGNOSTICS amenity_archived = FOUND;
        
        IF amenity_archived THEN
            -- Also archive all flags for this amenity to clean up
            UPDATE user_flagged_amenities
            SET archived_at = CURRENT_TIMESTAMP
            WHERE external_amenity_id = amenity_id
            AND amenity_type = flag_amenity_and_check_threshold.amenity_type
            AND archived_at IS NULL;
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

-- Update cached amenities query to filter archived items
-- (getCachedAmenities already filters by archived_at IS NULL, so no change needed)

-- Add index on external_amenity_id for performance
CREATE INDEX IF NOT EXISTS idx_user_flags_external_amenity 
ON user_flagged_amenities(external_amenity_id, amenity_type) 
WHERE archived_at IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN cached_amenities.archival_reason IS 'Reason why amenity was archived (e.g., "too many flags")';
COMMENT ON FUNCTION flag_amenity_and_check_threshold(TEXT, TEXT) IS 'Flag an amenity and auto-archive if it reaches 3+ flags';

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('004_simplified_flagging_system', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;