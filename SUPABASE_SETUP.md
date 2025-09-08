# Supabase Setup Guide for Metroranta

## 🗄️ Database Setup

1. **Create a Supabase Project**
   - Go to https://supabase.com
   - Create a new project
   - Choose a database password

2. **Run the Schema**
   - In your Supabase dashboard, go to **SQL Editor**
   - Copy the contents of `supabase/schema.sql`
   - Run the SQL to create tables, indexes, and policies

3. **Get Your Credentials**
   - Go to **Settings** → **API**
   - Copy your:
     - Project URL
     - Anon/Public Key

4. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Add your Supabase credentials:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## 🎯 Features Implemented

### ✅ Amenity Caching (24h TTL)
- Overpass API results cached in `cached_amenities` table
- Automatic cache invalidation after 24 hours
- Reduces API calls and improves performance

### ✅ User Suggestions
- Users can suggest new amenities via the UI
- Suggestions stored in `user_suggested_amenities` table
- Status workflow: `pending` → `approved`/`rejected`
- Approved suggestions appear on the map

### ✅ User Reporting/Flagging
- Users can report issues with existing amenities
- Flag types: incorrect location, permanently closed, wrong type, etc.
- Stored in `user_flagged_amenities` table
- IP address tracking for moderation

## 🔒 Security Features

- **Row Level Security (RLS)** enabled on all tables
- **IP-based access control** for user submissions
- **Rate limiting** built into Supabase
- **Anonymous users** can view and submit data
- **No personal data** stored (only IP addresses)

## 📊 Database Tables

| Table | Purpose | Key Features |
|-------|---------|-------------|
| `cached_amenities` | Cache Overpass API results | 24h TTL, geospatial indexing |
| `user_suggested_amenities` | User-contributed amenities | Status workflow, moderation |
| `user_flagged_amenities` | Issue reports | IP tracking, flag categorization |
| `cache_metadata` | Cache management | Area-based cache tracking |

## 🛠️ Development Workflow

1. **Local Development:**
   ```bash
   npm run dev
   ```
   - Uses CORS proxy for Overpass API
   - Supabase handles all database operations

2. **Testing Database Features:**
   - Add a suggestion → Check `user_suggested_amenities` table
   - Report an issue → Check `user_flagged_amenities` table
   - Load map → Check cache performance in `cached_amenities`

3. **Production Deployment:**
   - Environment variables automatically used in build
   - Direct Overpass API access (no CORS proxy needed)

## 📈 Monitoring & Analytics

In your Supabase dashboard, you can:
- Monitor API usage in **Settings** → **Usage**
- View database activity in **Database** → **Logs**
- Check table contents in **Database** → **Tables**
- Analyze user activity patterns

## 🚀 Future Enhancements

- **Admin dashboard** for reviewing suggestions/flags
- **Email notifications** for status updates
- **Geospatial queries** for better area-based caching
- **User accounts** for tracking contributions
- **Machine learning** for automatic suggestion approval