import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

type Status = 'good' | 'caution' | 'avoid'

type Place = {
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country?: string
}

type HourPoint = {
  time: string
  label: string
  uvIndex: number
  rainChance: number
  feelsLike: number
  wind: number
}

type DayPoint = {
  date: string
  label: string
  uvMax: number
  tempMax: number
  tempMin: number
  rainChance: number
}

type Conditions = {
  place: Place
  fetchedAt: string
  current: {
    temperature: number
    feelsLike: number
    wind: number
    precipitation: number
    weatherCode: number
    uvIndex: number
    aqi?: number
    pm25?: number
  }
  hourly: HourPoint[]
  daily: DayPoint[]
}

type Advice = {
  status: Status
  title: string
  summary: string
  reasons: string[]
  bestWindows: HourPoint[]
  sunscreen: {
    title: string
    detail: string
    tattooNote: string
  }
}

type GeocodeResponse = {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    admin1?: string
    country?: string
  }>
}

type ForecastResponse = {
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  hourly: {
    time: string[]
    uv_index: number[]
    precipitation_probability: number[]
    apparent_temperature: number[]
    wind_speed_10m: number[]
  }
  daily: {
    time: string[]
    uv_index_max: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
}

type AirQualityResponse = {
  current?: {
    us_aqi?: number
    pm2_5?: number
  }
}

const savedPlaceKey = 'outside-today:last-place'

const statusStyles: Record<Status, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  caution: 'border-amber-200 bg-amber-50 text-amber-950',
  avoid: 'border-rose-200 bg-rose-50 text-rose-950',
}

const statusBadges: Record<Status, string> = {
  good: 'bg-emerald-600 text-white',
  caution: 'bg-amber-500 text-amber-950',
  avoid: 'bg-rose-600 text-white',
}

function formatPlace(place: Place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ')
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function numberAt(values: number[] | undefined, index: number, fallback = 0) {
  const value = values?.[index]

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return fallback
}

function weatherSummary(code: number) {
  if (code === 0) {
    return 'Clear'
  }

  if ([1, 2, 3].includes(code)) {
    return 'Partly cloudy'
  }

  if ([45, 48].includes(code)) {
    return 'Foggy'
  }

  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return 'Rain likely'
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Snow likely'
  }

  if ([95, 96, 99].includes(code)) {
    return 'Storm risk'
  }

  return 'Mixed conditions'
}

function buildSunscreenAdvice(currentUv: number, peakUv: number) {
  const uv = Math.max(currentUv, peakUv)

  if (uv >= 8) {
    return {
      title: 'Use SPF 50 and avoid peak sun',
      detail: `UV is expected to reach ${uv.toFixed(1)} today. Use broad-spectrum SPF 50, seek shade, and reapply every 2 hours.`,
      tattooNote:
        'Healed tattoos should be covered or protected with SPF because UV can fade ink. Keep fresh tattoos out of direct sun and follow aftercare guidance.',
    }
  }

  if (uv >= 6) {
    return {
      title: 'Use SPF 30 to 50 today',
      detail: `UV is expected to reach ${uv.toFixed(1)} today. Sunscreen, sunglasses, and a hat are recommended if you are outside for more than a short trip.`,
      tattooNote:
        'For healed tattoos, apply sunscreen or cover them with clothing. Fresh tattoos should stay out of the sun until fully healed.',
    }
  }

  if (uv >= 3) {
    return {
      title: 'Sunscreen recommended',
      detail: `UV is expected to reach ${uv.toFixed(1)} today. Use broad-spectrum SPF 30+ on exposed skin, especially around midday.`,
      tattooNote:
        'Healed tattoos are still worth protecting at this UV level to reduce fading. Avoid sun exposure on new tattoos.',
    }
  }

  return {
    title: 'Sunscreen usually optional',
    detail: `UV is low at ${uv.toFixed(1)}. Sunscreen is usually optional for short trips, but still useful for long outdoor time or sensitive skin.`,
    tattooNote:
      'If you have tattoos, covering them on bright days is still a good habit. Fresh tattoos should not be exposed to direct sun.',
  }
}

