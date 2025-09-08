# 🗄️ Database Migrations

This directory contains all database schema migrations for the Metroranta app.

## 📁 Structure

```
supabase/
├── README.md                           # This file
├── schema.sql                          # Complete current schema
├── migrate.sql                         # Migration runner script
└── migrations/
    ├── 000_initial_schema.sql          # Initial database setup
    └── 001_fix_distance_data_type.sql  # Fix distance column types
```

## 🚀 Quick Setup (New Database)

If you're setting up a fresh Supabase project:

1. Go to your Supabase dashboard → **SQL Editor**
2. Copy and run the contents of `schema.sql`
3. Done! ✅

## 🔄 Migration System (Existing Database)

If you have an existing database that needs updates:

1. Go to your Supabase dashboard → **SQL Editor**
2. Copy and run the contents of `migrate.sql`
3. The script will automatically detect which migrations to run

## 📋 Migration Log

The system tracks applied migrations in the `migration_log` table:

```sql
SELECT * FROM public.migration_log ORDER BY applied_at;
```

## ➕ Adding New Migrations

When making database changes:

1. **Create a new migration file:**
   ```
   migrations/002_your_migration_name.sql
   ```

2. **Add it to `migrate.sql`:**
   ```sql
   -- Migration 002: Your migration description
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM public.migration_log 
           WHERE migration_name = '002_your_migration_name'
       ) THEN
           -- Your migration SQL here
           
           -- Log the migration
           INSERT INTO public.migration_log (migration_name, applied_at) 
           VALUES ('002_your_migration_name', CURRENT_TIMESTAMP);
       END IF;
   END $$;
   ```

3. **Update `schema.sql`** with the final state

## 🔍 Current Schema

### Tables:
- **`cached_amenities`** - Cache Overpass API results (24h TTL)
- **`user_suggested_amenities`** - User-contributed amenities
- **`user_flagged_amenities`** - Issue reports and corrections
- **`cache_metadata`** - Cache management metadata
- **`migration_log`** - Migration tracking

### Key Features:
- ✅ Row Level Security (RLS) policies
- ✅ Geospatial indexing for performance
- ✅ UUID primary keys
- ✅ JSONB for flexible metadata
- ✅ Real-time cache validation
- ✅ Anonymous user contributions

## 🐛 Troubleshooting

**Error: "invalid input syntax for type integer"**
- Run migration `001_fix_distance_data_type.sql`
- This changes distance columns from INTEGER to REAL

**Error: "relation does not exist"**
- Run the complete `schema.sql` file
- Your database is missing required tables

**Permission denied errors**
- Check RLS policies are properly applied
- Verify anon user grants are in place