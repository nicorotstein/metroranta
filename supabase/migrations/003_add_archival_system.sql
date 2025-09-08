-- Migration: Add archival system for soft deletion
-- Date: 2025-01-08
-- Description: Add archived_at timestamp columns and update queries to filter archived items

-- Add archival columns to user_suggested_amenities
ALTER TABLE user_suggested_amenities 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add archival columns to user_flagged_amenities (for completeness)
ALTER TABLE user_flagged_amenities 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add archival columns to cached_amenities (for future use)
ALTER TABLE cached_amenities 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Create indexes on archival columns for performance
CREATE INDEX IF NOT EXISTS idx_user_suggestions_archived 
ON user_suggested_amenities(archived_at) 
WHERE archived_at IS NULL; -- Partial index for active items only

CREATE INDEX IF NOT EXISTS idx_user_flags_archived 
ON user_flagged_amenities(archived_at) 
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cached_amenities_archived 
ON cached_amenities(archived_at) 
WHERE archived_at IS NULL;

-- Update existing views to exclude archived items
DROP VIEW IF EXISTS active_amenities;
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

-- Create a view for non-archived user suggestions
CREATE VIEW active_user_suggestions AS
SELECT *
FROM user_suggested_amenities
WHERE archived_at IS NULL;

-- Create a view for non-archived user flags
CREATE VIEW active_user_flags AS
SELECT *
FROM user_flagged_amenities
WHERE archived_at IS NULL;

-- Update RLS policies to work with archival system
DROP POLICY IF EXISTS "Anyone can read pending and approved suggestions" ON user_suggested_amenities;
CREATE POLICY "Anyone can read active pending and approved suggestions" ON user_suggested_amenities
    FOR SELECT USING (status IN ('pending', 'approved') AND archived_at IS NULL);

DROP POLICY IF EXISTS "Users can read their own submissions" ON user_suggested_amenities;
CREATE POLICY "Users can read their own active submissions" ON user_suggested_amenities
    FOR SELECT USING (
        (user_ip_address = inet_client_addr() OR user_ip_address IS NULL) 
        AND archived_at IS NULL
    );

-- Allow users to "delete" (archive) their own suggestions
DROP POLICY IF EXISTS "Users can delete their own suggestions" ON user_suggested_amenities;
CREATE POLICY "Users can archive their own suggestions" ON user_suggested_amenities
    FOR UPDATE USING (
        (user_ip_address = inet_client_addr() OR user_ip_address IS NULL)
        AND archived_at IS NULL  -- Can only archive non-archived items
    );

-- Remove the DELETE policy since we don't want actual deletion
DROP POLICY IF EXISTS "Allow delete suggestions" ON user_suggested_amenities;
REVOKE DELETE ON user_suggested_amenities FROM anon;

-- Create function to archive (soft delete) user suggestions
CREATE OR REPLACE FUNCTION archive_user_suggestion(suggestion_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    -- Update the archived_at timestamp
    UPDATE user_suggested_amenities 
    SET archived_at = CURRENT_TIMESTAMP
    WHERE id = suggestion_id 
    AND archived_at IS NULL  -- Only archive if not already archived
    AND (user_ip_address = inet_client_addr() OR user_ip_address IS NULL); -- Security check
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the archive function
GRANT EXECUTE ON FUNCTION archive_user_suggestion(UUID) TO anon, authenticated;

-- Add comments for documentation
COMMENT ON COLUMN user_suggested_amenities.archived_at IS 'Timestamp when suggestion was archived (soft deleted). NULL means active.';
COMMENT ON COLUMN user_flagged_amenities.archived_at IS 'Timestamp when flag was archived (soft deleted). NULL means active.';
COMMENT ON COLUMN cached_amenities.archived_at IS 'Timestamp when cached amenity was archived. NULL means active.';
COMMENT ON FUNCTION archive_user_suggestion(UUID) IS 'Soft delete a user suggestion by setting archived_at timestamp';

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('003_add_archival_system', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;