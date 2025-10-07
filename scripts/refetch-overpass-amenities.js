import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase credentials not found in environment variables');
    console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Load route data
const routeDataPath = path.join(__dirname, '../public/route-data.json');
const routeData = JSON.parse(fs.readFileSync(routeDataPath, 'utf-8'));
const routeCoords = routeData.route;

console.log(`📍 Loaded ${routeCoords.length} route coordinates`);

// Calculate route bounds with buffer
function getRouteBounds(coords, bufferMeters = 100) {
    const lats = coords.map(coord => coord[0]);
    const lngs = coords.map(coord => coord[1]);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const bufferDeg = bufferMeters / 111000;

    return {
        south: minLat - bufferDeg,
        west: minLng - bufferDeg,
        north: maxLat + bufferDeg,
        east: maxLng + bufferDeg
    };
}

// Calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Get minimum distance from point to route
function getMinDistanceToRoute(lat, lng, coords) {
    let minDistance = Infinity;

    for (const routePoint of coords) {
        const distance = calculateDistance(lat, lng, routePoint[0], routePoint[1]);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    return minDistance;
}

// Get default name for amenity
function getDefaultName(tags, type) {
    if (tags?.name) return tags.name;

    const defaults = {
        toilets: 'Public Toilet',
        cafes: tags?.amenity === 'restaurant' ? 'Restaurant' :
            tags?.amenity === 'fast_food' ? 'Fast Food' : 'Café',
        indoor: tags?.amenity === 'library' ? 'Library' :
            tags?.tourism === 'museum' ? 'Museum' :
                tags?.amenity === 'community_centre' ? 'Community Centre' :
                    tags?.shop === 'mall' ? 'Shopping Mall' :
                        tags?.public_transport === 'station' ? 'Station' : 'Indoor Space'
    };

    return defaults[type] || 'Unknown';
}

// Fetch from Overpass API
async function fetchFromOverpassAPI(bounds, type, maxDistance) {
    const queries = {
        toilets: `[out:json][timeout:25];(node["amenity"="toilets"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="information"]["information"="office"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
        cafes: `[out:json][timeout:25];(node["amenity"="cafe"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="fast_food"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
        indoor: `[out:json][timeout:25];(node["amenity"="library"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="museum"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="community_centre"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["shop"="mall"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["public_transport"="station"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`
    };

    const apiUrl = 'https://overpass-api.de/api/interpreter';

    console.log(`  🔍 Querying Overpass API for ${type}...`);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(queries[type])}`
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.elements) {
        return [];
    }

    const amenities = data.elements
        .filter(element => element.lat && element.lon)
        .map(element => ({
            id: element.id,
            lat: element.lat,
            lng: element.lon,
            name: element.tags?.name || getDefaultName(element.tags, type),
            tags: element.tags || {},
            distanceToRoute: getMinDistanceToRoute(element.lat, element.lon, routeCoords)
        }))
        .filter(item => item.distanceToRoute <= maxDistance)
        .sort((a, b) => a.distanceToRoute - b.distanceToRoute);

    console.log(`  ✅ Found ${amenities.length} ${type} within ${maxDistance}m of route`);

    return amenities;
}

// Cache amenities in Supabase
async function cacheAmenities(type, amenities) {
    if (!amenities.length) {
        console.log(`  ⏭️  No ${type} to cache`);
        return;
    }

    try {
        const currentTimestamp = new Date().toISOString();

        const amenitiesData = amenities.map(amenity => ({
            external_id: amenity.id.toString(),
            type: type,
            name: amenity.name,
            latitude: amenity.lat,
            longitude: amenity.lng,
            tags: amenity.tags || {},
            distance_to_route: Math.round(amenity.distanceToRoute * 10) / 10,
            cached_at: currentTimestamp
        }));

        const { error } = await supabase
            .from('cached_amenities')
            .upsert(amenitiesData, {
                onConflict: 'external_id,type',
                ignoreDuplicates: false
            });

        if (error) {
            console.error(`  ❌ Error caching ${type}:`, error);
            return;
        }

        console.log(`  💾 Successfully cached ${amenitiesData.length} ${type} amenities`);

    } catch (error) {
        console.error(`  ❌ Error in cacheAmenities for ${type}:`, error);
    }
}

// Main function
async function main() {
    const maxDistance = 100; // meters
    const bounds = getRouteBounds(routeCoords, maxDistance);

    console.log(`\n🌍 Route bounds (with ${maxDistance}m buffer):`);
    console.log(`   North: ${bounds.north.toFixed(6)}`);
    console.log(`   South: ${bounds.south.toFixed(6)}`);
    console.log(`   East: ${bounds.east.toFixed(6)}`);
    console.log(`   West: ${bounds.west.toFixed(6)}\n`);

    const types = ['toilets', 'cafes', 'indoor'];

    console.log('🚀 Starting Overpass API fetch and cache update...\n');

    for (const type of types) {
        console.log(`📦 Processing ${type}:`);

        try {
            // Fetch from Overpass API
            const amenities = await fetchFromOverpassAPI(bounds, type, maxDistance);

            // Cache in Supabase
            await cacheAmenities(type, amenities);

            // Wait a bit between requests to be nice to Overpass API
            if (type !== 'indoor') {
                console.log('  ⏳ Waiting 2 seconds before next request...\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } catch (error) {
            console.error(`  ❌ Error processing ${type}:`, error.message);
        }
    }

    console.log('\n✅ Done! All amenities have been re-fetched and cached.');
}

// Run the script
main().catch(console.error);
