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
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Load route data
const routeDataPath = path.join(__dirname, '../public/route-data.json');
const routeData = JSON.parse(fs.readFileSync(routeDataPath, 'utf-8'));
const routeCoords = routeData.route;

console.log(`📍 Loaded ${routeCoords.length} route coordinates\n`);

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
function getMinDistanceToRoute(lat, lng) {
    let minDistance = Infinity;

    for (const routePoint of routeCoords) {
        const distance = calculateDistance(lat, lng, routePoint[0], routePoint[1]);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    return minDistance;
}

// Main function
async function main() {
    const maxDistance = 100; // meters

    console.log('🔍 Checking all amenities in Supabase...\n');

    // Check cached amenities
    console.log('📦 CACHED AMENITIES:');
    const { data: cachedAmenities, error: cachedError } = await supabase
        .from('cached_amenities')
        .select('*');

    if (cachedError) {
        console.error('❌ Error fetching cached amenities:', cachedError);
    } else {
        const outdatedCached = cachedAmenities.filter(a => {
            const distance = getMinDistanceToRoute(a.latitude, a.longitude);
            return distance > maxDistance;
        });

        console.log(`  Total: ${cachedAmenities.length}`);
        console.log(`  Valid (≤${maxDistance}m): ${cachedAmenities.length - outdatedCached.length}`);
        console.log(`  Outdated (>${maxDistance}m): ${outdatedCached.length}`);

        if (outdatedCached.length > 0) {
            console.log('  \n  ⚠️  Outdated cached amenities:');
            outdatedCached.forEach(a => {
                const dist = Math.round(getMinDistanceToRoute(a.latitude, a.longitude));
                console.log(`    - [${a.type}] ${a.name} (${dist}m)`);
            });
        }
    }

    // Check user-suggested amenities
    console.log('\n👥 USER-SUGGESTED AMENITIES:');
    const { data: userAmenities, error: userError } = await supabase
        .from('user_suggested_amenities')
        .select('*')
        .is('archived_at', null);

    if (userError) {
        console.error('❌ Error fetching user suggestions:', userError);
    } else {
        const outdatedUser = userAmenities.filter(a => {
            const distance = getMinDistanceToRoute(a.latitude, a.longitude);
            return distance > maxDistance;
        });

        console.log(`  Total: ${userAmenities.length}`);
        console.log(`  Valid (≤${maxDistance}m): ${userAmenities.length - outdatedUser.length}`);
        console.log(`  Outdated (>${maxDistance}m): ${outdatedUser.length}`);

        if (outdatedUser.length > 0) {
            console.log('  \n  ⚠️  Outdated user suggestions:');
            outdatedUser.forEach(a => {
                const dist = Math.round(getMinDistanceToRoute(a.latitude, a.longitude));
                console.log(`    - [${a.type}] ${a.name} (${dist}m) [Status: ${a.status}]`);
            });
        }
    }

    console.log('\n');
}

// Run the script
main().catch(console.error);
