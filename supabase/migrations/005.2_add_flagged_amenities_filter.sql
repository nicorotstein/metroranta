-- Migration: Add function to filter out heavily flagged amenities
-- Date: 2025-01-08
-- Description: Add function to check if amenities have been flagged 3+ times for UI filtering

-- Create function to get heavily flagged amenities
CREATE OR REPLACE FUNCTION get_heavily_flagged_amenities(
    amenity_type TEXT DEFAULT NULL
)
RETURNS TABLE(external_id TEXT, amenity_type_out TEXT, flag_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ufa.external_amenity_id as external_id,
        ufa.amenity_type as amenity_type_out,
        COUNT(*) as flag_count
    FROM user_flagged_amenities ufa
    WHERE ufa.archived_at IS NULL
    AND (amenity_type IS NULL OR ufa.amenity_type = get_heavily_flagged_amenities.amenity_type)
    GROUP BY ufa.external_amenity_id, ufa.amenity_type
    HAVING COUNT(*) >= 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_heavily_flagged_amenities(TEXT) TO anon, authenticated;

-- Create simpler function to check if a single amenity is heavily flagged
CREATE OR REPLACE FUNCTION is_amenity_heavily_flagged(
    amenity_id TEXT,
    amenity_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    flag_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO flag_count
    FROM user_flagged_amenities ufa
    WHERE ufa.external_amenity_id = amenity_id
    AND ufa.amenity_type = is_amenity_heavily_flagged.amenity_type
    AND ufa.archived_at IS NULL;
    
    RETURN flag_count >= 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION is_amenity_heavily_flagged(TEXT, TEXT) TO anon, authenticated;

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('005.2_add_flagged_amenities_filter', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;