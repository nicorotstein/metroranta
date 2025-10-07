-- Drop old function if exists
DROP FUNCTION IF EXISTS delete_outdated_amenities(BIGINT[], TEXT[]);

-- Function to delete outdated cached amenities
-- This function runs with elevated privileges to bypass RLS
CREATE OR REPLACE FUNCTION delete_outdated_amenities(
    external_ids_to_delete TEXT[],
    types_to_delete TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    i INTEGER;
BEGIN
    -- Delete amenities that match the provided external_id and type pairs
    FOR i IN 1..array_length(external_ids_to_delete, 1) LOOP
        DELETE FROM cached_amenities
        WHERE external_id = external_ids_to_delete[i]
        AND type = types_to_delete[i];

        deleted_count := deleted_count + 1;
    END LOOP;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION delete_outdated_amenities(TEXT[], TEXT[]) TO anon, authenticated;
