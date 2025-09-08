-- Metroranta Database Migration Runner
-- Run this script in your Supabase SQL Editor to apply all migrations

-- Check if this is a fresh database or existing one
DO $$
BEGIN
    -- Check if migration_log table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        RAISE NOTICE 'Fresh database detected. Running initial schema...';
        -- This will run the initial schema in the migration file
    ELSE
        RAISE NOTICE 'Existing database detected. Running migrations...';
    END IF;
END $$;

-- Run migrations in order
-- Migration 000: Initial schema (only if tables don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cached_amenities') THEN
        RAISE NOTICE 'Running migration 000_initial_schema...';
        -- The initial schema will be applied here
        -- (You need to copy the content from 000_initial_schema.sql)
    ELSE
        RAISE NOTICE 'Skipping migration 000_initial_schema (tables already exist)';
    END IF;
END $$;

-- Migration 001: Fix distance data type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.migration_log 
        WHERE migration_name = '001_fix_distance_data_type'
    ) THEN
        RAISE NOTICE 'Running migration 001_fix_distance_data_type...';
        
        -- Update cached_amenities table
        ALTER TABLE cached_amenities 
        ALTER COLUMN distance_to_route TYPE REAL;

        -- Update user_suggested_amenities table  
        ALTER TABLE user_suggested_amenities 
        ALTER COLUMN distance_to_route TYPE REAL;

        -- Add comments for documentation
        COMMENT ON COLUMN cached_amenities.distance_to_route IS 'Distance to route in meters (decimal precision)';
        COMMENT ON COLUMN user_suggested_amenities.distance_to_route IS 'Distance to route in meters (decimal precision)';

        -- Log the migration
        INSERT INTO public.migration_log (migration_name, applied_at) 
        VALUES ('001_fix_distance_data_type', CURRENT_TIMESTAMP);
        
        RAISE NOTICE 'Migration 001_fix_distance_data_type completed successfully';
    ELSE
        RAISE NOTICE 'Skipping migration 001_fix_distance_data_type (already applied)';
    END IF;
END $$;

-- Show migration status
SELECT 
    migration_name,
    applied_at,
    applied_at::date as applied_date
FROM public.migration_log 
ORDER BY applied_at;

RAISE NOTICE 'All migrations completed successfully!';