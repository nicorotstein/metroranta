-- Migration: Fix ambiguous column references in flagging function
-- Date: 2025-01-08
-- Description: Fix ambiguous column reference error in flag_amenity_and_check_threshold function

-- Drop and recreate the flagging function with proper table aliases
DROP FUNCTION IF EXISTS flag_amenity_and_check_threshold(TEXT, TEXT);

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
    
    -- Count total flags for this amenity (using table aliases to avoid ambiguity)
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

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('005.1_fix_function_ambiguous_columns', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;