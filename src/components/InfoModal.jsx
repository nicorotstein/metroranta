import { useState, useEffect } from 'react'
import './InfoModal.css'

const InfoModal = ({ isOpen, onClose }) => {
  const [introText, setIntroText] = useState('')

  useEffect(() => {
    const loadIntroText = async () => {
      try {
        const introContent = `🚇  We're running 50 km together!
🏝️  From Kivenlahti to Vuosaari, along the beautiful shore
📍  Meeting point: Kivenlahti metro station
💨  Two pace groups:
	🟠  6:00/km starting at ⏰ 9:00 AM
	🔵  7:00/km starting at ⏰ 9:50 AM
❤️  Run as much or as little as you like:
	🧡  Jump in anywhere along the route
	💙  Check the map and pick your perfect starting point
	💚  The magic happens when we all finish together!
`
        setIntroText(introContent)
      } catch (error) {
        console.error('Error loading intro text:', error)
        setIntroText('Error loading introduction text.')
      }
    }

    if (isOpen) {
      loadIntroText()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Welcome to Metroranta! 🥳</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <pre>{introText}</pre>
        </div>
      </div>
    </div>
  )
}

export default InfoModal