async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({
    name: query,
    count: '5',
    language: 'en',
    format: 'json',
  })

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`)

  if (!response.ok) {
    throw new Error('Could not search for that location.')
  }

  const data = (await response.json()) as GeocodeResponse

  return (
    data.results?.map((result) => ({
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      admin1: result.admin1,
      country: result.country,
    })) ?? []
  )
}

async function fetchConditions(place: Place): Promise<Conditions> {
  const forecastParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
    hourly: ['uv_index', 'precipitation_probability', 'apparent_temperature', 'wind_speed_10m'].join(','),
    daily: [
      'uv_index_max',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
    ].join(','),
    timezone: 'auto',
    forecast_days: '3',
  })

  const airParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'us_aqi,pm2_5',
    timezone: 'auto',
  })

  const [forecastResponse, airResponse] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`),
  ])

  if (!forecastResponse.ok) {
    throw new Error('Weather data is unavailable right now.')
  }

  const forecast = (await forecastResponse.json()) as ForecastResponse
  const air = airResponse.ok ? ((await airResponse.json()) as AirQualityResponse) : undefined
  const currentTime = forecast.current?.time
  const currentIndex = Math.max(0, currentTime ? forecast.hourly.time.indexOf(currentTime) : 0)

  const hourly = forecast.hourly.time.map((time, index) => ({
    time,
    label: formatTimeLabel(time),
    uvIndex: numberAt(forecast.hourly.uv_index, index),
    rainChance: numberAt(forecast.hourly.precipitation_probability, index),
    feelsLike: numberAt(forecast.hourly.apparent_temperature, index),
    wind: numberAt(forecast.hourly.wind_speed_10m, index),
  }))

  const daily = forecast.daily.time.map((date, index) => ({
    date,
    label: formatDayLabel(date),
    uvMax: numberAt(forecast.daily.uv_index_max, index),
    tempMax: numberAt(forecast.daily.temperature_2m_max, index),
    tempMin: numberAt(forecast.daily.temperature_2m_min, index),
    rainChance: numberAt(forecast.daily.precipitation_probability_max, index),
  }))

  return {
    place,
    fetchedAt: new Date().toISOString(),
    current: {
      temperature: forecast.current?.temperature_2m ?? hourly[currentIndex]?.feelsLike ?? 0,
      feelsLike: forecast.current?.apparent_temperature ?? hourly[currentIndex]?.feelsLike ?? 0,
      wind: forecast.current?.wind_speed_10m ?? hourly[currentIndex]?.wind ?? 0,
      precipitation: forecast.current?.precipitation ?? 0,
      weatherCode: forecast.current?.weather_code ?? 0,
      uvIndex: hourly[currentIndex]?.uvIndex ?? 0,
      aqi: air?.current?.us_aqi,
      pm25: air?.current?.pm2_5,
    },
    hourly: hourly.slice(currentIndex, currentIndex + 18),
    daily,
  }
}

function buildAdvice(conditions: Conditions): Advice {
  let riskScore = 0
  const reasons: string[] = []
  const { current, hourly } = conditions
  const nextSixHours = hourly.slice(0, 6)
  const highestRainChance = Math.max(...nextSixHours.map((hour) => hour.rainChance), 0)
  const sunscreen = buildSunscreenAdvice(current.uvIndex, conditions.daily[0]?.uvMax ?? current.uvIndex)

  if (current.uvIndex >= 8) {
    riskScore += 4
    reasons.push(`Very high UV index of ${current.uvIndex.toFixed(1)}. Avoid midday sun if you can.`)
  } else if (current.uvIndex >= 6) {
    riskScore += 3
    reasons.push(`High UV index of ${current.uvIndex.toFixed(1)}. Sunscreen, shade, and a hat are sensible.`)
  } else if (current.uvIndex >= 3) {
    riskScore += 2
    reasons.push(`UV index is ${current.uvIndex.toFixed(1)}. Sunscreen is recommended.`)
  } else {
    reasons.push(`UV index is low at ${current.uvIndex.toFixed(1)} right now.`)
  }

  if (current.aqi === undefined) {
    reasons.push('Air quality data is unavailable for this location.')
  } else if (current.aqi >= 151) {
    riskScore += 4
    reasons.push(`Air quality is unhealthy with AQI ${Math.round(current.aqi)}.`)
  } else if (current.aqi >= 101) {
    riskScore += 2
    reasons.push(`Air quality may bother sensitive people. AQI is ${Math.round(current.aqi)}.`)
  } else if (current.aqi >= 51) {
    riskScore += 1
    reasons.push(`Air quality is moderate with AQI ${Math.round(current.aqi)}.`)
  } else {
    reasons.push(`Air quality looks good with AQI ${Math.round(current.aqi)}.`)
  }

  if (current.feelsLike >= 32) {
    riskScore += 3
    reasons.push(`It feels hot at ${Math.round(current.feelsLike)} C. Hydrate and limit hard exercise.`)
  } else if (current.feelsLike >= 28) {
    riskScore += 2
    reasons.push(`It feels warm at ${Math.round(current.feelsLike)} C. Take water if you are out long.`)
  } else if (current.feelsLike <= 0) {
    riskScore += 2
    reasons.push(`It feels freezing at ${Math.round(current.feelsLike)} C. Dress for cold exposure.`)
  } else {
    reasons.push(`Temperature feels comfortable at ${Math.round(current.feelsLike)} C.`)
  }

  if (highestRainChance >= 70) {
    riskScore += 2
    reasons.push(`Rain chance reaches ${Math.round(highestRainChance)}% soon. Take waterproofs.`)
  } else if (highestRainChance >= 40) {
    riskScore += 1
    reasons.push(`Some rain is possible soon, up to ${Math.round(highestRainChance)}%.`)
  }

  if (current.wind >= 40) {
    riskScore += 2
    reasons.push(`Wind is strong at ${Math.round(current.wind)} km/h.`)
  } else if (current.wind >= 25) {
    riskScore += 1
    reasons.push(`It is breezy at ${Math.round(current.wind)} km/h.`)
  }

  const bestWindows = hourly
    .filter(
      (hour) =>
        hour.uvIndex < 3 && hour.rainChance < 45 && hour.wind < 30 && hour.feelsLike > 2 && hour.feelsLike < 30,
    )
    .slice(0, 4)

  if (riskScore >= 7) {
    return {
      status: 'avoid',
      title: 'Avoid peak exposure',
      summary: 'Going outside is possible, but the conditions need planning.',
      reasons: reasons.slice(0, 5),
      bestWindows,
      sunscreen,
    }
  }

  if (riskScore >= 3) {
    return {
      status: 'caution',
      title: 'Go outside with caution',
      summary: 'It is okay for many people, but a few conditions need attention.',
      reasons: reasons.slice(0, 5),
      bestWindows,
      sunscreen,
    }
  }

  return {
    status: 'good',
    title: 'Good time to go outside',
    summary: 'Conditions look comfortable for normal outdoor activity.',
    reasons: reasons.slice(0, 5),
    bestWindows,
    sunscreen,
  }
}

