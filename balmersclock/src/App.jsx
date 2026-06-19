import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// ── BAC Constants ──────────────────────────────────────────────────────────────
const R_MALE = 0.68
const R_FEMALE = 0.55
const METABOLISM_PER_HOUR = 0.015  // % BAC per hour (displayed as promille*10)
// We work in BAC % internally (0.04 = 0.04%), display as promille (0.04% = 0.4‰)
const UNIT_GRAMS = 12              // grams of pure alcohol per Swedish unit (enhet)

// Peak zone in BAC % (= promille / 10)
const PEAK_LOW  = 0.04   // 0.4 promille
const PEAK_HIGH = 0.07   // 0.7 promille
const GAUGE_MAX = 0.15   // 1.5 promille (gauge max)

const ZONES = {
  sober:  { id: 'sober',  label: 'NYKTER',           title: '// TODO: Drick något',           color: '#94a3b8' },
  warmup: { id: 'warmup', label: 'UPPVÄRMNING',       title: '> warming up...',                color: '#f59e0b' },
  peak:   { id: 'peak',   label: 'BALMER\'S PEAK',    title: '⚡ OPTIMAL KODNINGSSTATUS',      color: '#10b981' },
  over:   { id: 'over',   label: 'ÖVERKALIBRERAD',    title: 'git push --force 😬',            color: '#f97316' },
  danger: { id: 'danger', label: 'UNDEFINED BEHAVIOR', title: 'if (bac > sanity) { panic(); }', color: '#ef4444' },
}

const MESSAGES = {
  sober: [
    'Du är tragiskt nykter. Produktiviteten lider.',
    'null pointer exception: saknar alkohol.',
    'Stack overflow: för mycket kaffe, för lite öl.',
    'Hjärnan kör i strikt säkert läge. Det är trist.',
  ],
  warmup: [
    'Fingrarna börjar hitta rätt tangenter. Nästan.',
    'Idéerna flödar som en while-loop utan break.',
    'Du kan se lösningen... ungefär.',
    'Refactoring-impulsen vaknar. Bra tecken.',
  ],
  peak: [
    'ALLT GÅR ATT LÖSA. Du ser mönstren nu.',
    'Den där bugg som plågat dig i veckor? Trivialt.',
    'Arkitekturen är KRISTALLKLAR. Koda nu!',
    'Du förstår inte varför du inte alltid kodar såhär.',
    'Steve Ballmer nickar från sin läskstapel.',
  ],
  over: [
    'Koden kompilerar men... testerna är... annorlunda.',
    'git diff visar 847 ändrade filer. Normal.',
    'Du har döpt om alla variabler till "x". Kreativt.',
    'README:en är nu 3 sidor om dinosaurier.',
  ],
  danger: [
    'rm -rf / känns som en rimlig optimering just nu.',
    'Du har pushat direkt till main. Tre gånger.',
    'Koden fungerar på ett sätt ingen förstår, inklusive du.',
    'Driftsätt inte. Inte nu. Inte idag.',
  ],
}

function getZone(bac) {
  if (bac < 0.02)          return 'sober'
  if (bac < PEAK_LOW)      return 'warmup'
  if (bac <= PEAK_HIGH)    return 'peak'
  if (bac <= 0.12)         return 'over'
  return 'danger'
}

function calcBAC(drinks, weightKg, gender) {
  if (drinks.length === 0 || weightKg <= 0) return 0
  const r = gender === 'female' ? R_FEMALE : R_MALE
  const now = Date.now()
  const firstTime = Math.min(...drinks.map(d => d.time))
  const hoursElapsed = (now - firstTime) / 3_600_000

  const totalAlcohol = drinks.reduce((s, d) => s + d.units * UNIT_GRAMS, 0)
  const peakBAC = totalAlcohol / (weightKg * 10 * r)
  const metabolized = METABOLISM_PER_HOUR * hoursElapsed

  return Math.max(0, peakBAC - metabolized)
}

function needlePercent(bac) {
  return Math.min(100, (bac / GAUGE_MAX) * 100)
}

