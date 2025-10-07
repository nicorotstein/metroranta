import { useState } from 'react'
import { colors } from './MapView'

function Controls({ visibleLayers, onToggleLayer, editMode, onToggleSuggestMode, hopInMode }) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const legendItems = [
    { type: 'toilets', label: 'Bathrooms', color: colors.toilets },
    { type: 'cafes', label: 'Cafes', color: colors.cafes },
    { type: 'indoor', label: 'Indoor Spots', color: colors.indoor },
    { type: 'route', label: 'Route', color: colors.route }
  ]

  return (
    <div className={`controls ${isCollapsed ? 'collapsed' : ''}`}>
      {!isCollapsed && (
        <div className="controls-content">
          <div className="control-group">
            <div className="section-title">
              <strong>Amenities:</strong>
            </div>
            <div className="checkbox-group">
              {legendItems.slice(0, 3).map(item => (
                <div key={item.type} className="checkbox-item">
                  <input
                    type="checkbox"
                    id={`show-${item.type}`}
                    checked={visibleLayers[item.type]}
                    onChange={() => onToggleLayer(item.type)}
                    disabled={hopInMode}
                  />
                  <label htmlFor={`show-${item.type}`} style={{ color: item.color, opacity: hopInMode ? 0.5 : 1 }}>
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button
            className={`edit-btn ${editMode === 'suggest' ? 'active' : ''}`}
            onClick={onToggleSuggestMode}
          >
            Suggest New
          </button>

          <div className="shoeme-section">
            <div className="shoeme-text">Looking for new shoes?</div>
            <a
              href="https://shoeme.fit"
              target="_blank"
              rel="noopener noreferrer"
              className="shoeme-link"
            >
              ShoeMe
            </a>
          </div>
        </div>
      )}

      <div
        className="controls-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand controls' : 'Collapse controls'}
      >
        <span className="controls-title">Controls</span>
        <button
          className="collapse-btn"
        >
          {isCollapsed ? '▲' : '▼'}
        </button>
      </div>
    </div>
  )
}

export default Controls