import { useState, useEffect } from 'react'
import MapView from './components/MapView'
import Controls from './components/Controls'
import SuggestionForm from './components/SuggestionForm'
import LoadingSpinner from './components/LoadingSpinner'
import GPXAmenityFinder from './utils/gpx-parser'
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

  const gpxFinder = new GPXAmenityFinder()

  useEffect(() => {
    loadGPXData()
    loadUserSuggestions()
  }, [])

  const loadGPXData = async () => {
    try {
      console.log('Starting to load GPX data...')
      const routeData = await loadRouteData()
      setRouteCoords(routeData)
      
      // Set route coordinates in GPX finder for amenity search
      gpxFinder.routeCoords = routeData
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

  const loadUserSuggestions = () => {
    const saved = localStorage.getItem('userSuggestions')
    if (saved) {
      try {
        const suggestions = JSON.parse(saved)
        const categorized = { toilets: [], cafes: [], indoor: [] }
        suggestions.forEach(suggestion => {
          if (categorized[suggestion.type]) {
            categorized[suggestion.type].push(suggestion)
          }
        })
        setUserSuggestions(categorized)
      } catch (e) {
        console.error('Error loading user suggestions:', e)
      }
    }
  }

  const saveUserSuggestions = (newSuggestions) => {
    const allSuggestions = []
    Object.keys(newSuggestions).forEach(type => {
      newSuggestions[type].forEach(suggestion => {
        allSuggestions.push({ ...suggestion, type })
      })
    })
    localStorage.setItem('userSuggestions', JSON.stringify(allSuggestions))
    setUserSuggestions(newSuggestions)
  }

  const addUserSuggestion = (suggestion) => {
    const newSuggestions = {
      ...userSuggestions,
      [suggestion.type]: [...userSuggestions[suggestion.type], suggestion]
    }
    saveUserSuggestions(newSuggestions)
  }

  const deleteUserSuggestion = (id, type) => {
    if (confirm('Are you sure you want to delete this suggestion?')) {
      const newSuggestions = {
        ...userSuggestions,
        [type]: userSuggestions[type].filter(suggestion => suggestion.id !== id)
      }
      saveUserSuggestions(newSuggestions)
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

  const submitSuggestion = (formData) => {
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
      // Add new suggestion
      addUserSuggestion(suggestion)
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