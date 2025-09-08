-- Migration: Initial schema setup
-- Date: 2025-01-08
-- Description: Create all tables, indexes, functions, and policies for Metroranta

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create migration log table first (for tracking migrations)
CREATE TABLE IF NOT EXISTS public.migration_log (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for caching Overpass API amenities
CREATE TABLE cached_amenities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('toilets', 'cafes', 'indoor')),
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    tags JSONB DEFAULT '{}',
    distance_to_route REAL,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(external_id, type)
);

-- Table for user-flagged amenities (reports/corrections)
CREATE TABLE user_flagged_amenities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amenity_id UUID, -- Reference to cached_amenities.id (nullable for external amenities)
    external_amenity_id BIGINT, -- Original Overpass API ID
    amenity_type VARCHAR(20) NOT NULL CHECK (amenity_type IN ('toilets', 'cafes', 'indoor')),
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('incorrect_location', 'closed_permanently', 'incorrect_type', 'duplicate', 'spam', 'other')),
    flag_reason TEXT,
    user_ip_address INET,
    user_agent TEXT,
    flagged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    
    FOREIGN KEY (amenity_id) REFERENCES cached_amenities(id) ON DELETE SET NULL
);

-- Table for user-suggested amenities
CREATE TABLE user_suggested_amenities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('toilets', 'cafes', 'indoor')),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    distance_to_route REAL,
    user_ip_address INET,
    user_agent TEXT,
    suggested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT
);

-- Table for cache metadata (to track when different areas were last fetched)
CREATE TABLE cache_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    area_bounds JSONB NOT NULL, -- Store bounding box: {"north": 60.2, "south": 60.1, "east": 24.9, "west": 24.8}
    amenity_type VARCHAR(20) NOT NULL CHECK (amenity_type IN ('toilets', 'cafes', 'indoor')),
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    amenity_count INTEGER DEFAULT 0,
    
    UNIQUE(area_bounds, amenity_type)
);

-- Create indexes for better performance
CREATE INDEX idx_cached_amenities_type ON cached_amenities(type);
CREATE INDEX idx_cached_amenities_location ON cached_amenities(latitude, longitude);
CREATE INDEX idx_cached_amenities_cached_at ON cached_amenities(cached_at);
CREATE INDEX idx_cached_amenities_external_id ON cached_amenities(external_id);

CREATE INDEX idx_flagged_amenities_ip ON user_flagged_amenities(user_ip_address);
CREATE INDEX idx_flagged_amenities_status ON user_flagged_amenities(status);
CREATE INDEX idx_flagged_amenities_type ON user_flagged_amenities(flag_type);
CREATE INDEX idx_flagged_amenities_flagged_at ON user_flagged_amenities(flagged_at);

CREATE INDEX idx_suggested_amenities_type ON user_suggested_amenities(type);
CREATE INDEX idx_suggested_amenities_location ON user_suggested_amenities(latitude, longitude);
CREATE INDEX idx_suggested_amenities_ip ON user_suggested_amenities(user_ip_address);
CREATE INDEX idx_suggested_amenities_status ON user_suggested_amenities(status);
CREATE INDEX idx_suggested_amenities_suggested_at ON user_suggested_amenities(suggested_at);

CREATE INDEX idx_cache_metadata_type ON cache_metadata(amenity_type);
CREATE INDEX idx_cache_metadata_fetched_at ON cache_metadata(last_fetched_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_cached_amenities_updated_at 
    BEFORE UPDATE ON cached_amenities 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for getting fresh cached amenities (not older than 24 hours)
CREATE VIEW fresh_cached_amenities AS
SELECT *
FROM cached_amenities
WHERE cached_at > (CURRENT_TIMESTAMP - INTERVAL '24 hours');

-- View for getting all active amenities (cached + approved user suggestions)
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
WHERE status = 'approved';

-- Function to check if cache is stale for a given area and type
CREATE OR REPLACE FUNCTION is_cache_stale(
    bounds_json JSONB,
    amenity_type_param VARCHAR(20)
) RETURNS BOOLEAN AS $$
DECLARE
    last_fetch TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT last_fetched_at INTO last_fetch
    FROM cache_metadata
    WHERE area_bounds = bounds_json 
    AND amenity_type = amenity_type_param;
    
    -- If no record exists or last fetch was more than 24 hours ago
    RETURN (last_fetch IS NULL OR last_fetch < (CURRENT_TIMESTAMP - INTERVAL '24 hours'));
END;
$$ LANGUAGE plpgsql;

-- Set up Row Level Security (RLS) policies

-- Enable RLS on all tables
ALTER TABLE cached_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flagged_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_suggested_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metadata ENABLE ROW LEVEL SECURITY;

-- Public read access for cached amenities (they're public data anyway)
CREATE POLICY "Public read access for cached amenities" ON cached_amenities
    FOR SELECT USING (true);

-- Allow insert/update for cached amenities (system operation)
CREATE POLICY "System can insert cached amenities" ON cached_amenities
    FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update cached amenities" ON cached_amenities
    FOR UPDATE USING (true);

-- Allow anyone to read approved user suggestions
CREATE POLICY "Public read access for approved suggestions" ON user_suggested_amenities
    FOR SELECT USING (status = 'approved');

-- Allow anyone to insert user suggestions (they'll be pending for review)
CREATE POLICY "Anyone can submit suggestions" ON user_suggested_amenities
    FOR INSERT WITH CHECK (true);

-- Allow users to read their own suggestions
CREATE POLICY "Users can read their own suggestions" ON user_suggested_amenities
    FOR SELECT USING (user_ip_address = inet_client_addr());

-- Allow anyone to insert flags (they'll be pending for review)
CREATE POLICY "Anyone can submit flags" ON user_flagged_amenities
    FOR INSERT WITH CHECK (true);

-- Allow users to read their own flags
CREATE POLICY "Users can read their own flags" ON user_flagged_amenities
    FOR SELECT USING (user_ip_address = inet_client_addr());

-- Allow system operations on cache metadata
CREATE POLICY "System operations on cache metadata" ON cache_metadata
    FOR ALL USING (true);

-- Grant necessary permissions to authenticated and anonymous users
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON cached_amenities TO anon, authenticated;
GRANT SELECT ON user_suggested_amenities TO anon, authenticated;
GRANT INSERT ON user_suggested_amenities TO anon, authenticated;
GRANT SELECT ON user_flagged_amenities TO anon, authenticated;
GRANT INSERT ON user_flagged_amenities TO anon, authenticated;
GRANT SELECT ON fresh_cached_amenities TO anon, authenticated;
GRANT SELECT ON active_amenities TO anon, authenticated;

-- Log this migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('000_initial_schema', CURRENT_TIMESTAMP);