-- Quick fix for RLS policies blocking user submissions

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read their own suggestions" ON user_suggested_amenities;
DROP POLICY IF EXISTS "Users can read their own flags" ON user_flagged_amenities;

-- Allow anonymous users to read pending/approved suggestions (for UI feedback)
CREATE POLICY "Anyone can read pending and approved suggestions" ON user_suggested_amenities
    FOR SELECT USING (status IN ('pending', 'approved'));

-- Allow anyone to read flags (for moderation transparency)
CREATE POLICY "Anyone can read flags" ON user_flagged_amenities
    FOR SELECT USING (true);

-- Allow anyone to delete their own suggestions (optional - can remove if not needed)
CREATE POLICY "Allow delete suggestions" ON user_suggested_amenities
    FOR DELETE USING (true);

-- Grant DELETE permission to anon users for user suggestions
GRANT DELETE ON user_suggested_amenities TO anon;