function formatTime(date) {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(date) {
  return date.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatCountdown(hours) {
  const totalMin = Math.round(hours * 60)
  if (totalMin <= 0) return '00:00'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}t ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export default function App() {
  const [now, setNow] = useState(new Date())
  const [drinks, setDrinks] = useState([])
  const [weightKg, setWeightKg] = useState(75)
  const [gender, setGender] = useState('male')
  const [unitsToAdd, setUnitsToAdd] = useState(1)
  const msgIndex = useRef(0)
  const [messageKey, setMessageKey] = useState(0)

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Rotate message every 8s
  useEffect(() => {
    const id = setInterval(() => setMessageKey(k => k + 1), 8000)
    return () => clearInterval(id)
  }, [])

  const bac = calcBAC(drinks, weightKg, gender)
  const zoneName = getZone(bac)
  const zone = ZONES[zoneName]
  const msgs = MESSAGES[zoneName]
  const message = msgs[messageKey % msgs.length]

  // Next drink recommendation
  const nextDrinkInfo = (() => {
    if (bac < PEAK_LOW) {
      return { label: 'DRICK NU', time: null, sub: 'Du är under peak-zonen' }
    }
    if (bac <= PEAK_HIGH) {
      const hoursLeft = (bac - PEAK_LOW) / METABOLISM_PER_HOUR
      return {
        label: 'NÄSTA ENHET OM',
        time: formatCountdown(hoursLeft),
        sub: `BAC sjunker till ${(PEAK_LOW * 10).toFixed(1)}‰ om ${formatCountdown(hoursLeft)}`,
      }
    }
    const hoursLeft = (bac - PEAK_HIGH) / METABOLISM_PER_HOUR
    return {
      label: 'VÄNTA',
      time: formatCountdown(hoursLeft),
      sub: `Du når peak-zonen om ${formatCountdown(hoursLeft)}. Lägg undan flaskan.`,
    }
  })()

  const addDrink = useCallback(() => {
    const units = parseFloat(unitsToAdd) || 1
    if (units <= 0 || units > 10) return
    setDrinks(prev => [...prev, { id: Date.now(), time: Date.now(), units }])
  }, [unitsToAdd])

  const removeDrink = useCallback((id) => {
    setDrinks(prev => prev.filter(d => d.id !== id))
  }, [])

  const bacDisplay = (bac * 10).toFixed(2)

  return (
    <>
      <header className="header">
        <h1>⚗ Balmer&apos;s Peak</h1>
        <p className="subtitle">Produktivitetsklockan för den medvetna utvecklaren</p>
      </header>

      <div className="clock-display">{formatTime(now)}</div>
      <div className="clock-date">{formatDate(now)}</div>

      {/* Profile */}
      <div className="profile-card">
        <h3>📋 Kalibrering</h3>
        <div className="profile-fields">
          <div className="field-group">
            <label>Vikt (kg)</label>
            <input
              type="number"
              min="40"
              max="200"
              value={weightKg}
              onChange={e => setWeightKg(Number(e.target.value))}
            />
          </div>
          <div className="field-group">
            <label>Biologiskt kön</label>
            <select value={gender} onChange={e => setGender(e.target.value)}>
              <option value="male">Man (r=0,68)</option>
              <option value="female">Kvinna (r=0,55)</option>
            </select>
          </div>
        </div>
      </div>

      {/* BAC Gauge */}
      <div className="gauge-section">
        <div className="gauge-label">
          <span>Beräknat BAC (Widmark)</span>
          <span>
            <span className="bac-value" style={{ color: zone.color }}>
              {bacDisplay}
            </span>
            <span className="bac-unit">‰</span>
          </span>
        </div>
        <div className="gauge-track">
          <div className="gauge-zones">
            <div className="zone-segment sober" />
            <div className="zone-segment warmup" />
            <div className="zone-segment peak" />
            <div className="zone-segment over" />
            <div className="zone-segment danger" />
          </div>
          <div className="gauge-needle" style={{ left: `${needlePercent(bac)}%` }} />
        </div>
        <div className="gauge-ticks">
          <span>0,0</span>
          <span>0,2</span>
          <span>0,4</span>
          <span>0,7</span>
          <span>1,0</span>
          <span>1,2</span>
          <span>1,5‰</span>
        </div>
      </div>

      {/* Zone Status */}
      <div className={`zone-status ${zoneName}`}>
        <div className="zone-name">{zone.label}</div>
        <div className="zone-title">{zone.title}</div>
        <div className="zone-message">{message}</div>
      </div>

      {/* Next Drink Timer */}
      <div className="next-drink-card">
        <div className="next-drink-icon">🍺</div>
        <div className="next-drink-info">
          <div className="next-drink-label">{nextDrinkInfo.label}</div>
          {nextDrinkInfo.time ? (
            <div className="next-drink-time">{nextDrinkInfo.time}</div>
          ) : (
            <div className="next-drink-time drink-now">DRICK NU</div>
          )}
          <div className="next-drink-sub">{nextDrinkInfo.sub}</div>
        </div>
      </div>

      {/* Drink Logger */}
      <div className="drink-section">
        <h3>🍻 Logg</h3>
        <div className="add-drink-row">
          <input
            className="units-input"
            type="number"
            min="0.5"
            max="5"
            step="0.5"
            value={unitsToAdd}
            onChange={e => setUnitsToAdd(e.target.value)}
          />
          <span className="units-label">enheter</span>
          <button className="add-drink-btn" onClick={addDrink}>
            + Logga dryck
          </button>
        </div>

        <div className="drink-log">
          {drinks.length === 0 ? (
            <div className="no-drinks">Inga loggade drycker. Varför inte?</div>
          ) : (
            [...drinks].reverse().map(d => (
              <div key={d.id} className="drink-item">
                <span className="drink-item-time">
                  {new Date(d.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="drink-item-units">
                  {d.units} {d.units === 1 ? 'enhet' : 'enheter'}
                </span>
                <button className="drink-item-remove" onClick={() => removeDrink(d.id)}>✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      <button className="reset-btn" onClick={() => setDrinks([])}>
        ↺ Rensa logg
      </button>

      <p className="disclaimer">
        ⚠ Beräkningarna är approximativa (Widmarks formel) och ska inte användas som underlag
        för beslut om att köra bil eller annat riskbeteende. Ansvarsfull konsumtion. Peak-zonen
        är en satirisk referens till xkcd #323.
      </p>
    </>
  )
}
