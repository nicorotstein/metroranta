// Database service for amenities caching and user data
class DatabaseService {
    constructor() {
        // In a real implementation, this would be your API base URL
        this.apiBase = process.env.NODE_ENV === 'production' 
            ? 'https://api.metroranta.shoeme.fit'  // Your backend API
            : 'http://localhost:3001';  // Local development API
    }

    // Check if cached amenities are available and fresh (< 24h)
    async getCachedAmenities(bounds, amenityType) {
        try {
            const response = await fetch(`${this.apiBase}/api/amenities/cached`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bounds,
                    type: amenityType
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.amenities || [];
        } catch (error) {
            console.error('Error fetching cached amenities:', error);
            return null; // Return null to indicate cache miss
        }
    }

    // Cache new amenities from Overpass API
    async cacheAmenities(bounds, amenityType, amenities) {
        try {
            const response = await fetch(`${this.apiBase}/api/amenities/cache`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bounds,
                    type: amenityType,
                    amenities
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error caching amenities:', error);
            return false;
        }
    }

    // Get user-suggested amenities
    async getUserSuggestedAmenities(bounds) {
        try {
            const response = await fetch(`${this.apiBase}/api/amenities/user-suggested`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ bounds })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.amenities || [];
        } catch (error) {
            console.error('Error fetching user-suggested amenities:', error);
            return [];
        }
    }

    // Submit a new user suggestion
    async submitUserSuggestion(suggestion) {
        try {
            const userInfo = this.getUserInfo();
            
            const response = await fetch(`${this.apiBase}/api/amenities/suggest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...suggestion,
                    userInfo
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error submitting user suggestion:', error);
            throw error;
        }
    }

    // Flag an amenity as incorrect/closed/etc
    async flagAmenity(amenityId, flagType, reason = '') {
        try {
            const userInfo = this.getUserInfo();
            
            const response = await fetch(`${this.apiBase}/api/amenities/flag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amenityId,
                    flagType,
                    reason,
                    userInfo
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error flagging amenity:', error);
            throw error;
        }
    }

    // Get user info (IP address will be handled by backend)
    getUserInfo() {
        return {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    }

    // Check if cache is stale for given bounds and type
    async isCacheStale(bounds, amenityType) {
        try {
            const response = await fetch(`${this.apiBase}/api/cache/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bounds,
                    type: amenityType
                })
            });

            if (!response.ok) {
                return true; // Assume stale if we can't check
            }

            const data = await response.json();
            return data.isStale;
        } catch (error) {
            console.error('Error checking cache status:', error);
            return true; // Assume stale on error
        }
    }
}

// Enhanced GPX Amenity Finder that uses database caching
class EnhancedGPXAmenityFinder {
    constructor() {
        this.routeCoords = [];
        this.amenities = {
            toilets: [],
            cafes: [],
            indoor: []
        };
        this.db = new DatabaseService();
    }

    // Set route coordinates
    setRouteCoords(coords) {
        this.routeCoords = coords;
    }

    // Get route bounds for API queries
    getRouteBounds(bufferMeters = 100) {
        if (this.routeCoords.length === 0) return null;

        const lats = this.routeCoords.map(coord => coord[0]);
        const lngs = this.routeCoords.map(coord => coord[1]);
        
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

    // Enhanced findAmenities that uses database caching
    async findAmenities(maxDistance = 100) {
        const bounds = this.getRouteBounds(maxDistance);
        if (!bounds) throw new Error('No route loaded');

        const results = {};
        const types = ['toilets', 'cafes', 'indoor'];

        for (const type of types) {
            try {
                console.log(`Looking for ${type}...`);
                
                // First, try to get cached amenities
                let cachedAmenities = await this.db.getCachedAmenities(bounds, type);
                
                if (cachedAmenities && cachedAmenities.length > 0) {
                    console.log(`Found ${cachedAmenities.length} cached ${type}`);
                    results[type] = cachedAmenities;
                } else {
                    // Cache miss or stale, fetch from Overpass API
                    console.log(`Cache miss for ${type}, fetching from Overpass API...`);
                    const freshAmenities = await this.fetchFromOverpassAPI(bounds, type, maxDistance);
                    
                    // Cache the results for next time
                    await this.db.cacheAmenities(bounds, type, freshAmenities);
                    
                    results[type] = freshAmenities;
                }

                // Add user-suggested amenities
                const userSuggested = await this.db.getUserSuggestedAmenities(bounds);
                const filteredUserSuggested = userSuggested
                    .filter(suggestion => suggestion.type === type)
                    .map(suggestion => ({
                        ...suggestion,
                        userSuggestion: true,
                        distanceToRoute: this.getMinDistanceToRoute(suggestion.latitude, suggestion.longitude)
                    }))
                    .filter(item => item.distanceToRoute <= maxDistance);

                results[type] = [...results[type], ...filteredUserSuggested];
                
            } catch (error) {
                console.error(`Error finding ${type}:`, error);
                results[type] = [];
            }
        }

        this.amenities = results;
        return results;
    }

    // Original Overpass API fetching logic (unchanged)
    async fetchFromOverpassAPI(bounds, type, maxDistance) {
        const queries = {
            toilets: `[out:json][timeout:25];(node["amenity"="toilets"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="information"]["information"="office"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
            cafes: `[out:json][timeout:25];(node["amenity"="cafe"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="fast_food"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
            indoor: `[out:json][timeout:25];(node["amenity"="library"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="museum"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="community_centre"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["shop"="mall"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["public_transport"="station"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`
        };

        let apiUrl = 'https://overpass-api.de/api/interpreter';
        
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            apiUrl = 'https://corsproxy.io/?' + encodeURIComponent(apiUrl);
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: `data=${encodeURIComponent(queries[type])}`
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.elements) {
            return [];
        }
        
        return data.elements
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
        const R = 6371000;
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

    // Get default name for amenity
    getDefaultName(tags, type) {
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

    // Submit user suggestion through database
    async submitSuggestion(suggestion) {
        return await this.db.submitUserSuggestion(suggestion);
    }

    // Flag amenity through database
    async flagAmenity(amenityId, flagType, reason) {
        return await this.db.flagAmenity(amenityId, flagType, reason);
    }
}

export { DatabaseService, EnhancedGPXAmenityFinder };
export default EnhancedGPXAmenityFinder;