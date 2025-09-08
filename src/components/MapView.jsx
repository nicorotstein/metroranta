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

const colors = {
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

function AmenityMarker({ amenity, type, onEditSpot, onDeleteSuggestion }) {
  const distance = amenity.distanceToRoute ? Math.round(amenity.distanceToRoute) : '~50'

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
            {amenity.userSuggestion && (
              <button
                onClick={() => onDeleteSuggestion(amenity.id, type)}
                style={{
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Delete
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
  onDeleteSuggestion
}) {
  const mapRef = useRef()

  useEffect(() => {
    if (mapRef.current && routeCoords.length > 0) {
      const map = mapRef.current
      const bounds = L.latLngBounds(routeCoords)
      map.fitBounds(bounds, { padding: [10, 10] })
    }
  }, [routeCoords])

  const center = routeCoords.length > 0 ? routeCoords[0] : [60.1699, 24.9384]

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={13}
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

      {/* Amenity Markers */}
      {Object.entries(amenities).map(([type, items]) =>
        visibleLayers[type] && items.map((amenity, index) => (
          <AmenityMarker
            key={`${type}-${amenity.id || index}`}
            amenity={amenity}
            type={type}
            onEditSpot={onEditSpot}
            onDeleteSuggestion={onDeleteSuggestion}
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