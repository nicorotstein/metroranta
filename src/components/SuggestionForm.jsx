import { useState, useEffect } from 'react'

function SuggestionForm({ selectedSpot, tempMarkerPosition, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    type: 'toilets',
    name: '',
    description: ''
  })

  useEffect(() => {
    if (selectedSpot) {
      setFormData({
        type: selectedSpot.type || 'toilets',
        name: selectedSpot.name || '',
        description: selectedSpot.description || ''
      })
    }
  }, [selectedSpot])

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      alert('Please enter a name for the spot.')
      return
    }

    onSubmit(formData)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const locationText = tempMarkerPosition 
    ? `Lat: ${tempMarkerPosition.lat.toFixed(6)}, Lng: ${tempMarkerPosition.lng.toFixed(6)}`
    : 'No location selected'

  return (
    <div className="suggestion-form">
      <h3>{selectedSpot ? 'Edit Spot Information' : 'Suggest New Spot'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="spot-type">Type:</label>
          <select
            id="spot-type"
            name="type"
            value={formData.type}
            onChange={handleChange}
          >
            <option value="toilets">Bathroom</option>
            <option value="cafes">Cafe</option>
            <option value="indoor">Indoor Spot</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="spot-name">Name:</label>
          <input
            type="text"
            id="spot-name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Enter spot name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="spot-description">Description (optional):</label>
          <textarea
            id="spot-description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Additional details..."
          />
        </div>

        <div className="form-group">
          <label>Location: Click on the map to set location</label>
          <small className="location-info">{locationText}</small>
        </div>

        <div className="form-buttons">
          <button type="button" className="form-btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="form-btn primary">
            {selectedSpot ? 'Update' : 'Submit'} Suggestion
          </button>
        </div>
      </form>
    </div>
  )
}

export default SuggestionForm