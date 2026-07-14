import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

type Status = 'good' | 'caution' | 'avoid'
type Sensitivity = 'normal' | 'burns-easily' | 'tattoos' | 'child' | 'outdoor-worker' | 'dog-walk'
type IconName = 'sun' | 'air' | 'temp' | 'feels' | 'weather' | 'shield' | 'check' | 'clock' | 'paw'

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
  actions: string[]
  bestWindows: HourPoint[]
  sunscreen: {
    title: string
    detail: string
    tattooNote: string
  }
  pet?: {
    title: string
    detail: string
    actions: string[]
  }
  peakUv: number
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
const savedSensitivityKey = 'outside-today:sensitivity'

const sensitivityOptions: Array<{ id: Sensitivity; label: string; help: string }> = [
  { id: 'normal', label: 'Normal', help: 'General outdoor advice' },
  { id: 'burns-easily', label: 'Burns easily', help: 'Earlier sunscreen prompts' },
  { id: 'tattoos', label: 'Has tattoos', help: 'Extra ink-fading protection' },
  { id: 'child', label: 'Child', help: 'More cautious sun guidance' },
  { id: 'outdoor-worker', label: 'Outdoor worker', help: 'Long exposure planning' },
  { id: 'dog-walk', label: 'Walking dog', help: 'Heat and paw safety' },
]

const dogSafetySources = [
  {
    label: 'RSPCA',
    url: 'https://www.rspca.org.uk/adviceandwelfare/seasonal/summer/dogs',
  },
  {
    label: 'The Kennel Club',
    url: 'https://www.royalkennelclub.com/health-and-dog-care/health-dog-care/health/health-and-care/a-z-of-health-and-care-issues/hot-pavements/',
  },
  {
    label: 'PetMD',
    url: 'https://www.petmd.com/dog/general-health/how-hot-is-too-hot-for-dogs',
  },
]

