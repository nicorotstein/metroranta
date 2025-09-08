-- Fix IP address tracking for user submissions
-- This uses Supabase's built-in functions to capture IP addresses

-- Create a function to automatically set IP address on insert
CREATE OR REPLACE FUNCTION set_user_ip_address()
RETURNS TRIGGER AS $$
BEGIN
    -- Set IP address from the connection if not already set
    IF NEW.user_ip_address IS NULL THEN
        NEW.user_ip_address = inet_client_addr();
    END IF;
    
    -- If inet_client_addr() returns NULL (local connections), use a placeholder
    IF NEW.user_ip_address IS NULL THEN
        NEW.user_ip_address = '127.0.0.1'::inet;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to automatically set IP address on insert
DROP TRIGGER IF EXISTS set_ip_on_suggestion_insert ON user_suggested_amenities;
CREATE TRIGGER set_ip_on_suggestion_insert
    BEFORE INSERT ON user_suggested_amenities
    FOR EACH ROW EXECUTE FUNCTION set_user_ip_address();

DROP TRIGGER IF EXISTS set_ip_on_flag_insert ON user_flagged_amenities;
CREATE TRIGGER set_ip_on_flag_insert
    BEFORE INSERT ON user_flagged_amenities
    FOR EACH ROW EXECUTE FUNCTION set_user_ip_address();

-- Update RLS policies to work with automatic IP setting
DROP POLICY IF EXISTS "Users can read their own suggestions" ON user_suggested_amenities;
DROP POLICY IF EXISTS "Users can read their own flags" ON user_flagged_amenities;

-- Allow users to see their own submissions based on IP (if we want this feature)
CREATE POLICY "Users can read their own submissions" ON user_suggested_amenities
    FOR SELECT USING (user_ip_address = inet_client_addr() OR user_ip_address IS NULL);

CREATE POLICY "Users can read their own flag submissions" ON user_flagged_amenities
    FOR SELECT USING (user_ip_address = inet_client_addr() OR user_ip_address IS NULL);

-- Allow users to delete their own suggestions
CREATE POLICY "Users can delete their own suggestions" ON user_suggested_amenities
    FOR DELETE USING (user_ip_address = inet_client_addr() OR user_ip_address IS NULL);

-- Test the function
SELECT 
    'IP tracking setup complete' as status,
    inet_client_addr() as your_ip_address;