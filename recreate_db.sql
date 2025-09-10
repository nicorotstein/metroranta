-- Recreate the cached amenities database

-- Drop existing tables and views
DROP VIEW IF EXISTS fresh_cached_amenities CASCADE;
DROP TABLE IF EXISTS cached_amenities CASCADE;
DROP TABLE IF EXISTS user_suggested_amenities CASCADE;
DROP TABLE IF EXISTS amenity_flags CASCADE;

-- Create cached_amenities table
CREATE TABLE cached_amenities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    tags JSONB DEFAULT '{}',
    distance_to_route DECIMAL(8, 1),
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    UNIQUE(external_id, type)
);

-- Create user_suggested_amenities table
CREATE TABLE user_suggested_amenities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    distance_to_route DECIMAL(8, 1),
    status TEXT DEFAULT 'pending',
    user_agent TEXT,
    user_ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Create amenity_flags table
CREATE TABLE amenity_flags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id TEXT NOT NULL,
    type TEXT NOT NULL,
    user_agent TEXT,
    user_ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the fresh_cached_amenities view
CREATE VIEW fresh_cached_amenities AS
SELECT 
    id,
    external_id,
    type,
    name,
    latitude,
    longitude,
    tags,
    distance_to_route,
    cached_at,
    updated_at
FROM cached_amenities
WHERE 
    archived_at IS NULL
    AND cached_at > NOW() - INTERVAL '24 hours';

-- Enable RLS
ALTER TABLE cached_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_suggested_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenity_flags ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read access" ON cached_amenities FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON cached_amenities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON cached_amenities FOR UPDATE USING (true);

CREATE POLICY "Allow public read access" ON user_suggested_amenities FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON user_suggested_amenities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON user_suggested_amenities FOR UPDATE USING (true);

CREATE POLICY "Allow public insert access" ON amenity_flags FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON cached_amenities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON user_suggested_amenities TO anon, authenticated;
GRANT INSERT ON amenity_flags TO anon, authenticated;
GRANT SELECT ON fresh_cached_amenities TO anon, authenticated;

-- Create indexes for performance
CREATE INDEX idx_cached_amenities_type ON cached_amenities(type);
CREATE INDEX idx_cached_amenities_location ON cached_amenities(latitude, longitude);
CREATE INDEX idx_cached_amenities_cached_at ON cached_amenities(cached_at);
CREATE INDEX idx_user_suggested_amenities_type ON user_suggested_amenities(type);
CREATE INDEX idx_user_suggested_amenities_location ON user_suggested_amenities(latitude, longitude);