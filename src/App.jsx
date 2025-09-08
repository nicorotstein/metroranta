import { useState, useEffect } from 'react'
import MapView from './components/MapView'
import Controls from './components/Controls'
import SuggestionForm from './components/SuggestionForm'
import LoadingSpinner from './components/LoadingSpinner'
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

  const gpxFinder = new SupabaseGPXAmenityFinder()

  useEffect(() => {
    loadGPXData()
    loadUserSuggestions()
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
      setLoadingText('Finding nearby amenities...')
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
        {lat: 60.1699, lng: 24.9384, name: "Central Station Toilets", distanceToRoute: 50},
        {lat: 60.1580, lng: 24.9506, name: "Market Square Public Toilets", distanceToRoute: 80},
        {lat: 60.1674, lng: 24.9515, name: "Esplanade Park Toilets", distanceToRoute: 30}
      ],
      cafes: [
        {lat: 60.1682, lng: 24.9355, name: "Stockmann Café", distanceToRoute: 60},
        {lat: 60.1625, lng: 24.9444, name: "Café Aalto", distanceToRoute: 40},
        {lat: 60.1612, lng: 24.9502, name: "Old Market Hall Café", distanceToRoute: 90}
      ],
      indoor: [
        {lat: 60.1699, lng: 24.9384, name: "Helsinki Central Station", distanceToRoute: 25},
        {lat: 60.1641, lng: 24.9402, name: "Stockmann Department Store", distanceToRoute: 70},
        {lat: 60.1595, lng: 24.9525, name: "City Hall", distanceToRoute: 45}
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
    const flagOptions = [
      { key: 'incorrect_location', label: 'Location is incorrect' },
      { key: 'closed_permanently', label: 'Permanently closed' },
      { key: 'incorrect_type', label: 'Wrong category/type' },
      { key: 'duplicate', label: 'Duplicate entry' },
      { key: 'other', label: 'Other issue' }
    ]

    const flagTypeIndex = prompt(
      `Report issue with "${name}":\n\n` +
      flagOptions.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n') +
      '\n\nSelect option (1-5):'
    )

    const flagIndex = parseInt(flagTypeIndex) - 1
    if (flagIndex < 0 || flagIndex >= flagOptions.length) {
      return // User cancelled or invalid selection
    }

    const flagType = flagOptions[flagIndex].key
    const reason = prompt('Optional: Provide additional details about the issue:') || ''

    try {
      await gpxFinder.flagAmenity(amenityId, flagType, reason)
      alert(`Thank you for reporting this issue. It will be reviewed by our team.`)
    } catch (error) {
      console.error('Error flagging amenity:', error)
      alert('Sorry, there was an error submitting your report. Please try again.')
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

  const toggleEditMode = () => {
    const newMode = editMode === 'edit' ? null : 'edit'
    setEditMode(newMode)
    if (newMode === 'edit') {
      setShowSuggestionForm(false)
      setTempMarkerPosition(null)
      alert('Edit mode activated. Click on any marker to edit its information.')
    } else {
      alert('Edit mode deactivated.')
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
      // Update existing suggestion - for now just show alert
      alert(`Spot "${suggestion.name}" information updated!`)
    } else {
      // Submit new suggestion to Supabase
      try {
        const result = await gpxFinder.submitSuggestion(suggestion)
        alert(`Thank you! Your suggestion "${suggestion.name}" has been submitted for review.`)
        
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
      />
      
      <Controls
        visibleLayers={visibleLayers}
        onToggleLayer={(layer) => setVisibleLayers(prev => ({...prev, [layer]: !prev[layer]}))}
        editMode={editMode}
        onToggleSuggestMode={toggleSuggestMode}
        onToggleEditMode={toggleEditMode}
      />

      {showSuggestionForm && (
        <SuggestionForm
          selectedSpot={selectedSpot}
          tempMarkerPosition={tempMarkerPosition}
          onSubmit={submitSuggestion}
          onCancel={closeSuggestionForm}
        />
      )}
    </div>
  )
}

export default App