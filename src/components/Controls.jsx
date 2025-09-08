function Controls({ visibleLayers, onToggleLayer, editMode, onToggleSuggestMode, onToggleEditMode }) {
  const legendItems = [
    { type: 'toilets', label: 'Bathrooms', color: '#e74c3c' },
    { type: 'cafes', label: 'Cafes', color: '#f39c12' },
    { type: 'indoor', label: 'Indoor Spots', color: '#3498db' },
    { type: 'route', label: 'Your Route', color: '#2ecc71' }
  ]

  return (
    <div className="controls">
      <div className="control-group">
        <label>Show Amenities:</label>
        <div className="checkbox-group">
          {legendItems.slice(0, 3).map(item => (
            <div key={item.type} className="checkbox-item">
              <input
                type="checkbox"
                id={`show-${item.type}`}
                checked={visibleLayers[item.type]}
                onChange={() => onToggleLayer(item.type)}
              />
              <label htmlFor={`show-${item.type}`}>{item.label}</label>
            </div>
          ))}
        </div>
      </div>

      <div className="legend">
        <strong>Legend:</strong>
        {legendItems.map(item => (
          <div key={item.type} className="legend-item">
            <div 
              className="legend-color" 
              style={{ backgroundColor: item.color }}
            ></div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="edit-controls">
        <strong>Edit Mode:</strong>
        <button 
          className={`edit-btn ${editMode === 'suggest' ? 'active' : ''}`}
          onClick={onToggleSuggestMode}
        >
          Suggest New Spot
        </button>
        <button 
          className={`edit-btn ${editMode === 'edit' ? 'active' : ''}`}
          onClick={onToggleEditMode}
        >
          Edit Existing
        </button>
      </div>
    </div>
  )
}

export default Controls