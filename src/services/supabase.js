import { createClient } from '@supabase/supabase-js'

// Supabase configuration - you'll need to add these to your .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Database features will be disabled.')
}

export const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

// Enhanced GPX Amenity Finder with Supabase integration
class SupabaseGPXAmenityFinder {
    constructor() {
        this.routeCoords = []
        this.amenities = {
            toilets: [],
            cafes: [],
            indoor: []
        }
        this.supabase = supabase
    }

    // Set route coordinates
    setRouteCoords(coords) {
        this.routeCoords = coords
    }

    // Get route bounds for API queries
    getRouteBounds(bufferMeters = 100) {
        if (this.routeCoords.length === 0) return null

        const lats = this.routeCoords.map(coord => coord[0])
        const lngs = this.routeCoords.map(coord => coord[1])
        
        const minLat = Math.min(...lats)
        const maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs)
        const maxLng = Math.max(...lngs)

        const bufferDeg = bufferMeters / 111000

        return {
            south: minLat - bufferDeg,
            west: minLng - bufferDeg,
            north: maxLat + bufferDeg,
            east: maxLng + bufferDeg
        }
    }

    // Enhanced findAmenities that uses Supabase caching
    async findAmenities(maxDistance = 100) {
        const bounds = this.getRouteBounds(maxDistance)
        if (!bounds) throw new Error('No route loaded')

        const results = {}
        const types = ['toilets', 'cafes', 'indoor']

        for (const type of types) {
            try {
                console.log(`Looking for ${type}...`)
                
                // First, try to get cached amenities from Supabase
                let cachedAmenities = await this.getCachedAmenities(bounds, type)
                
                if (cachedAmenities && cachedAmenities.length > 0) {
                    console.log(`Found ${cachedAmenities.length} cached ${type}`)
                    results[type] = cachedAmenities
                } else {
                    // Cache miss or stale, fetch from Overpass API
                    console.log(`Cache miss for ${type}, fetching from Overpass API...`)
                    const freshAmenities = await this.fetchFromOverpassAPI(bounds, type, maxDistance)
                    
                    // Cache the results in Supabase for next time
                    if (this.supabase) {
                        await this.cacheAmenities(bounds, type, freshAmenities)
                    }
                    
                    results[type] = freshAmenities
                }

                // Add approved user-suggested amenities from Supabase
                if (this.supabase) {
                    const userSuggested = await this.getUserSuggestedAmenities(bounds, type)
                    const filteredUserSuggested = userSuggested.map(suggestion => ({
                        ...suggestion,
                        lat: suggestion.latitude,
                        lng: suggestion.longitude,
                        userSuggestion: true,
                        distanceToRoute: this.getMinDistanceToRoute(suggestion.latitude, suggestion.longitude)
                    }))
                    .filter(item => item.distanceToRoute <= maxDistance)

                    results[type] = [...results[type], ...filteredUserSuggested]
                }
                
            } catch (error) {
                console.error(`Error finding ${type}:`, error)
                results[type] = []
            }
        }

        this.amenities = results
        return results
    }

    // Get cached amenities from Supabase
    async getCachedAmenities(bounds, type) {
        if (!this.supabase) return []

        try {
            // Check if cache is stale first
            const isStale = await this.isCacheStale(bounds, type)
            if (isStale) return []

            const { data, error } = await this.supabase
                .from('cached_amenities')
                .select('*')
                .eq('type', type)
                .gte('latitude', bounds.south)
                .lte('latitude', bounds.north)
                .gte('longitude', bounds.west)
                .lte('longitude', bounds.east)
                .gte('cached_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

            if (error) {
                console.error('Error fetching cached amenities:', error)
                return []
            }

            return data.map(amenity => ({
                id: amenity.external_id,
                lat: amenity.latitude,
                lng: amenity.longitude,
                name: amenity.name,
                tags: amenity.tags || {},
                distanceToRoute: amenity.distance_to_route || 0
            }))

        } catch (error) {
            console.error('Error in getCachedAmenities:', error)
            return []
        }
    }

    // Cache amenities in Supabase
    async cacheAmenities(bounds, type, amenities) {
        if (!this.supabase || !amenities.length) return

        try {
            // Prepare amenities for insertion
            const amenitiesData = amenities.map(amenity => ({
                external_id: amenity.id,
                type: type,
                name: amenity.name,
                latitude: amenity.lat,
                longitude: amenity.lng,
                tags: amenity.tags || {},
                distance_to_route: amenity.distanceToRoute
            }))

            // Insert amenities (using upsert to handle duplicates)
            const { error: amenitiesError } = await this.supabase
                .from('cached_amenities')
                .upsert(amenitiesData, { 
                    onConflict: 'external_id,type',
                    ignoreDuplicates: false 
                })

            if (amenitiesError) {
                console.error('Error caching amenities:', amenitiesError)
                return
            }

            // Update cache metadata
            const { error: metadataError } = await this.supabase
                .from('cache_metadata')
                .upsert({
                    area_bounds: bounds,
                    amenity_type: type,
                    last_fetched_at: new Date().toISOString(),
                    amenity_count: amenities.length
                }, { 
                    onConflict: 'area_bounds,amenity_type'
                })

            if (metadataError) {
                console.error('Error updating cache metadata:', metadataError)
            } else {
                console.log(`Successfully cached ${amenities.length} ${type}`)
            }

        } catch (error) {
            console.error('Error in cacheAmenities:', error)
        }
    }

    // Check if cache is stale
    async isCacheStale(bounds, type) {
        if (!this.supabase) return true

        try {
            const { data, error } = await this.supabase
                .from('cache_metadata')
                .select('last_fetched_at')
                .eq('area_bounds', bounds)
                .eq('amenity_type', type)
                .single()

            if (error || !data) return true

            const lastFetch = new Date(data.last_fetched_at)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
            
            return lastFetch < twentyFourHoursAgo

        } catch (error) {
            console.error('Error checking cache staleness:', error)
            return true // Assume stale on error
        }
    }

    // Get user-suggested amenities from Supabase
    async getUserSuggestedAmenities(bounds, type) {
        if (!this.supabase) return []

        try {
            const { data, error } = await this.supabase
                .from('user_suggested_amenities')
                .select('*')
                .eq('type', type)
                .eq('status', 'approved')
                .gte('latitude', bounds.south)
                .lte('latitude', bounds.north)
                .gte('longitude', bounds.west)
                .lte('longitude', bounds.east)

            if (error) {
                console.error('Error fetching user suggestions:', error)
                return []
            }

            return data

        } catch (error) {
            console.error('Error in getUserSuggestedAmenities:', error)
            return []
        }
    }

    // Submit user suggestion to Supabase
    async submitSuggestion(suggestion) {
        if (!this.supabase) {
            throw new Error('Supabase not configured')
        }

        try {
            const { data, error } = await this.supabase
                .from('user_suggested_amenities')
                .insert({
                    type: suggestion.type,
                    name: suggestion.name,
                    description: suggestion.description || null,
                    latitude: suggestion.lat,
                    longitude: suggestion.lng,
                    distance_to_route: suggestion.distanceToRoute,
                    user_agent: navigator.userAgent
                })
                .select()

            if (error) {
                throw error
            }

            return data[0]

        } catch (error) {
            console.error('Error submitting suggestion:', error)
            throw error
        }
    }

    // Flag amenity in Supabase
    async flagAmenity(amenityId, flagType, reason = '') {
        if (!this.supabase) {
            throw new Error('Supabase not configured')
        }

        try {
            const { data, error } = await this.supabase
                .from('user_flagged_amenities')
                .insert({
                    external_amenity_id: amenityId,
                    flag_type: flagType,
                    flag_reason: reason || null,
                    user_agent: navigator.userAgent
                })
                .select()

            if (error) {
                throw error
            }

            return data[0]

        } catch (error) {
            console.error('Error flagging amenity:', error)
            throw error
        }
    }

    // Original Overpass API fetching logic (unchanged)
    async fetchFromOverpassAPI(bounds, type, maxDistance) {
        const queries = {
            toilets: `[out:json][timeout:25];(node["amenity"="toilets"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="information"]["information"="office"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
            cafes: `[out:json][timeout:25];(node["amenity"="cafe"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="fast_food"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`,
            indoor: `[out:json][timeout:25];(node["amenity"="library"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["tourism"="museum"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["amenity"="community_centre"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["shop"="mall"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});node["public_transport"="station"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out geom;`
        }

        let apiUrl = 'https://overpass-api.de/api/interpreter'
        
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            apiUrl = 'https://corsproxy.io/?' + encodeURIComponent(apiUrl)
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: `data=${encodeURIComponent(queries[type])}`
        })
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (!data || !data.elements) {
            return []
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
            .sort((a, b) => a.distanceToRoute - b.distanceToRoute)
    }

    // Calculate minimum distance from point to route
    getMinDistanceToRoute(lat, lng) {
        let minDistance = Infinity
        
        for (const routePoint of this.routeCoords) {
            const distance = this.calculateDistance(lat, lng, routePoint[0], routePoint[1])
            if (distance < minDistance) {
                minDistance = distance
            }
        }
        
        return minDistance
    }

    // Calculate distance between two points in meters
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000
        const φ1 = lat1 * Math.PI / 180
        const φ2 = lat2 * Math.PI / 180
        const Δφ = (lat2 - lat1) * Math.PI / 180
        const Δλ = (lng2 - lng1) * Math.PI / 180

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

        return R * c
    }

    // Get default name for amenity
    getDefaultName(tags, type) {
        if (tags?.name) return tags.name
        
        const defaults = {
            toilets: 'Public Toilet',
            cafes: tags?.amenity === 'restaurant' ? 'Restaurant' : 
                   tags?.amenity === 'fast_food' ? 'Fast Food' : 'Café',
            indoor: tags?.amenity === 'library' ? 'Library' :
                    tags?.tourism === 'museum' ? 'Museum' :
                    tags?.amenity === 'community_centre' ? 'Community Centre' :
                    tags?.shop === 'mall' ? 'Shopping Mall' :
                    tags?.public_transport === 'station' ? 'Station' : 'Indoor Space'
        }
        
        return defaults[type] || 'Unknown'
    }
}

export default SupabaseGPXAmenityFinder