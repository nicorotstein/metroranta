// GPX Parser and Overpass API integration for finding nearby amenities
class GPXAmenityFinder {
    constructor() {
        this.routeCoords = [];
        this.amenities = {
            toilets: [],
            cafes: [],
            indoor: []
        };
    }

    // Parse GPX file and extract coordinates
    async parseGPX(gpxContent) {
        try {
            const parser = new DOMParser();
            const gpxDoc = parser.parseFromString(gpxContent, 'text/xml');
            
            const trackPoints = gpxDoc.querySelectorAll('trkpt');
            this.routeCoords = Array.from(trackPoints).map(point => [
                parseFloat(point.getAttribute('lat')),
                parseFloat(point.getAttribute('lon'))
            ]);

            console.log(`Parsed ${this.routeCoords.length} route points`);
            return this.routeCoords;
        } catch (error) {
            console.error('Error parsing GPX:', error);
            throw error;
        }
    }

    // Calculate bounding box for the route with buffer
    getRouteBounds(bufferMeters = 100) {
        if (this.routeCoords.length === 0) return null;

        const lats = this.routeCoords.map(coord => coord[0]);
        const lngs = this.routeCoords.map(coord => coord[1]);
        
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        // Convert buffer from meters to degrees (approximate)
        const bufferDeg = bufferMeters / 111000; // roughly 111km per degree

        return {
            south: minLat - bufferDeg,
            west: minLng - bufferDeg,
            north: maxLat + bufferDeg,
            east: maxLng + bufferDeg
        };
    }

    // Query Overpass API for amenities
    async findAmenities(maxDistance = 100) {
        const bounds = this.getRouteBounds(maxDistance);
        if (!bounds) throw new Error('No route loaded');

        const queries = {
            toilets: `
                [out:json][timeout:25];
                (
                    node["amenity"="toilets"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["tourism"="information"]["information"="office"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                );
                out geom;
            `,
            cafes: `
                [out:json][timeout:25];
                (
                    node["amenity"="cafe"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["amenity"="fast_food"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                );
                out geom;
            `,
            indoor: `
                [out:json][timeout:25];
                (
                    node["amenity"="library"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["tourism"="museum"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["amenity"="community_centre"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["shop"="mall"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                    node["public_transport"="station"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
                );
                out geom;
            `
        };

        const results = {};
        
        for (const [type, query] of Object.entries(queries)) {
            try {
                console.log(`Querying ${type}...`);
                const response = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `data=${encodeURIComponent(query)}`
                });
                
                const data = await response.json();
                
                // Filter amenities within distance of route
                const filtered = data.elements
                    .filter(element => element.lat && element.lon)
                    .map(element => ({
                        id: element.id,
                        lat: element.lat,
                        lng: element.lon,
                        name: element.tags?.name || this.getDefaultName(element.tags, type),
                        tags: element.tags || {},
                        distanceToRoute: this.getMinDistanceToRoute(element.lat, element.lon)
                    }))
                    .filter(item => item.distanceToRoute <= maxDistance)
                    .sort((a, b) => a.distanceToRoute - b.distanceToRoute);

                results[type] = filtered;
                console.log(`Found ${filtered.length} ${type} within ${maxDistance}m`);
                
            } catch (error) {
                console.error(`Error querying ${type}:`, error);
                results[type] = [];
            }
        }

        this.amenities = results;
        return results;
    }

    // Calculate minimum distance from point to route
    getMinDistanceToRoute(lat, lng) {
        let minDistance = Infinity;
        
        for (const routePoint of this.routeCoords) {
            const distance = this.calculateDistance(lat, lng, routePoint[0], routePoint[1]);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }

    // Calculate distance between two points in meters
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    // Get default name for amenity based on tags
    getDefaultName(tags, type) {
        if (tags.name) return tags.name;
        
        const defaults = {
            toilets: 'Public Toilet',
            cafes: tags.amenity === 'restaurant' ? 'Restaurant' : 
                   tags.amenity === 'fast_food' ? 'Fast Food' : 'Café',
            indoor: tags.amenity === 'library' ? 'Library' :
                    tags.tourism === 'museum' ? 'Museum' :
                    tags.amenity === 'community_centre' ? 'Community Centre' :
                    tags.shop === 'mall' ? 'Shopping Mall' :
                    tags.public_transport === 'station' ? 'Station' : 'Indoor Space'
        };
        
        return defaults[type] || 'Unknown';
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPXAmenityFinder;
}