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

        const types = ['toilets', 'cafes', 'indoor']

        // Fetch all types in parallel instead of sequentially
        const results = await Promise.all(
            types.map(async (type) => {
                try {
                    // Step 1: Try to get cached amenities from Supabase
                    let amenitiesFromCache = await this.getCachedAmenities(bounds, type)

                    if (amenitiesFromCache && amenitiesFromCache.length > 0) {
                        // Step 4: Add approved user-suggested amenities
                        if (this.supabase) {
                            const userSuggested = await this.getUserSuggestedAmenities(bounds, type)
                            if (userSuggested.length > 0) {
                                const filteredUserSuggested = userSuggested.map(suggestion => ({
                                    ...suggestion,
                                    lat: suggestion.latitude,
                                    lng: suggestion.longitude,
                                    userSuggestion: true,
                                    distanceToRoute: this.getMinDistanceToRoute(suggestion.latitude, suggestion.longitude)
                                }))
                                    .filter(item => item.distanceToRoute <= maxDistance)

                                return { type, data: [...amenitiesFromCache, ...filteredUserSuggested] }
                            }
                        }
                        return { type, data: amenitiesFromCache }
                    } else {
                        // Step 2: No cache, fetch fresh from Overpass API
                        const freshAmenities = await this.fetchFromOverpassAPI(bounds, type, maxDistance)

                        // Step 2.5: Filter out heavily flagged amenities
                        const filteredFreshAmenities = await this.filterHeavilyFlaggedAmenities(freshAmenities, type)

                        // Step 3: Cache the fresh results in Supabase for next time
                        if (this.supabase && filteredFreshAmenities.length > 0) {
                            await this.cacheAmenities(bounds, type, filteredFreshAmenities)
                        }

                        // Step 4: Add approved user-suggested amenities
                        let finalAmenities = filteredFreshAmenities
                        if (this.supabase) {
                            const userSuggested = await this.getUserSuggestedAmenities(bounds, type)
                            if (userSuggested.length > 0) {
                                const filteredUserSuggested = userSuggested.map(suggestion => ({
                                    ...suggestion,
                                    lat: suggestion.latitude,
                                    lng: suggestion.longitude,
                                    userSuggestion: true,
                                    distanceToRoute: this.getMinDistanceToRoute(suggestion.latitude, suggestion.longitude)
                                }))
                                    .filter(item => item.distanceToRoute <= maxDistance)

                                finalAmenities = [...filteredFreshAmenities, ...filteredUserSuggested]
                            }
                        }

                        return { type, data: finalAmenities }
                    }

                } catch (error) {
                    console.error(`Error finding ${type}:`, error)
                    return { type, data: [] }
                }
            })
        )

        // Convert array to object
        const amenitiesObj = results.reduce((acc, { type, data }) => {
            acc[type] = data
            return acc
        }, {})

        this.amenities = amenitiesObj
        return amenitiesObj
    }

    // Get cached amenities from Supabase using fresh_cached_amenities view
    async getCachedAmenities(bounds, type) {
        if (!this.supabase) return []

        try {
            // Use the fresh_cached_amenities view which handles freshness and archival filtering
            const { data, error } = await this.supabase
                .from('fresh_cached_amenities')
                .select('*')
                .eq('type', type)
                .gte('latitude', bounds.south)
                .lte('latitude', bounds.north)
                .gte('longitude', bounds.west)
                .lte('longitude', bounds.east)

            if (error) {
                console.error('Error fetching cached amenities:', error)
                return []
            }

            if (data && data.length > 0) {
                console.log(`✓ Cache hit: Found ${data.length} cached ${type} from database`)
                return data.map(amenity => ({
                    id: amenity.external_id,
                    lat: amenity.latitude,
                    lng: amenity.longitude,
                    name: amenity.name,
                    tags: amenity.tags || {},
                    distanceToRoute: amenity.distance_to_route || 0
                }))
            } else {
                console.log(`✗ Cache miss: No cached ${type} found, will fetch from Overpass API`)
                return []
            }

        } catch (error) {
            console.error('Error in getCachedAmenities:', error)
            return []
        }
    }

    // Cache amenities in Supabase
    async cacheAmenities(bounds, type, amenities) {
        if (!this.supabase || !amenities.length) return

        try {
            const currentTimestamp = new Date().toISOString()

            // Prepare amenities for insertion
            const amenitiesData = amenities.map(amenity => ({
                external_id: amenity.id.toString(),
                type: type,
                name: amenity.name,
                latitude: amenity.lat,
                longitude: amenity.lng,
                tags: amenity.tags || {},
                distance_to_route: Math.round(amenity.distanceToRoute * 10) / 10,
                cached_at: currentTimestamp  // Refresh cache timestamp on every upsert
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

            console.log(`Successfully cached ${amenitiesData.length} ${type} amenities`)

        } catch (error) {
            console.error('Error in cacheAmenities:', error)
        }
    }

    // Generate consistent hash for bounds
    generateBoundsHash(bounds) {
        // Create a consistent string representation of bounds for hashing
        const boundsString = JSON.stringify({
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west
        })

        // Simple hash function (for client-side use)
        let hash = 0
        for (let i = 0; i < boundsString.length; i++) {
            const char = boundsString.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32-bit integer
        }
        return hash.toString(16)
    }

    // Check if cache is stale (simplified version - always return true for now)
    async isCacheStale(bounds, type) {
        if (!this.supabase) return true

        return true
    }

    // Get user-suggested amenities from Supabase (all statuses for user feedback)
    async getUserSuggestedAmenities(bounds, type = null) {
        if (!this.supabase) return []

        try {
            let query = this.supabase
                .from('user_suggested_amenities')
                .select('*')
                .gte('latitude', bounds.south)
                .lte('latitude', bounds.north)
                .gte('longitude', bounds.west)
                .lte('longitude', bounds.east)
                .is('archived_at', null)  // Filter out archived items

            if (type) {
                query = query.eq('type', type)
            }

            const { data, error } = await query

            if (error) {
                console.error('Error fetching user suggestions:', error)
                return []
            }

            return data || []

        } catch (error) {
            console.error('Error in getUserSuggestedAmenities:', error)
            return []
        }
    }

    // Get all user suggestions (for loading initial state)
    async getAllUserSuggestions() {
        if (!this.supabase) return { toilets: [], cafes: [], indoor: [] }

        try {
            const { data, error } = await this.supabase
                .from('user_suggested_amenities')
                .select('*')
                .in('status', ['approved', 'pending']) // Show approved and pending
                .is('archived_at', null)  // Filter out archived items

            if (error) {
                console.error('Error fetching all user suggestions:', error)
                return { toilets: [], cafes: [], indoor: [] }
            }

            // Group by type
            const grouped = { toilets: [], cafes: [], indoor: [] }
            data?.forEach(suggestion => {
                if (grouped[suggestion.type]) {
                    grouped[suggestion.type].push({
                        ...suggestion,
                        lat: suggestion.latitude,
                        lng: suggestion.longitude,
                        userSuggestion: true
                    })
                }
            })

            return grouped

        } catch (error) {
            console.error('Error in getAllUserSuggestions:', error)
            return { toilets: [], cafes: [], indoor: [] }
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
                    distance_to_route: Math.round(suggestion.distanceToRoute * 10) / 10,
                    user_agent: navigator.userAgent
                    // Note: user_ip_address will be set automatically by database trigger
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

    // Update user suggestion in Supabase
    async updateSuggestion(suggestionId, updatedData) {
        if (!this.supabase) {
            throw new Error('Supabase not configured')
        }

        try {
            const { data, error } = await this.supabase
                .from('user_suggested_amenities')
                .update({
                    type: updatedData.type,
                    name: updatedData.name,
                    description: updatedData.description || null,
                    latitude: updatedData.lat,
                    longitude: updatedData.lng,
                    distance_to_route: Math.round(updatedData.distanceToRoute * 10) / 10
                })
                .eq('id', suggestionId)
                .is('archived_at', null) // Only update non-archived suggestions
                .select()

            if (error) {
                throw error
            }

            if (data && data.length > 0) {
                return data[0]
            } else {
                throw new Error('Suggestion not found or unable to update')
            }

        } catch (error) {
            console.error('Error updating suggestion:', error)
            throw error
        }
    }

    // Archive (soft delete) user suggestion from Supabase
    async deleteUserSuggestion(id) {
        if (!this.supabase) {
            throw new Error('Supabase not configured')
        }

        try {
            // Use the database function for secure archival
            const { data, error } = await this.supabase
                .rpc('archive_user_suggestion', { suggestion_id: id })

            if (error) {
                throw error
            }

            if (data) {
                return true
            } else {
                throw new Error('Failed to archive suggestion (may not exist or already archived)')
            }

        } catch (error) {
            console.error('Error archiving suggestion:', error)
            throw error
        }
    }

    // Filter out heavily flagged amenities
    async filterHeavilyFlaggedAmenities(amenities, type) {
        if (!this.supabase || !amenities.length) return amenities

        try {
            // Get all heavily flagged amenities for this type
            const { data: flaggedAmenities, error } = await this.supabase
                .rpc('get_heavily_flagged_amenities', { amenity_type: type })

            if (error) {
                console.error('Error fetching flagged amenities:', error)
                return amenities // Return unfiltered if error
            }

            if (!flaggedAmenities || flaggedAmenities.length === 0) {
                return amenities // No flagged amenities to filter
            }

            // Create a Set of flagged IDs for faster lookup
            const flaggedIds = new Set(flaggedAmenities.map(item => item.external_id))

            // Filter out heavily flagged amenities
            return amenities.filter(amenity => !flaggedIds.has(amenity.id.toString()))

        } catch (error) {
            console.error('Error filtering flagged amenities:', error)
            return amenities // Return unfiltered if error
        }
    }

    // Flag amenity in Supabase (simplified)
    async flagAmenity(amenityId, amenityType) {
        if (!this.supabase) {
            throw new Error('Supabase not configured')
        }

        try {
            // Use database function to handle flagging and auto-archival
            const { data, error } = await this.supabase
                .rpc('flag_amenity_and_check_threshold', {
                    amenity_id: amenityId,
                    amenity_type: amenityType
                })

            if (error) {
                throw error
            }

            return data

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
            // apiUrl = 'https://cors-anywhere.herokuapp.com/' + apiUrl
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

    // Find closest route point and its index
    getClosestRoutePoint(lat, lng) {
        let minDistance = Infinity
        let closestIndex = 0

        for (let i = 0; i < this.routeCoords.length; i++) {
            const routePoint = this.routeCoords[i]
            const distance = this.calculateDistance(lat, lng, routePoint[0], routePoint[1])
            if (distance < minDistance) {
                minDistance = distance
                closestIndex = i
            }
        }

        return { index: closestIndex, distance: minDistance }
    }

    // Calculate route-following distance to finish line from a point
    getDistanceToFinish(lat, lng) {
        if (this.routeCoords.length === 0) return 0

        // Find closest point on route
        const { index: closestIndex } = this.getClosestRoutePoint(lat, lng)

        // Calculate remaining distance along route from closest point to finish
        let remainingDistance = 0
        for (let i = closestIndex; i < this.routeCoords.length - 1; i++) {
            const currentPoint = this.routeCoords[i]
            const nextPoint = this.routeCoords[i + 1]
            remainingDistance += this.calculateDistance(
                currentPoint[0], currentPoint[1],
                nextPoint[0], nextPoint[1]
            )
        }

        return remainingDistance
    }

    // Calculate distance between two points in meters
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000
        const φ1 = lat1 * Math.PI / 180
        const φ2 = lat2 * Math.PI / 180
        const Δφ = (lat2 - lat1) * Math.PI / 180
        const Δλ = (lng2 - lng1) * Math.PI / 180

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

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