function readSavedPlace() {
  try {
    const saved = localStorage.getItem(savedPlaceKey)
    return saved ? (JSON.parse(saved) as Place) : undefined
  } catch {
    return undefined
  }
}

function savePlace(place: Place) {
  localStorage.setItem(savedPlaceKey, JSON.stringify(place))
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    })
  })
}

function App() {
  const [query, setQuery] = useState('')
  const [conditions, setConditions] = useState<Conditions>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const loadedSavedPlace = useRef(false)

  const advice = useMemo(() => (conditions ? buildAdvice(conditions) : undefined), [conditions])

  const loadConditions = useCallback(async (place: Place) => {
    setLoading(true)
    setError('')
    setShareMessage('')

    try {
      const nextConditions = await fetchConditions(place)
      setConditions(nextConditions)
      setQuery(formatPlace(place))
      savePlace(place)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loadedSavedPlace.current) {
      return
    }

    loadedSavedPlace.current = true
    const savedPlace = readSavedPlace()

    if (savedPlace) {
      void loadConditions(savedPlace)
    }
  }, [loadConditions])

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!query.trim()) {
      setError('Enter a town or city first.')
      return
    }

    setLoading(true)
    setError('')
    setShareMessage('')

    try {
      const places = await searchPlaces(query.trim())
      const firstPlace = places[0]

      if (!firstPlace) {
        throw new Error('No matching places found. Try a nearby town or city.')
      }

      await loadConditions(firstPlace)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not search for that place.')
      setLoading(false)
    }
  }

  async function handleUseLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location lookup.')
      return
    }

    setLoading(true)
    setError('')
    setShareMessage('')

    try {
      const position = await getCurrentPosition()
      await loadConditions({
        name: 'Current location',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
    } catch {
      setError('Location permission was not granted. You can still search for a city.')
      setLoading(false)
    }
  }

  async function handleShare() {
    if (!conditions || !advice) {
      return
    }

    const message = `${formatPlace(conditions.place)}: ${advice.title}. ${advice.sunscreen.title}. UV ${conditions.current.uvIndex.toFixed(
      1,
    )}, AQI ${conditions.current.aqi ? Math.round(conditions.current.aqi) : 'unknown'}.`

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Outside Today',
          text: message,
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(message)
        setShareMessage('Copied today\'s summary to your clipboard.')
      }
    } catch {
      setShareMessage('Sharing was cancelled.')
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f99d,transparent_30%),linear-gradient(135deg,#f8fafc,#e0f2fe_45%,#ecfeff)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-2xl shadow-sky-900/10 backdrop-blur md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">
                Outside Today
              </p>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Should you go outside today?
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
                Get a quick outdoor safety check using local UV, air quality, rain, wind, and temperature data.
              </p>
            </div>

            <form
              className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5 lg:max-w-md"
              onSubmit={handleSearch}
            >
              <label className="text-sm font-semibold text-slate-700" htmlFor="location-search">
                Search a place
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  id="location-search"
                  placeholder="e.g. London"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button
                  className="min-h-12 rounded-2xl bg-slate-950 px-5 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  Check
                </button>
              </div>
              <button
                className="mt-3 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
                type="button"
                onClick={handleUseLocation}
              >
                Use my current location
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Location stays in your browser. Data comes from Open-Meteo.
              </p>
            </form>
          </div>
        </header>

        {error && (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 font-medium text-rose-900">
            {error}
          </section>
        )}

        {loading && (
          <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 text-slate-600 shadow-lg">
            Checking the latest outdoor conditions...
          </section>
        )}

        {conditions && advice && (
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <article className={`rounded-[2rem] border p-6 shadow-xl shadow-slate-900/5 ${statusStyles[advice.status]}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] opacity-70">
                    {formatPlace(conditions.place)}
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{advice.title}</h2>
                  <p className="mt-3 max-w-2xl text-lg leading-8 opacity-80">{advice.summary}</p>
                </div>
                <span className={`rounded-full px-4 py-2 text-sm font-black uppercase ${statusBadges[advice.status]}`}>
                  {advice.status}
                </span>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="UV index" value={conditions.current.uvIndex.toFixed(1)} />
                <Metric label="Air quality" value={conditions.current.aqi ? Math.round(conditions.current.aqi) : 'N/A'} />
                <Metric label="Temperature" value={`${Math.round(conditions.current.temperature)} C`} />
                <Metric label="Feels like" value={`${Math.round(conditions.current.feelsLike)} C`} />
                <Metric label="Weather" value={weatherSummary(conditions.current.weatherCode)} />
              </div>

              <div className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-950">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Sunscreen advice</p>
                <h3 className="mt-2 text-2xl font-black">{advice.sunscreen.title}</h3>
                <p className="mt-3 leading-7">{advice.sunscreen.detail}</p>
                <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-6">{advice.sunscreen.tattooNote}</p>
              </div>

              <div className="mt-8 rounded-3xl bg-white/60 p-5">
                <h3 className="text-lg font-black">Why this recommendation?</h3>
                <ul className="mt-4 space-y-3">
                  {advice.reasons.map((reason) => (
                    <li className="flex gap-3 text-sm leading-6" key={reason}>
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm opacity-70">
                  Updated {new Date(conditions.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
                <button
                  className="rounded-2xl bg-white px-5 py-3 font-bold text-slate-950 shadow-sm transition hover:bg-slate-50"
                  type="button"
                  onClick={handleShare}
                >
                  Share today&apos;s check
                </button>
              </div>
              {shareMessage && <p className="mt-3 text-sm font-medium opacity-80">{shareMessage}</p>}
            </article>

            <aside className="flex flex-col gap-6">
              <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-900/5">
                <h3 className="text-xl font-black text-slate-950">Best times today</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Lower UV, lighter wind, and lower rain chance get priority.
                </p>
                <div className="mt-5 grid gap-3">
                  {advice.bestWindows.length > 0 ? (
                    advice.bestWindows.map((hour) => (
                      <div className="rounded-2xl bg-slate-50 p-4" key={hour.time}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-slate-950">{hour.label}</p>
                          <p className="text-sm font-semibold text-emerald-700">Better window</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          UV {hour.uvIndex.toFixed(1)} - rain {Math.round(hour.rainChance)}% - wind{' '}
                          {Math.round(hour.wind)} km/h
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      No low-risk window found in the next 18 hours. Check the forecast cards before making plans.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-900/5">
                <h3 className="text-xl font-black text-slate-950">3-day outlook</h3>
                <div className="mt-5 grid gap-3">
                  {conditions.daily.map((day) => (
                    <div className="rounded-2xl border border-slate-100 bg-white p-4" key={day.date}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-slate-950">{day.label}</p>
                        <p className="text-sm font-semibold text-slate-500">UV max {day.uvMax.toFixed(1)}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {Math.round(day.tempMin)} C to {Math.round(day.tempMax)} C - rain up to{' '}
                        {Math.round(day.rainChance)}%
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        )}

        {!conditions && !loading && (
          <section className="grid gap-4 md:grid-cols-3">
            {[
              ['UV and sunscreen', 'Know when shade, SPF, and a hat are sensible.'],
              ['Air quality', 'Spot days that may affect asthma, allergies, or harder exercise.'],
              ['Best time windows', 'Find better hours for walks, runs, cycling, or errands.'],
            ].map(([title, description]) => (
              <article className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5" key={title}>
                <h2 className="text-xl font-black text-slate-950">{title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </section>
        )}

        <footer className="pb-6 text-center text-sm text-slate-500">
          Weather, UV, and air quality data by{' '}
          <a className="font-semibold text-slate-700 underline" href="https://open-meteo.com/" rel="noreferrer" target="_blank">
            Open-Meteo
          </a>
          .
        </footer>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-white/70 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

export default App
