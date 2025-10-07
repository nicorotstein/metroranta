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

    console.log('🔍 Fetching all cached amenities from Supabase...\n');

    // Fetch all cached amenities
    const { data: amenities, error } = await supabase
        .from('cached_amenities')
        .select('*');

    if (error) {
        console.error('❌ Error fetching amenities:', error);
        process.exit(1);
    }

    console.log(`📦 Found ${amenities.length} cached amenities\n`);

    // Check each amenity's distance to the new route
    const outdatedAmenities = [];
    const validAmenities = [];

    for (const amenity of amenities) {
        const distance = getMinDistanceToRoute(amenity.latitude, amenity.longitude);

        if (distance > maxDistance) {
            outdatedAmenities.push({
                ...amenity,
                actualDistance: Math.round(distance)
            });
        } else {
            validAmenities.push(amenity);
        }
    }

    console.log(`✅ Valid amenities (within ${maxDistance}m): ${validAmenities.length}`);
    console.log(`❌ Outdated amenities (beyond ${maxDistance}m): ${outdatedAmenities.length}\n`);

    if (outdatedAmenities.length === 0) {
        console.log('🎉 No outdated amenities found! Database is clean.');
        return;
    }

    // Group by type for better reporting
    const byType = outdatedAmenities.reduce((acc, amenity) => {
        if (!acc[amenity.type]) acc[amenity.type] = [];
        acc[amenity.type].push(amenity);
        return acc;
    }, {});

    console.log('🗑️  Amenities to be removed:\n');
    for (const [type, items] of Object.entries(byType)) {
        console.log(`  ${type}: ${items.length} items`);
        items.forEach(item => {
            console.log(`    - ${item.name} (${item.actualDistance}m from route)`);
        });
        console.log('');
    }

    // Delete outdated amenities using database function
    console.log('🧹 Removing outdated amenities from database...\n');

    const externalIds = outdatedAmenities.map(a => a.external_id);
    const types = outdatedAmenities.map(a => a.type);

    const { data: deletedCount, error: deleteError } = await supabase
        .rpc('delete_outdated_amenities', {
            external_ids_to_delete: externalIds,
            types_to_delete: types
        });

    if (deleteError) {
        console.error('❌ Error deleting amenities:', deleteError.message);
        process.exit(1);
    }

    console.log(`✅ Successfully removed ${deletedCount} outdated amenities from the database`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Kept: ${validAmenities.length} amenities`);
    console.log(`   - Removed: ${outdatedAmenities.length} amenities`);
}

// Run the script
main().catch(console.error);
