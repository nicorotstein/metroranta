# 🏃‍♂️ Metroranta - HEL Metroranta 50K Route Amenities

A React app that shows running route amenities (bathrooms, cafes, indoor spots) along the Helsinki Metroranta 50K course using real-time data from OpenStreetMap via Overpass API.

## ✨ Features

- 🗺️ **Interactive Map** - View the full 50K route with Leaflet
- 🚻 **Real Amenities** - Live data from OpenStreetMap (toilets, cafes, indoor spots)  
- 💾 **Smart Caching** - 24-hour cache in Supabase for better performance
- ✋ **User Contributions** - Suggest new spots and report issues
- 🎯 **Distance Calculation** - Shows distance from route to each amenity
- 📱 **Responsive Design** - Works on desktop and mobile

## 🚀 Quick Start

1. **Clone and install:**
   ```bash
   git clone https://github.com/nicorotstein/metroranta.git
   cd metroranta
   npm install
   ```

2. **Set up Supabase:**
   ```bash
   # Create project at https://supabase.com
   # Copy .env.example to .env and add your credentials:
   cp .env.example .env
   ```

3. **Run the schema:**
   - Go to your Supabase dashboard → SQL Editor
   - Copy and run the SQL from `supabase/schema.sql`

4. **Start development:**
   ```bash
   npm run dev
   ```

## 🗄️ Database Setup

The app uses **Supabase** for:
- **Caching Overpass API results** (24h TTL)
- **User-suggested amenities** with review workflow
- **Issue reporting** with IP-based moderation

### Environment Variables

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 🏗️ Architecture

- **Frontend:** React + Vite + Leaflet
- **Database:** Supabase (PostgreSQL)
- **APIs:** Overpass API for OpenStreetMap data
- **Hosting:** GitHub Pages with custom domain
- **Deployment:** GitHub Actions

## 📊 Data Flow

1. **Route Loading:** GPX data loaded from static JSON file
2. **Amenity Discovery:** Overpass API queried for nearby facilities
3. **Smart Caching:** Results cached in Supabase for 24 hours
4. **User Contributions:** Suggestions and reports stored in database
5. **Real-time Updates:** Map shows cached + approved user data

## 🛠️ Development

```bash
npm run dev      # Development server
npm run build    # Production build  
npm run preview  # Preview production build
npm run lint     # ESLint checking
```

## 🚀 Deployment

Automatic deployment via GitHub Actions:
- Push to `main` → Build → Deploy to GitHub Pages
- Custom domain: `metroranta.shoeme.fit`
- Environment variables managed in GitHub Secrets

## 🔒 Privacy & Security

- **No user accounts** - Anonymous contributions only
- **IP tracking** for moderation (not displayed publicly)
- **Rate limiting** via Supabase built-in protections
- **Row Level Security** enabled on all tables

## 📈 Performance

- **Efficient caching** reduces API calls by ~90%
- **Geospatial indexing** for fast location queries
- **Optimized bundles** with Vite code splitting
- **CDN delivery** via GitHub Pages

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with your own Supabase instance
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Built with ❤️ for the Helsinki running community