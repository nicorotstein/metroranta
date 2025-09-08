import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

// Fix Leaflet default markers in React
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

export const colors = {
  toilets: '#e74c3c',
  cafes: '#f39c12',
  indoor: '#3498db',
  route: '#8e03a0ff'
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    }
  })
  return null
}

function AmenityMarker({ amenity, type, onEditSpot, onDeleteSuggestion, onFlagSpot, gpxFinder }) {
  const distance = amenity.distanceToRoute ? Math.round(amenity.distanceToRoute) : '~50'
  const distanceToFinish = gpxFinder ? Math.round(gpxFinder.getDistanceToFinish(amenity.lat, amenity.lng)) : null

  return (
    <CircleMarker
      center={[amenity.lat, amenity.lng]}
      radius={amenity.userSuggestion ? 10 : 8}
      color="white"
      weight={amenity.userSuggestion ? 3 : 2}
      fillColor={colors[type]}
      fillOpacity={amenity.userSuggestion ? 0.9 : 0.8}
    >
      <Popup>
        <div>
          <strong>{amenity.name}</strong>
          {amenity.userSuggestion && (
            <span style={{ color: '#e74c3c', marginLeft: '5px' }}>(User Suggestion)</span>
          )}
          <br />
          Type: {type.charAt(0).toUpperCase() + type.slice(1)}
          <br />
          Distance from route: {distance}m
          <br />
          {distanceToFinish !== null && (
            <>Distance to finish: {(distanceToFinish / 1000).toFixed(1)}km<br /></>
          )}

          {amenity.tags?.opening_hours && (
            <>Hours: {amenity.tags.opening_hours}<br /></>
          )}
          {amenity.tags?.website && (
            <>
              <a href={amenity.tags.website} target="_blank" rel="noopener noreferrer">
                Website
              </a>
              <br />
            </>
          )}
          {amenity.description && (
            <>Description: {amenity.description}<br /></>
          )}
          <div style={{ marginTop: '5px' }}>
            <button
              onClick={() => onEditSpot(amenity)}
              style={{
                background: '#f39c12',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                marginRight: '5px'
              }}
            >
              Edit
            </button>
            {amenity.userSuggestion ? (
              <button
                onClick={() => onDeleteSuggestion(amenity.id, type)}
                style={{
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginLeft: '5px'
                }}
              >
                Delete
              </button>
            ) : (
              <button
                onClick={() => onFlagSpot(amenity.id, type, amenity.name)}
                style={{
                  background: '#f39c12',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginLeft: '5px'
                }}
              >
                Report Issue
              </button>
            )}
          </div>
        </div>
      </Popup>
    </CircleMarker>
  )
}

function MapView({
  routeCoords,
  amenities,
  userSuggestions,
  visibleLayers,
  tempMarkerPosition,
  onMapClick,
  onEditSpot,
  onDeleteSuggestion,
  onFlagSpot,
  gpxFinder
}) {
  const mapRef = useRef()

  useEffect(() => {
    if (mapRef.current && routeCoords.length > 0) {
      const map = mapRef.current
      // Add a small delay to ensure map is fully initialized
      const bounds = L.latLngBounds(routeCoords)
      console.log('Route bounds:', bounds.toBBoxString())
      console.log('Route points:', routeCoords.length)

      // More generous padding and no max zoom constraint initially
      map.fitBounds(bounds, {
        padding: [80, 80] // Increased padding
      })
    }
  }, [routeCoords])

  // Calculate center of route bounds for better initial positioning
  const center = routeCoords.length > 0
    ? [
      (Math.min(...routeCoords.map(c => c[0])) + Math.max(...routeCoords.map(c => c[0]))) / 2,
      (Math.min(...routeCoords.map(c => c[1])) + Math.max(...routeCoords.map(c => c[1]))) / 2
    ]
    : [60.1699, 24.9384]

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={11} // Much lower initial zoom to show more area
      style={{ height: '100vh', width: '100%', zIndex: 1 }}
      whenCreated={(mapInstance) => {
        mapRef.current = mapInstance
      }}
    >
      <TileLayer
        attribution='© OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onMapClick={onMapClick} />

      {/* Route Line */}
      {routeCoords.length > 0 && (
        <Polyline
          positions={routeCoords}
          color={colors.route}
          weight={3}
          opacity={0.8}
        />
      )}

      {/* Start Flag - Green */}
      {routeCoords.length > 0 && (
        <Marker
          position={routeCoords[0]}
          icon={L.divIcon({
            className: 'start-flag',
            html: '🟢',
            iconSize: [25, 25],
            iconAnchor: [12, 25]
          })}
        >
          <Popup>
            <div>
              <strong>Start</strong><br />
              Route begins here
            </div>
          </Popup>
        </Marker>
      )}

      {/* Finish Flag - Checkered */}
      {routeCoords.length > 1 && (
        <Marker
          position={routeCoords[routeCoords.length - 1]}
          icon={L.divIcon({
            className: 'finish-flag',
            html: '🏁',
            iconSize: [25, 25],
            iconAnchor: [12, 25]
          })}
        >
          <Popup>
            <div>
              <strong>Finish</strong><br />
              Route ends here
            </div>
          </Popup>
        </Marker>
      )}

      {/* Amenity Markers */}
      {Object.entries(amenities).map(([type, items]) =>
        visibleLayers[type] && items.map((amenity, index) => (
          <AmenityMarker
            key={`${type}-${amenity.id || index}`}
            amenity={amenity}
            type={type}
            onEditSpot={onEditSpot}
            onDeleteSuggestion={onDeleteSuggestion}
            onFlagSpot={onFlagSpot}
            gpxFinder={gpxFinder}
          />
        ))
      )}

      {/* User Suggestion Markers */}
      {Object.entries(userSuggestions).map(([type, items]) =>
        visibleLayers[type] && items.map((suggestion, index) => (
          <AmenityMarker
            key={`suggestion-${type}-${suggestion.id || index}`}
            amenity={suggestion}
            type={type}
            onEditSpot={onEditSpot}
            onDeleteSuggestion={onDeleteSuggestion}
            onFlagSpot={onFlagSpot}
            gpxFinder={gpxFinder}
          />
        ))
      )}

      {/* Temporary Marker */}
      {tempMarkerPosition && (
        <Marker
          position={[tempMarkerPosition.lat, tempMarkerPosition.lng]}
          icon={L.divIcon({
            className: 'temp-marker',
            html: '📍',
            iconSize: [20, 20]
          })}
        />
      )}
    </MapContainer>
  )
}

export default MapView