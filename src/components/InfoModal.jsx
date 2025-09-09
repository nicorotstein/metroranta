import { useState, useEffect } from 'react'
import './InfoModal.css'

const InfoModal = ({ isOpen, onClose }) => {
  const [introText, setIntroText] = useState('')

  useEffect(() => {
    const loadIntroText = async () => {
      try {
        const introContent = `
🚇 Distance: 50 km
🏝️ Route: Kivenlahti → Vuosaari, by the shore
💨 One pace group: (TBC)
⚠️ No need to cover the full distance
	💜 Join at any point along the way
	💙 Use the map to choose your start
	💚 Best if we all cross the finish line together
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
          <h2>About HEL Metroranta 50K</h2>
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