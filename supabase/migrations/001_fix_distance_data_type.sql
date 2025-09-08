-- Migration: Fix distance_to_route data type from INTEGER to REAL
-- Date: 2025-01-08
-- Description: Change distance_to_route columns to support decimal values

-- Update cached_amenities table
ALTER TABLE cached_amenities 
ALTER COLUMN distance_to_route TYPE REAL;

-- Update user_suggested_amenities table  
ALTER TABLE user_suggested_amenities 
ALTER COLUMN distance_to_route TYPE REAL;

-- Add comment for documentation
COMMENT ON COLUMN cached_amenities.distance_to_route IS 'Distance to route in meters (decimal precision)';
COMMENT ON COLUMN user_suggested_amenities.distance_to_route IS 'Distance to route in meters (decimal precision)';

-- Update any existing integer values (this is safe as INTEGER can convert to REAL)
-- No data conversion needed as PostgreSQL handles this automatically

-- Log the migration
INSERT INTO public.migration_log (migration_name, applied_at) 
VALUES ('001_fix_distance_data_type', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;