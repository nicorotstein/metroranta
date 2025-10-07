function HopInToggle({ hopInMode, onToggleHopInMode }) {
  return (
    <div className="hop-in-toggle">
      <label className="hop-in-toggle-label">
        <input
          type="checkbox"
          checked={hopInMode}
          onChange={onToggleHopInMode}
          className="hop-in-toggle-checkbox"
        />
        <span className="hop-in-toggle-text">
          🏃 Hop-in Points Only
        </span>
      </label>
    </div>
  )
}

export default HopInToggle