const sunSafetySources = {
  normal: [
    { label: 'EPA UV Index', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' },
    { label: 'AAD Sunscreen', url: 'https://www.aad.org/media/stats-sunscreen' },
  ],
  'burns-easily': [
    { label: 'EPA UV Index', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' },
    { label: 'AAD Sunscreen', url: 'https://www.aad.org/media/stats-sunscreen' },
  ],
  tattoos: [
    {
      label: 'AAD Tattoo Care',
      url: 'https://www.aad.org/public/everyday-care/skin-care-basics/tattoos/caring-for-tattooed-skin',
    },
    { label: 'AAD Sunscreen', url: 'https://www.aad.org/media/stats-sunscreen' },
  ],
  child: [
    {
      label: 'CDC Child Sun Safety',
      url: 'https://www.cdc.gov/early-care/communication-resources/outdoor-play-and-safety-for-children-in-ece.html',
    },
    { label: 'EPA UV Index', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' },
  ],
  'outdoor-worker': [
    {
      label: 'NIOSH Outdoor Workers',
      url: 'https://www.cdc.gov/niosh/outdoor-workers/about/sun-exposure.html',
    },
    { label: 'EPA UV Index', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' },
  ],
  'dog-walk': [
    { label: 'RSPCA Dog Heat Safety', url: 'https://www.rspca.org.uk/adviceandwelfare/seasonal/summer/dogs' },
    { label: 'EPA UV Index', url: 'https://www.epa.gov/sunsafety/uv-index-scale-0' },
  ],
} satisfies Record<Sensitivity, Array<{ label: string; url: string }>>

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
    hour12: true,
  })
}

function formatTemp(value: number) {
  return `${Math.round(value)}\u00B0C`
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

function getUvLevel(uv: number) {
  if (uv >= 11) {
    return 'Extreme'
  }

  if (uv >= 8) {
    return 'Very high'
  }

  if (uv >= 6) {
    return 'High'
  }

  if (uv >= 3) {
    return 'Moderate'
  }

  return 'Low'
}

function isSensitiveProfile(sensitivity: Sensitivity) {
  return !['normal', 'dog-walk'].includes(sensitivity)
}

function buildSunProfileNote(sensitivity: Sensitivity, uv: number) {
  if (sensitivity === 'normal') {
    return 'EPA recommends sun protection when UV is 3 or higher: shade, protective clothing, hat, sunglasses, and broad-spectrum sunscreen.'
  }

  if (sensitivity === 'burns-easily') {
    return 'If you burn easily, use a more cautious plan: shade, covered skin, sunglasses, and SPF 50 for longer daylight exposure.'
  }

  if (sensitivity === 'tattoos') {
    return 'AAD says UV light can fade tattoo ink. Protect healed tattoos with broad-spectrum, water-resistant SPF 30+ and keep fresh tattoos out of direct sun.'
  }

  if (sensitivity === 'child') {
    return uv >= 3
      ? 'CDC recommends shade, wide-brimmed hats, sunglasses, protective clothing, and SPF 15+ for children older than 6 months. Keep babies under 6 months out of direct sun.'
      : 'For children, keep shade, hats, sunglasses, and water in mind even when UV is low. Babies under 6 months should be kept out of direct sun.'
  }

  if (sensitivity === 'outdoor-worker') {
    return 'NIOSH recommends outdoor workers use broad-spectrum sunscreen, reapply at least every 2 hours, wear protective clothing, and schedule shade breaks where possible.'
  }

  return 'For dogs, RSPCA recommends pet-safe sunscreen on exposed skin such as ear tips and noses, especially for light-coloured fur. Ask your vet if unsure.'
}

function buildSunscreenAdvice(currentUv: number, peakUv: number, sensitivity: Sensitivity) {
  const uv = Math.max(currentUv, peakUv)
  const sensitive = isSensitiveProfile(sensitivity)
  const minimumSpf = sensitive ? 'SPF 50' : 'SPF 30+'
  const sunscreenNote = buildSunProfileNote(sensitivity, uv)

  if (sensitivity === 'dog-walk') {
    return {
      title: uv >= 3 ? 'Use shade and pet-safe sun protection' : 'Pet sunscreen usually optional',
      detail:
        uv >= 3
          ? `Peak UV is ${uv.toFixed(1)} today (${getUvLevel(uv)}). For dogs, focus on shade and cooler walk times; use pet-safe sunscreen on exposed skin only where appropriate.`
          : `Peak UV is low at ${uv.toFixed(1)}. Pet sunscreen is usually optional, but shade and surface checks still matter on bright or warm days.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 8) {
    return {
      title: 'Use SPF 50 and avoid peak sun',
      detail: `Peak UV is ${uv.toFixed(1)} today (${getUvLevel(uv)}). Use broad-spectrum SPF 50, seek shade, and reapply every 2 hours.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 6) {
    return {
      title: `Use ${sensitive ? 'SPF 50' : 'SPF 30 to 50'} today`,
      detail: `Peak UV is ${uv.toFixed(1)} today (${getUvLevel(uv)}). Sunscreen, sunglasses, and a hat are recommended if you are outside for more than a short trip.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 3) {
    return {
      title: 'Sunscreen recommended',
      detail: `Peak UV is ${uv.toFixed(1)} today (${getUvLevel(uv)}). Use broad-spectrum ${minimumSpf} on exposed skin, especially around midday.`,
      tattooNote: sunscreenNote,
    }
  }

  return {
    title: sensitive ? 'Consider sunscreen for longer trips' : 'Sunscreen usually optional',
    detail: `Peak UV is low at ${uv.toFixed(1)}. Sunscreen is usually optional for short trips, but still useful for long outdoor time or sensitive skin.`,
    tattooNote: sunscreenNote,
  }
}

function buildPetAdvice(conditions: Conditions) {
  const currentTemp = conditions.current.temperature
  const peakTemp = conditions.daily[0]?.tempMax ?? currentTemp
  const warmestRelevantTemp = Math.max(currentTemp, peakTemp)

  if (currentTemp >= 27) {
    return {
      title: 'Avoid a normal dog walk right now',
      detail: `${formatTemp(currentTemp)} is in the range where PetMD advises short walks only. Keep it to a quick toilet break, use shade or grass, and take water.`,
      actions: [
        'Avoid pavement unless it passes the hand test.',
        'Choose grass, shade, and a very short route.',
        'Do not run or cycle with your dog in the heat.',
        'Watch for heavy panting, drooling, weakness, vomiting, or collapse.',
      ],
    }
  }

  if (warmestRelevantTemp >= 27) {
    return {
      title: 'Walk now or choose a cooler window',
      detail: `Today may reach ${formatTemp(peakTemp)}. PetMD advises short walks only around 80°F / 27°C+, while RSPCA and The Kennel Club recommend early morning or late evening walks in hot weather.`,
      actions: [
        'Prefer early morning or late evening.',
        'Use the 5-7 second hand test before walking on pavement.',
        'Stick to grass and shaded routes where possible.',
        'Bring water and skip fetch or intense exercise.',
      ],
    }
  }

  if (warmestRelevantTemp >= 21) {
    return {
      title: 'Dog walk with heat caution',
      detail: `Temperatures above about 70°F / 21°C can increase heat risk for dogs, especially with humidity, according to PetMD. A gentle walk can be okay for many dogs, but keep it shaded and easy.`,
      actions: [
        'Keep the walk gentle and shorter than usual.',
        'Check pavement with the back of your hand first.',
        'Take water and watch for overheating signs.',
        'Be extra careful with puppies, seniors, flat-faced breeds, thick coats, or health conditions.',
      ],
    }
  }

  if (currentTemp <= 0) {
    return {
      title: 'Check cold comfort before walking',
      detail: `${formatTemp(currentTemp)} may be uncomfortable for some dogs depending on breed, coat, age, and health. Keep the walk short if your dog seems cold.`,
      actions: [
        'Consider a coat for small, short-haired, senior, or young dogs.',
        'Avoid icy surfaces that could hurt paws.',
        'Head home if your dog shivers, slows down, or lifts paws.',
      ],
    }
  }

  return {
    title: 'Good dog-walking conditions',
    detail: `${formatTemp(currentTemp)} looks comfortable for many dogs. Still check the ground surface and your dog’s age, breed, coat, and fitness.`,
    actions: [
      'Pick a comfortable route with access to shade or water.',
      'Use the pavement hand test on sunny days.',
      'Keep an eye on panting, pace, and paw comfort.',
    ],
  }
}

function isDaylightHour(time: string) {
  const hour = new Date(time).getHours()
  return hour >= 6 && hour <= 21
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

function buildAdvice(conditions: Conditions, sensitivity: Sensitivity): Advice {
  let riskScore = 0
  const reasons: string[] = []
  const actions: string[] = []
  const { current, hourly } = conditions
  const nextSixHours = hourly.slice(0, 6)
  const highestRainChance = Math.max(...nextSixHours.map((hour) => hour.rainChance), 0)
  const peakUv = conditions.daily[0]?.uvMax ?? current.uvIndex
  const sunscreen = buildSunscreenAdvice(current.uvIndex, peakUv, sensitivity)
  const pet = sensitivity === 'dog-walk' ? buildPetAdvice(conditions) : undefined
  const profileAddsSunRisk = ['burns-easily', 'child', 'outdoor-worker'].includes(sensitivity)

  if (current.uvIndex >= 8) {
    riskScore += 4
    reasons.push(`Right now UV is very high at ${current.uvIndex.toFixed(1)}. Avoid direct sun if you can.`)
    actions.push('Seek shade and avoid unnecessary direct sun right now.')
  } else if (current.uvIndex >= 6) {
    riskScore += 3
    reasons.push(`Right now UV is high at ${current.uvIndex.toFixed(1)}. Sunscreen, shade, and a hat are sensible.`)
    actions.push('Use sunscreen, sunglasses, and a hat if you go out now.')
  } else if (current.uvIndex >= 3) {
    riskScore += 2
    reasons.push(`Right now UV is moderate at ${current.uvIndex.toFixed(1)}. Sunscreen is recommended.`)
    actions.push('Use sunscreen on exposed skin before going out.')
  } else {
    reasons.push(`Right now UV is low at ${current.uvIndex.toFixed(1)}.`)
  }

  if (peakUv >= 3) {
    if (sensitivity === 'dog-walk') {
      actions.push('For your dog, prioritise cooler walk times, shade, grass, water, and pet-safe sunscreen only where appropriate.')
    } else if (sensitivity === 'outdoor-worker') {
      actions.push('Reapply sunscreen every 2 hours and use shade breaks, hat, sunglasses, and protective clothing.')
    } else if (sensitivity === 'child') {
      actions.push('Use shade, hat, sunglasses, protective clothing, water breaks, and sunscreen for children older than 6 months.')
    } else {
      actions.push(`${sunscreen.title} during daylight exposure.`)
    }
  }

  if (profileAddsSunRisk && peakUv >= 3) {
    riskScore += 1
    reasons.push('Your selected profile benefits from more cautious sun protection.')
  }

  if (pet) {
    actions.push(...pet.actions)

    if (conditions.current.temperature >= 27) {
      riskScore += 4
      reasons.push('Dog walking is heat-sensitive: keep outdoor time very short right now.')
    } else if ((conditions.daily[0]?.tempMax ?? conditions.current.temperature) >= 27) {
      riskScore += 3
      reasons.push('Today gets hot enough that dog walks should be timed carefully.')
    } else if (conditions.current.temperature >= 21) {
      riskScore += 2
      reasons.push('Warm weather can still increase heat risk for dogs, especially with humidity.')
    }
  }

  if (current.aqi === undefined) {
    reasons.push('Air quality data is unavailable for this location.')
  } else if (current.aqi >= 151) {
    riskScore += 4
    reasons.push(`Air quality is unhealthy with AQI ${Math.round(current.aqi)}.`)
    actions.push('Limit hard exercise outside until air quality improves.')
  } else if (current.aqi >= 101) {
    riskScore += 2
    reasons.push(`Air quality may bother sensitive people. AQI is ${Math.round(current.aqi)}.`)
    actions.push('Take it easier outside if you have asthma, allergies, or breathing sensitivity.')
  } else if (current.aqi >= 51) {
    riskScore += 1
    reasons.push(`Air quality is moderate with AQI ${Math.round(current.aqi)}.`)
  } else {
    reasons.push(`Air quality looks good with AQI ${Math.round(current.aqi)}.`)
  }

  if (current.feelsLike >= 32) {
    riskScore += 3
    reasons.push(`It feels hot at ${formatTemp(current.feelsLike)}. Hydrate and limit hard exercise.`)
    actions.push('Take water and avoid hard exercise during the hottest period.')
  } else if (current.feelsLike >= 28) {
    riskScore += 2
    reasons.push(`It feels warm at ${formatTemp(current.feelsLike)}. Take water if you are out long.`)
    actions.push('Take water if you are outside for more than a short trip.')
  } else if (current.feelsLike <= 0) {
    riskScore += 2
    reasons.push(`It feels freezing at ${formatTemp(current.feelsLike)}. Dress for cold exposure.`)
    actions.push('Wear warm layers and protect hands if you are outside long.')
  } else {
    reasons.push(`Temperature feels comfortable at ${formatTemp(current.feelsLike)}.`)
  }

  if (highestRainChance >= 70) {
    riskScore += 2
    reasons.push(`Rain chance reaches ${Math.round(highestRainChance)}% soon. Take waterproofs.`)
    actions.push('Take waterproofs or pick a drier time window.')
  } else if (highestRainChance >= 40) {
    riskScore += 1
    reasons.push(`Some rain is possible soon, up to ${Math.round(highestRainChance)}%.`)
  }

  if (current.wind >= 40) {
    riskScore += 2
    reasons.push(`Wind is strong at ${Math.round(current.wind)} km/h.`)
    actions.push('Avoid exposed routes if strong wind is a concern.')
  } else if (current.wind >= 25) {
    riskScore += 1
    reasons.push(`It is breezy at ${Math.round(current.wind)} km/h.`)
  }

  const bestWindows = hourly
    .filter(
      (hour) =>
        isDaylightHour(hour.time) &&
        hour.uvIndex < 6 &&
        hour.rainChance < 45 &&
        hour.wind < 30 &&
        hour.feelsLike > 2 &&
        hour.feelsLike < 30,
    )
    .slice(0, 4)

  if (actions.length === 0) {
    actions.push('Good for normal outdoor activity right now.')
  }

  const uniqueActions = Array.from(new Set(actions)).slice(0, sensitivity === 'dog-walk' ? 6 : 5)
  const hasLaterSunRisk = current.uvIndex < 3 && peakUv >= 3
  const petCaution = pet && ((conditions.daily[0]?.tempMax ?? conditions.current.temperature) >= 27 || conditions.current.temperature >= 21)

  if (riskScore >= 7) {
    return {
      status: 'avoid',
      title: pet ? 'Avoid a normal dog walk' : 'Avoid peak exposure',
      summary: pet
        ? 'Dog walking conditions are risky enough to keep outdoor time very short and carefully planned.'
        : 'Going outside is possible, but the conditions need planning.',
      reasons: reasons.slice(0, 5),
      actions: uniqueActions,
      bestWindows,
      sunscreen,
      pet,
      peakUv,
    }
  }

  if (riskScore >= 3) {
    return {
      status: 'caution',
      title: petCaution ? 'Dog walk needs careful timing' : hasLaterSunRisk ? 'Okay now, protect skin in daylight' : 'Go outside with caution',
      summary: petCaution
        ? 'Current conditions may feel fine for you, but dog walking needs cooler timing, surface checks, and a gentler plan.'
        : hasLaterSunRisk
          ? 'Current conditions are comfortable, but today still has enough UV to need sun protection.'
          : 'It is okay for many people, but a few conditions need attention.',
      reasons: reasons.slice(0, 5),
      actions: uniqueActions,
      bestWindows,
      sunscreen,
      pet,
      peakUv,
    }
  }

  return {
    status: 'good',
    title: hasLaterSunRisk ? 'Good right now, protect skin in daylight' : 'Good time to go outside',
    summary: hasLaterSunRisk
      ? 'Right now looks comfortable, while the daylight forecast still calls for sunscreen planning.'
      : 'Conditions look comfortable for normal outdoor activity.',
    reasons: reasons.slice(0, 5),
    actions: uniqueActions,
    bestWindows,
    sunscreen,
    pet,
    peakUv,
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

function readSavedSensitivity() {
  const saved = localStorage.getItem(savedSensitivityKey)
  return sensitivityOptions.some((option) => option.id === saved) ? (saved as Sensitivity) : 'normal'
}

function saveSensitivity(sensitivity: Sensitivity) {
  localStorage.setItem(savedSensitivityKey, sensitivity)
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
  const [sensitivity, setSensitivity] = useState<Sensitivity>(() => readSavedSensitivity())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const loadedSavedPlace = useRef(false)
  const resultRef = useRef<HTMLElement>(null)

  const advice = useMemo(() => (conditions ? buildAdvice(conditions, sensitivity) : undefined), [conditions, sensitivity])

  const loadConditions = useCallback(async (place: Place, options?: { scrollToResults?: boolean }) => {
    setLoading(true)
    setError('')
    setShareMessage('')

    try {
      const nextConditions = await fetchConditions(place)
      setConditions(nextConditions)
      setQuery(formatPlace(place))
      savePlace(place)

      if (options?.scrollToResults) {
        window.requestAnimationFrame(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
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

      await loadConditions(firstPlace, { scrollToResults: true })
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
      await loadConditions(
        {
          name: 'Current location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        { scrollToResults: true },
      )
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

  function handleSensitivityChange(nextSensitivity: Sensitivity) {
    setSensitivity(nextSensitivity)
    saveSensitivity(nextSensitivity)
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
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-700">Who is this for?</legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sensitivityOptions.map((option) => {
                    const selected = sensitivity === option.id

                    return (
                      <button
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-4 ring-emerald-100'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-200 hover:bg-white'
                        }`}
                        key={option.id}
                        type="button"
                        onClick={() => handleSensitivityChange(option.id)}
                      >
                        <span className="block text-sm font-black">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.help}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
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
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]" ref={resultRef}>
            <article className={`rounded-[2rem] border p-6 shadow-xl shadow-slate-900/5 ${statusStyles[advice.status]}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] opacity-70">
                    {formatPlace(conditions.place)}
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{advice.title}</h2>
                  <p className="mt-3 max-w-2xl text-lg leading-8 opacity-80">{advice.summary}</p>
                  <p className="mt-3 text-sm font-semibold opacity-70">
                    Right now: UV {conditions.current.uvIndex.toFixed(1)} ({getUvLevel(conditions.current.uvIndex)}) -
                    Today&apos;s peak UV: {advice.peakUv.toFixed(1)} ({getUvLevel(advice.peakUv)})
                  </p>
                </div>
                <span className={`rounded-full px-4 py-2 text-sm font-black uppercase ${statusBadges[advice.status]}`}>
                  {advice.status}
                </span>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric icon="sun" label="UV now" value={conditions.current.uvIndex.toFixed(1)} />
                <Metric icon="shield" label="Peak UV today" value={advice.peakUv.toFixed(1)} />
                <Metric icon="air" label="Air quality" value={conditions.current.aqi ? Math.round(conditions.current.aqi) : 'N/A'} />
                <Metric icon="temp" label="Temperature" value={formatTemp(conditions.current.temperature)} />
                <Metric icon="feels" label="Feels like" value={formatTemp(conditions.current.feelsLike)} />
                <Metric icon="weather" label="Weather" value={weatherSummary(conditions.current.weatherCode)} />
              </div>

              <div className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-950">
                <div className="flex items-center gap-3">
                  <Icon name="shield" className="h-8 w-8 text-orange-600" />
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Sunscreen advice</p>
                    <h3 className="mt-1 text-2xl font-black">{advice.sunscreen.title}</h3>
                  </div>
                </div>
                <p className="mt-4 leading-7">{advice.sunscreen.detail}</p>
                <UVScale value={advice.peakUv} />
                <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-6">{advice.sunscreen.tattooNote}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Sources</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sunSafetySources[sensitivity].map((source) => (
                    <a
                      className="rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-orange-800 underline-offset-4 hover:underline"
                      href={source.url}
                      key={source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.label}
                    </a>
                  ))}
                </div>
              </div>

              {advice.pet && (
                <div className="mt-8 rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sky-950">
                  <div className="flex items-center gap-3">
                    <Icon name="paw" className="h-8 w-8 text-sky-700" />
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-700">Dog walking advice</p>
                      <h3 className="mt-1 text-2xl font-black">{advice.pet.title}</h3>
                    </div>
                  </div>
                  <p className="mt-4 leading-7">{advice.pet.detail}</p>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {advice.pet.actions.map((action) => (
                      <li className="rounded-2xl bg-white/70 p-4 text-sm font-medium leading-6" key={action}>
                        {action}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Sources</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dogSafetySources.map((source) => (
                      <a
                        className="rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-sky-800 underline-offset-4 hover:underline"
                        href={source.url}
                        key={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 rounded-3xl bg-white/70 p-5">
                <div className="flex items-center gap-3">
                  <Icon name="check" className="h-7 w-7 text-emerald-700" />
                  <h3 className="text-lg font-black">What should I do?</h3>
                </div>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {advice.actions.map((action) => (
                    <li className="flex gap-3 rounded-2xl bg-white/70 p-4 text-sm font-medium leading-6" key={action}>
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <Icon name="check" className="h-3.5 w-3.5" />
                      </span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
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
                <h3 className="text-xl font-black text-slate-950">Best daylight windows</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Useful daytime options with lower UV, lighter wind, and lower rain chance.
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
                      No comfortable daylight window found in the next 18 hours. Check the forecast cards before making plans.
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
                        {formatTemp(day.tempMin)} to {formatTemp(day.tempMax)} - rain up to{' '}
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
              ['UV, SPF, and tattoos', 'Know when shade, sunscreen, and tattoo protection are sensible.'],
              ['Air quality', 'Spot days that may affect asthma, allergies, or harder exercise.'],
              ['Best daylight windows', 'Find better hours for walks, runs, cycling, or errands.'],
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

function Metric({ icon, label, value }: { icon: IconName; label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-white/70 p-4">
      <div className="flex items-center gap-3">
        <Icon name={icon} className="h-6 w-6 opacity-70" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  )
}

function UVScale({ value }: { value: number }) {
  const markerPosition = `${Math.min(100, Math.max(0, (value / 11) * 100))}%`

  return (
    <div className="mt-5 rounded-2xl bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black">UV scale</p>
        <p className="text-sm font-bold text-orange-700">
          {value.toFixed(1)} - {getUvLevel(value)}
        </p>
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 via-orange-400 to-rose-600">
        <span
          className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-slate-950 shadow"
          style={{ left: markerPosition }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
        <span>Low</span>
        <span>Moderate</span>
        <span>High</span>
        <span>Extreme</span>
      </div>
    </div>
  )
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const commonProps = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
  }

  if (name === 'sun') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
  }

  if (name === 'air') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M4 8h11a3 3 0 1 0-3-3M4 12h16M4 16h10a3 3 0 1 1-3 3" />
      </svg>
    )
  }

  if (name === 'temp') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M14 14.76V5a4 4 0 0 0-8 0v9.76a6 6 0 1 0 8 0Z" />
        <path d="M10 9v7" />
      </svg>
    )
  }

  if (name === 'feels') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z" />
      </svg>
    )
  }

  if (name === 'weather') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.3 8.2 4.5 4.5 0 0 0 7 18Z" />
      </svg>
    )
  }

  if (name === 'shield') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }

  if (name === 'paw') {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <circle cx="5.5" cy="10" r="2" />
        <circle cx="9" cy="6.5" r="2" />
        <circle cx="15" cy="6.5" r="2" />
        <circle cx="18.5" cy="10" r="2" />
        <path d="M8 16.5c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.7-1.3 3-3 3h-2c-1.7 0-3-1.3-3-3Z" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" {...commonProps}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

export default App
