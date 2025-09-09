import { useState, useEffect } from 'react'
import MapView from './components/MapView'
import Controls from './components/Controls'
import SuggestionForm from './components/SuggestionForm'
import LoadingSpinner from './components/LoadingSpinner'
import InfoModal from './components/InfoModal'
import SupabaseGPXAmenityFinder from './services/supabase'
import 'leaflet/dist/leaflet.css'
import './App.css'

function App() {
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Loading route and amenities...')
  const [routeCoords, setRouteCoords] = useState([])
  const [amenities, setAmenities] = useState({ toilets: [], cafes: [], indoor: [] })
  const [userSuggestions, setUserSuggestions] = useState({ toilets: [], cafes: [], indoor: [] })
  const [visibleLayers, setVisibleLayers] = useState({ toilets: true, cafes: true, indoor: true })
  const [editMode, setEditMode] = useState(null)
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState(null)
  const [tempMarkerPosition, setTempMarkerPosition] = useState(null)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [gpxFinder] = useState(() => new SupabaseGPXAmenityFinder())

  useEffect(() => {
    loadGPXData()
    loadUserSuggestions()

    // Check if this is the user's first visit
    const hasSeenModal = localStorage.getItem('modalOnStartup')
    if (!hasSeenModal) {
      setShowInfoModal(true)
      localStorage.setItem('modalOnStartup', 'true')
    }
  }, [])

  const loadUserSuggestions = async () => {
    try {
      const suggestions = await gpxFinder.getAllUserSuggestions()
      setUserSuggestions(suggestions)
    } catch (error) {
      console.error('Error loading user suggestions:', error)
    }
  }

  const loadGPXData = async () => {
    try {
      console.log('Starting to load GPX data...')
      const routeData = await loadRouteData()
      setRouteCoords(routeData)

      // Set route coordinates in GPX finder for amenity search
      gpxFinder.setRouteCoords(routeData)
      console.log(`Loaded ${routeData.length} route points`)

      // Find real amenities near route using Overpass API
      await findRealAmenities()

    } catch (error) {
      console.error('Error loading route data:', error)
      setLoadingText('Error loading route data. Using sample data...')

      // Fallback to sample data
      await loadSampleData()
    }
  }

  const loadRouteData = async () => {
    try {
      console.log('Fetching route-data.json...')
      const response = await fetch('/route-data.json')
      console.log('Response status:', response.status, response.statusText)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      console.log('JSON parsed successfully, route points:', data.route?.length)
      return data.route
    } catch (error) {
      console.error('Error loading route data:', error)
      throw error
    }
  }

  const findRealAmenities = async () => {
    try {
      setLoadingText('Loading Metroranta...')
      const foundAmenities = await gpxFinder.findAmenities(100)
      setAmenities(foundAmenities)

      const totalFound = foundAmenities.toilets.length + foundAmenities.cafes.length + foundAmenities.indoor.length
      console.log(`Total amenities found: ${totalFound}`)

      setLoading(false)

    } catch (error) {
      console.error('Error finding amenities:', error)
      // Fallback to sample data
      await loadSampleData()
    }
  }

  const loadSampleData = async () => {
    const sampleAmenities = {
      toilets: [
        { lat: 60.1699, lng: 24.9384, name: "Central Station Toilets", distanceToRoute: 50 },
        { lat: 60.1580, lng: 24.9506, name: "Market Square Public Toilets", distanceToRoute: 80 },
        { lat: 60.1674, lng: 24.9515, name: "Esplanade Park Toilets", distanceToRoute: 30 }
      ],
      cafes: [
        { lat: 60.1682, lng: 24.9355, name: "Stockmann Café", distanceToRoute: 60 },
        { lat: 60.1625, lng: 24.9444, name: "Café Aalto", distanceToRoute: 40 },
        { lat: 60.1612, lng: 24.9502, name: "Old Market Hall Café", distanceToRoute: 90 }
      ],
      indoor: [
        { lat: 60.1699, lng: 24.9384, name: "Helsinki Central Station", distanceToRoute: 25 },
        { lat: 60.1641, lng: 24.9402, name: "Stockmann Department Store", distanceToRoute: 70 },
        { lat: 60.1595, lng: 24.9525, name: "City Hall", distanceToRoute: 45 }
      ]
    }

    if (routeCoords.length === 0) {
      // Set sample route if no route was loaded
      const sampleRoute = [
        [60.1699, 24.9384],
        [60.1680, 24.9400],
        [60.1650, 24.9450],
        [60.1620, 24.9500],
        [60.1590, 24.9520]
      ]
      setRouteCoords(sampleRoute)
    }

    setAmenities(sampleAmenities)
    setLoading(false)
  }

  const deleteUserSuggestion = async (id, type) => {
    if (confirm('Are you sure you want to delete this suggestion?')) {
      try {
        await gpxFinder.deleteUserSuggestion(id)
        // Remove from local state immediately for UI feedback
        const newSuggestions = {
          ...userSuggestions,
          [type]: userSuggestions[type].filter(suggestion => suggestion.id !== id)
        }
        setUserSuggestions(newSuggestions)
        alert('Suggestion deleted successfully.')
      } catch (error) {
        console.error('Error deleting suggestion:', error)
        alert('Sorry, there was an error deleting the suggestion.')
      }
    }
  }

  const handleMapClick = (latlng) => {
    if (editMode === 'suggest') {
      setTempMarkerPosition(latlng)
    }
  }

  const handleEditSpot = (spot) => {
    setSelectedSpot(spot)
    setTempMarkerPosition({ lat: spot.lat, lng: spot.lng })
    setShowSuggestionForm(true)
  }

  const handleFlagSpot = async (amenityId, type, name) => {
    if (confirm(`Report "${name}" as incorrect or problematic?`)) {
      try {
        const result = await gpxFinder.flagAmenity(amenityId, type)

        // Check if the amenity was archived due to reaching threshold
        if (result && result.amenity_archived) {
          // Remove the flagged amenity from UI immediately
          setAmenities(prevAmenities => ({
            ...prevAmenities,
            [type]: prevAmenities[type].filter(amenity => amenity.id.toString() !== amenityId)
          }))
          alert(`Thank you for your report! This amenity has been removed due to multiple reports.`)
        } else {
          alert(`Thank you for your report! This helps improve the data quality.`)
        }
      } catch (error) {
        console.error('Error flagging amenity:', error)
        alert('Sorry, there was an error submitting your report. Please try again.')
      }
    }
  }

  const toggleSuggestMode = () => {
    const newMode = editMode === 'suggest' ? null : 'suggest'
    setEditMode(newMode)
    setShowSuggestionForm(newMode === 'suggest')
    if (newMode !== 'suggest') {
      setTempMarkerPosition(null)
      setSelectedSpot(null)
    }
  }


  const closeSuggestionForm = () => {
    setShowSuggestionForm(false)
    setEditMode(null)
    setTempMarkerPosition(null)
    setSelectedSpot(null)
  }

  const submitSuggestion = async (formData) => {
    if (!tempMarkerPosition) {
      alert('Please click on the map to select a location.')
      return
    }

    const suggestion = {
      id: selectedSpot ? selectedSpot.id : Date.now(),
      name: formData.name,
      lat: tempMarkerPosition.lat,
      lng: tempMarkerPosition.lng,
      description: formData.description,
      type: formData.type,
      userSuggestion: true,
      distanceToRoute: gpxFinder.getMinDistanceToRoute ?
        gpxFinder.getMinDistanceToRoute(tempMarkerPosition.lat, tempMarkerPosition.lng) : 0
    }

    if (selectedSpot) {
      // Update existing suggestion in database and local state
      try {
        await gpxFinder.updateSuggestion(selectedSpot.id, suggestion)

        let updatedSuggestions = { ...userSuggestions }

        // Find which type the original suggestion was in
        let originalType = null
        for (const type of ['toilets', 'cafes', 'indoor']) {
          if (userSuggestions[type].some(item => item.id === selectedSpot.id)) {
            originalType = type
            break
          }
        }

        if (originalType) {
          // Remove from original type
          updatedSuggestions[originalType] = userSuggestions[originalType].filter(item => item.id !== selectedSpot.id)

          // Add to new type (might be the same)
          updatedSuggestions[suggestion.type] = [
            ...updatedSuggestions[suggestion.type],
            { ...suggestion, userSuggestion: true }
          ]

          setUserSuggestions(updatedSuggestions)
        }

        alert(`Spot "${suggestion.name}" information updated successfully!`)
      } catch (error) {
        console.error('Error updating suggestion:', error)
        alert('Sorry, there was an error updating your suggestion. Please try again.')
        return
      }
    } else {
      // Submit new suggestion to Supabase
      try {
        const result = await gpxFinder.submitSuggestion(suggestion)
        alert(`Thank you! Your suggestion "${suggestion.name}" has been submitted.`)

        // Add to local state for immediate UI feedback (as pending)
        const newSuggestions = {
          ...userSuggestions,
          [suggestion.type]: [...userSuggestions[suggestion.type], {
            ...suggestion,
            id: result.id,
            status: 'pending',
            userSuggestion: true
          }]
        }
        setUserSuggestions(newSuggestions)
      } catch (error) {
        console.error('Error submitting suggestion:', error)
        alert('Sorry, there was an error submitting your suggestion. Please try again.')
        return
      }
    }

    closeSuggestionForm()
  }

  if (loading) {
    return <LoadingSpinner text={loadingText} />
  }

  return (
    <div className="app">
      <header className="app-navbar">
        <div className="navbar-content">
          <div className="navbar-left">
            <button
              className="info-button desktop-only"
              onClick={() => setShowInfoModal(true)}
              title="About this event"
            >
              👟
            </button>
            <h1>HEL Metroranta 50K 🗓️ 18 Oct 2025</h1>
          </div>
          <div className="header-links">
            <button
              className="info-button mobile-only"
              onClick={() => setShowInfoModal(true)}
              title="About this event"
            >
              👟
            </button>
            <a href="https://t.me/+U9XvW8AGoNwwNDc0" target="_blank" rel="noopener noreferrer">
              Join Telegram
            </a>
            <a href="https://www.strava.com/routes/3375457343970102656" target="_blank" rel="noopener noreferrer">
              Strava route
            </a>
          </div>
        </div>
      </header>

      <MapView
        routeCoords={routeCoords}
        amenities={amenities}
        userSuggestions={userSuggestions}
        visibleLayers={visibleLayers}
        tempMarkerPosition={tempMarkerPosition}
        onMapClick={handleMapClick}
        onEditSpot={handleEditSpot}
        onDeleteSuggestion={deleteUserSuggestion}
        onFlagSpot={handleFlagSpot}
        gpxFinder={gpxFinder}
      />

      <Controls
        visibleLayers={visibleLayers}
        onToggleLayer={(layer) => setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }))}
        editMode={editMode}
        onToggleSuggestMode={toggleSuggestMode}
      />

      {showSuggestionForm && (
        <SuggestionForm
          selectedSpot={selectedSpot}
          tempMarkerPosition={tempMarkerPosition}
          onSubmit={submitSuggestion}
          onCancel={closeSuggestionForm}
        />
      )}

      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </div>
  )
}

export default App