import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

type Status = 'good' | 'caution' | 'avoid'
type Sensitivity = 'normal' | 'burns-easily' | 'tattoos' | 'child' | 'outdoor-worker' | 'dog-walk'
type ActivityMode = 'walking' | 'running' | 'cycling' | 'dog-walk' | 'gardening' | 'kids-outdoors'
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
  timezone: string
  relativeDay: 'today' | 'tomorrow' | 'later'
  isDaylight: boolean
  uvIndex: number
  rainChance: number
  feelsLike: number
  wind: number
}

type WindowRange = {
  start: string
  end: string
  label: string
  uvMax: number
  rainMax: number
  windMax: number
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
  timezone: string
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
  timezone?: string
  current?: {
    time?: number
    temperature_2m?: number
    apparent_temperature?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  hourly: {
    time: number[]
    uv_index: number[]
    precipitation_probability: number[]
    apparent_temperature: number[]
    wind_speed_10m: number[]
  }
  daily: {
    time: number[]
    sunrise: number[]
    sunset: number[]
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
const savedPlacesKey = 'outside-today:saved-places'
const savedSensitivityKey = 'outside-today:sensitivity'
const savedActivityKey = 'outside-today:activity'

const sensitivityOptions: Array<{ id: Sensitivity; label: string; help: string }> = [
  { id: 'normal', label: 'Normal', help: 'General outdoor advice' },
  { id: 'burns-easily', label: 'Burns easily', help: 'Earlier sunscreen prompts' },
  { id: 'tattoos', label: 'Has tattoos', help: 'Extra ink-fading protection' },
  { id: 'child', label: 'Child', help: 'More cautious sun guidance' },
  { id: 'outdoor-worker', label: 'Outdoor worker', help: 'Long exposure planning' },
  { id: 'dog-walk', label: 'Walking dog', help: 'Heat and paw safety' },
]

const activityOptions: Array<{ id: ActivityMode; label: string; help: string }> = [
  { id: 'walking', label: 'Walking', help: 'General outdoor comfort' },
  { id: 'running', label: 'Running', help: 'Stricter heat and air checks' },
  { id: 'cycling', label: 'Cycling', help: 'Wind, rain, and visibility matter' },
  { id: 'dog-walk', label: 'Dog walk', help: 'Paw and heat safety' },
  { id: 'gardening', label: 'Gardening', help: 'Longer sun exposure' },
  { id: 'kids-outdoors', label: 'Kids outdoors', help: 'More cautious UV planning' },
]

const activityPickerOptions = activityOptions.filter((option) => option.id !== 'dog-walk')

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

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function formatTimeLabel(value: string, timezone?: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })
}

function formatTemp(value: number) {
  return `${Math.round(value)}\u00B0C`
}

function formatDayLabel(value: string, timezone?: string) {
  return new Date(value).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  })
}

function formatDateKey(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
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

function getAqiLabel(aqi: number) {
  if (aqi >= 301) return 'Hazardous'
  if (aqi >= 201) return 'Very unhealthy'
  if (aqi >= 151) return 'Unhealthy'
  if (aqi >= 101) return 'Unhealthy for sensitive groups'
  if (aqi >= 51) return 'Moderate'
  return 'Good'
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

function buildSunscreenAdvice(
  currentUv: number,
  peakUv: number,
  sensitivity: Sensitivity,
  period: 'today' | 'tomorrow',
) {
  const uv = Math.max(currentUv, peakUv)
  const periodLabel = period === 'tomorrow' ? 'tomorrow' : 'today'
  const sensitive = isSensitiveProfile(sensitivity)
  const minimumSpf = sensitive ? 'SPF 50' : 'SPF 30+'
  const sunscreenNote = buildSunProfileNote(sensitivity, uv)

  if (sensitivity === 'dog-walk') {
    return {
      title: uv >= 3 ? 'Use shade and pet-safe sun protection' : 'Pet sunscreen usually optional',
      detail:
        uv >= 3
          ? `Peak UV is ${uv.toFixed(1)} ${periodLabel} (${getUvLevel(uv)}). For dogs, focus on shade and cooler walk times; use pet-safe sunscreen on exposed skin only where appropriate.`
          : `Peak UV is low at ${uv.toFixed(1)}. Pet sunscreen is usually optional, but shade and surface checks still matter on bright or warm days.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 8) {
    return {
      title: 'Use SPF 50 and avoid peak sun',
      detail: `Peak UV is ${uv.toFixed(1)} ${periodLabel} (${getUvLevel(uv)}). Use broad-spectrum SPF 50, seek shade, and reapply every 2 hours.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 6) {
    return {
      title: `Use ${sensitive ? 'SPF 50' : 'SPF 30 to 50'} ${periodLabel}`,
      detail: `Peak UV is ${uv.toFixed(1)} ${periodLabel} (${getUvLevel(uv)}). Sunscreen, sunglasses, and a hat are recommended if you are outside for more than a short trip.`,
      tattooNote: sunscreenNote,
    }
  }

  if (uv >= 3) {
    return {
      title: 'Sunscreen recommended',
      detail: `Peak UV is ${uv.toFixed(1)} ${periodLabel} (${getUvLevel(uv)}). Use broad-spectrum ${minimumSpf} on exposed skin, especially around midday.`,
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

function isUpcomingHour(time: string) {
  return new Date(time).getTime() >= Date.now() - 30 * 60 * 1000
}

function pickComfortableDaylightHours(
  hourly: HourPoint[],
  activityThresholds: { maxUv: number; maxRain: number; maxWind: number; minFeels: number; maxFeels: number },
) {
  const matches = (hour: HourPoint) =>
    hour.isDaylight &&
    isUpcomingHour(hour.time) &&
    hour.uvIndex < activityThresholds.maxUv &&
    hour.rainChance < activityThresholds.maxRain &&
    hour.wind < activityThresholds.maxWind &&
    hour.feelsLike > activityThresholds.minFeels &&
    hour.feelsLike < activityThresholds.maxFeels

  const todayHours = hourly.filter((hour) => hour.relativeDay === 'today' && matches(hour)).slice(0, 8)
  if (todayHours.length > 0) {
    return { hours: todayHours, scope: 'today' as const }
  }

  const tomorrowHours = hourly.filter((hour) => hour.relativeDay === 'tomorrow' && matches(hour)).slice(0, 8)
  if (tomorrowHours.length > 0) {
    return { hours: tomorrowHours, scope: 'tomorrow' as const }
  }

  return { hours: [], scope: 'none' as const }
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
      'sunrise',
      'sunset',
    ].join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '7',
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
  const timezone = forecast.timezone ?? 'UTC'
  const toIso = (timestamp: number) => new Date(timestamp * 1000).toISOString()
  const currentTimestamp = forecast.current?.time ?? Math.floor(Date.now() / 1000)
  let currentIndex = 0

  forecast.hourly.time.forEach((timestamp, index) => {
    if (timestamp <= currentTimestamp) {
      currentIndex = index
    }
  })

  const dailyDateInstants = forecast.daily.time.map((timestamp, index) =>
    toIso(forecast.daily.sunrise?.[index] ?? timestamp + 12 * 60 * 60),
  )
  const dailyDateKeys = dailyDateInstants.map((instant) => formatDateKey(instant, timezone))

  const hourly = forecast.hourly.time.map((timestamp, index) => {
    const time = toIso(timestamp)
    const dateKey = formatDateKey(time, timezone)
    const dayIndex = dailyDateKeys.indexOf(dateKey)
    const sunrise = forecast.daily.sunrise?.[dayIndex]
    const sunset = forecast.daily.sunset?.[dayIndex]

    return {
      time,
      label: formatTimeLabel(time, timezone),
      timezone,
      relativeDay:
        dateKey === dailyDateKeys[0] ? ('today' as const) : dateKey === dailyDateKeys[1] ? ('tomorrow' as const) : ('later' as const),
      isDaylight:
        typeof sunrise === 'number' && typeof sunset === 'number' && timestamp >= sunrise && timestamp < sunset,
      uvIndex: numberAt(forecast.hourly.uv_index, index),
      rainChance: numberAt(forecast.hourly.precipitation_probability, index),
      feelsLike: numberAt(forecast.hourly.apparent_temperature, index),
      wind: numberAt(forecast.hourly.wind_speed_10m, index),
    }
  })

  const daily = forecast.daily.time.map((_timestamp, index) => ({
    date: dailyDateKeys[index],
    label: formatDayLabel(dailyDateInstants[index], timezone),
    uvMax: numberAt(forecast.daily.uv_index_max, index),
    tempMax: numberAt(forecast.daily.temperature_2m_max, index),
    tempMin: numberAt(forecast.daily.temperature_2m_min, index),
    rainChance: numberAt(forecast.daily.precipitation_probability_max, index),
  }))

  return {
    place,
    timezone,
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
    hourly: hourly.slice(currentIndex, currentIndex + 36),
    daily,
  }
}

function getActivityThresholds(activity: ActivityMode) {
  if (activity === 'running') {
    return { maxUv: 5, maxRain: 35, maxWind: 24, minFeels: 3, maxFeels: 26 }
  }

  if (activity === 'cycling') {
    return { maxUv: 5.5, maxRain: 30, maxWind: 22, minFeels: 3, maxFeels: 28 }
  }

  if (activity === 'dog-walk') {
    return { maxUv: 4.5, maxRain: 35, maxWind: 24, minFeels: 1, maxFeels: 24 }
  }

  if (activity === 'gardening' || activity === 'kids-outdoors') {
    return { maxUv: 4, maxRain: 35, maxWind: 26, minFeels: 3, maxFeels: 27 }
  }

  return { maxUv: 6, maxRain: 45, maxWind: 30, minFeels: 2, maxFeels: 30 }
}

function getSunGuidanceKey(sensitivity: Sensitivity, activity: ActivityMode): Sensitivity {
  if (activity === 'dog-walk') {
    return 'dog-walk'
  }

  if (activity === 'kids-outdoors') {
    return 'child'
  }

  if (activity === 'gardening') {
    return sensitivity === 'burns-easily' || sensitivity === 'tattoos' ? sensitivity : 'outdoor-worker'
  }

  return sensitivity
}

function buildAdvice(conditions: Conditions, sensitivity: Sensitivity, activity: ActivityMode): Advice {
  let riskScore = 0
  const reasons: string[] = []
  const actions: string[] = []
  const { current, hourly } = conditions
  const activityThresholds = getActivityThresholds(activity)
  const nextSixHours = hourly.slice(0, 6)
  const highestRainChance = Math.max(...nextSixHours.map((hour) => hour.rainChance), 0)
  const hasDaylightLeft = hourly.some(
    (hour) => hour.relativeDay === 'today' && hour.isDaylight && isUpcomingHour(hour.time),
  )
  const planningPeriod = hasDaylightLeft ? 'today' : 'tomorrow'
  const peakUv = conditions.daily[hasDaylightLeft ? 0 : 1]?.uvMax ?? current.uvIndex
  const sunGuidanceKey = getSunGuidanceKey(sensitivity, activity)
  const sunscreen = buildSunscreenAdvice(current.uvIndex, peakUv, sunGuidanceKey, planningPeriod)
  const pet = sensitivity === 'dog-walk' || activity === 'dog-walk' ? buildPetAdvice(conditions) : undefined
  const profileAddsSunRisk =
    ['burns-easily', 'child', 'outdoor-worker'].includes(sensitivity) ||
    ['gardening', 'kids-outdoors'].includes(activity)

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

  if (peakUv >= 3 && sensitivity !== 'dog-walk' && activity !== 'dog-walk') {
    if (!hasDaylightLeft) {
      actions.push("Plan sunscreen, shade, and protective clothing for tomorrow's daylight.")
    } else if (sensitivity === 'outdoor-worker' || activity === 'gardening') {
      actions.push('Reapply sunscreen every 2 hours and use shade breaks, hat, sunglasses, and protective clothing.')
    } else if (sensitivity === 'child' || activity === 'kids-outdoors') {
      actions.push('Use shade, hat, sunglasses, protective clothing, water breaks, and sunscreen for children older than 6 months.')
    } else {
      actions.push(`${sunscreen.title} during daylight exposure.`)
    }
  }

  if (profileAddsSunRisk && peakUv >= 3 && hasDaylightLeft) {
    riskScore += 1
    reasons.push('Your selected profile benefits from more cautious sun protection.')
  }

  if (pet) {
    actions.push('See the dog walking advice below for heat, pavement, and timing tips.')

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

  if (activity === 'running' && (current.feelsLike >= 24 || current.aqi !== undefined && current.aqi >= 51)) {
    riskScore += 1
    actions.push('For running, keep the pace easier when heat or air quality is not ideal.')
    reasons.push('Running raises heat and breathing strain compared with a casual walk.')
  }

  if (activity === 'cycling' && (current.wind >= 20 || highestRainChance >= 30)) {
    riskScore += 1
    actions.push('For cycling, watch wind gusts, wet roads, and visibility before setting off.')
    reasons.push('Cycling is more sensitive to wind and wet conditions.')
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

  const bestWindowPick = pickComfortableDaylightHours(hourly, activityThresholds)
  const bestWindows = bestWindowPick.hours

  if (actions.length === 0) {
    actions.push('Good for normal outdoor activity right now.')
  }

  const uniqueActions = Array.from(new Set(actions)).slice(0, 5)
  const hasLaterSunRisk = hasDaylightLeft && current.uvIndex < 3 && peakUv >= 3
  const needsTomorrowSunPlan = !hasDaylightLeft && peakUv >= 3
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
    title: hasLaterSunRisk
      ? 'Good right now, protect skin in daylight'
      : needsTomorrowSunPlan
        ? 'Good for an evening outing'
        : 'Good time to go outside',
    summary: hasLaterSunRisk
      ? 'Right now looks comfortable, while the daylight forecast still calls for sunscreen planning.'
      : needsTomorrowSunPlan
        ? 'Current UV is low and conditions look comfortable. Sun protection will matter again tomorrow.'
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

function readSavedPlaces() {
  try {
    const saved = localStorage.getItem(savedPlacesKey)
    return saved ? (JSON.parse(saved) as Place[]) : []
  } catch {
    return []
  }
}

function savePlaces(places: Place[]) {
  localStorage.setItem(savedPlacesKey, JSON.stringify(places.slice(0, 6)))
}

function readSavedSensitivity() {
  const saved = localStorage.getItem(savedSensitivityKey)
  return sensitivityOptions.some((option) => option.id === saved) ? (saved as Sensitivity) : 'normal'
}

function saveSensitivity(sensitivity: Sensitivity) {
  localStorage.setItem(savedSensitivityKey, sensitivity)
}

function readSavedActivity() {
  const saved = localStorage.getItem(savedActivityKey)
  if (saved === 'dog-walk') {
    return 'walking'
  }

  return activityPickerOptions.some((option) => option.id === saved) ? (saved as ActivityMode) : 'walking'
}

function pickBestOutdoorDay(days: DayPoint[], startIndex = 0) {
  const eligibleDays = days.slice(startIndex)

  if (eligibleDays.length === 0) {
    return undefined
  }

  return [...eligibleDays].sort((a, b) => {
    const score = (day: DayPoint) => day.uvMax * 1.2 + day.rainChance * 0.08 + Math.max(0, day.tempMax - 28) * 2
    return score(a) - score(b)
  })[0]
}

function saveActivity(activity: ActivityMode) {
  localStorage.setItem(savedActivityKey, activity)
}

function samePlace(a: Place, b: Place) {
  return Math.abs(a.latitude - b.latitude) < 0.001 && Math.abs(a.longitude - b.longitude) < 0.001
}

function buildShareUrl(place: Place, sensitivity: Sensitivity, activity: ActivityMode) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('lat', String(place.latitude))
  url.searchParams.set('lon', String(place.longitude))
  url.searchParams.set('place', place.name)
  if (place.admin1) url.searchParams.set('region', place.admin1)
  if (place.country) url.searchParams.set('country', place.country)
  url.searchParams.set('profile', sensitivity)
  url.searchParams.set('activity', activity === 'dog-walk' ? 'walking' : activity)
  return url.toString()
}

function readSharedState() {
  const params = new URLSearchParams(window.location.search)
  const latitude = Number(params.get('lat'))
  const longitude = Number(params.get('lon'))
  const name = params.get('place')

  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined
  }

  const profile = params.get('profile')
  const sharedActivity = params.get('activity')
  const sensitivity = sensitivityOptions.some((option) => option.id === profile)
    ? (profile as Sensitivity)
    : 'normal'
  const activity = activityPickerOptions.some((option) => option.id === sharedActivity)
    ? (sharedActivity as ActivityMode)
    : 'walking'

  return {
    place: {
      name,
      latitude,
      longitude,
      admin1: params.get('region') || undefined,
      country: params.get('country') || undefined,
    },
    sensitivity,
    activity,
  }
}

function groupWindows(hours: HourPoint[]): WindowRange[] {
  const ranges: WindowRange[] = []
  let current: HourPoint[] = []

  for (const hour of hours) {
    const previous = current.at(-1)
    const isSequential =
      previous && new Date(hour.time).getTime() - new Date(previous.time).getTime() <= 90 * 60 * 1000

    if (current.length > 0 && !isSequential) {
      ranges.push(toWindowRange(current))
      current = []
    }

    current.push(hour)
  }

  if (current.length > 0) {
    ranges.push(toWindowRange(current))
  }

  return ranges.slice(0, 3)
}

function toWindowRange(hours: HourPoint[]): WindowRange {
  const first = hours[0]
  const last = hours[hours.length - 1]
  const end = new Date(last.time)
  end.setHours(end.getHours() + 1)
  const endTime = end.toISOString()
  const dayPrefix =
    first.relativeDay === 'tomorrow'
      ? 'Tomorrow '
      : first.relativeDay === 'today'
        ? ''
        : `${new Date(first.time).toLocaleDateString([], { weekday: 'short', timeZone: first.timezone })} `

  return {
    start: first.time,
    end: endTime,
    label: `${dayPrefix}${formatTimeLabel(first.time, first.timezone)}-${formatTimeLabel(endTime, first.timezone)}`,
    uvMax: Math.max(...hours.map((hour) => hour.uvIndex)),
    rainMax: Math.max(...hours.map((hour) => hour.rainChance)),
    windMax: Math.max(...hours.map((hour) => hour.wind)),
  }
}

function buildDailySummary(place: Place, advice: Advice, conditions: Conditions, activity: ActivityMode) {
  const activityLabel = activityOptions.find((option) => option.id === activity)?.label.toLowerCase() ?? 'outdoor plans'
  const firstWindow = groupWindows(advice.bestWindows)[0]
  const planningTomorrow = !conditions.hourly.some(
    (hour) => hour.relativeDay === 'today' && hour.isDaylight && isUpcomingHour(hour.time),
  )
  const forecastDayIndex = planningTomorrow ? 1 : 0
  const forecastPeriod = planningTomorrow ? "Tomorrow's" : "Today's"
  const windowText = firstWindow
    ? ` Best window: ${firstWindow.label}.`
    : ' No easy low-risk daylight window found soon.'

  return `${formatPlace(place)}: ${advice.title}. ${forecastPeriod} peak UV ${advice.peakUv.toFixed(1)}, high ${formatTemp(
    conditions.daily[forecastDayIndex]?.tempMax ?? conditions.current.temperature,
  )}. ${activityLabel}: ${advice.status}.${windowText}`
}

function buildShareText(
  place: Place,
  advice: Advice,
  conditions: Conditions,
  sensitivity: Sensitivity,
  activity: ActivityMode,
) {
  const summary = buildDailySummary(place, advice, conditions, activity)
  const topActions = advice.actions.slice(0, 3).map((action) => `• ${action}`).join('\n')
  const petLine = advice.pet ? `\nDog tip: ${advice.pet.title}.` : ''

  return [
    `Outside Today check`,
    summary,
    `${advice.sunscreen.title}: ${advice.sunscreen.detail}`,
    topActions,
    petLine.trim(),
    `Open this check: ${buildShareUrl(place, sensitivity, activity)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
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
  const [searchResults, setSearchResults] = useState<Place[]>([])
  const [conditions, setConditions] = useState<Conditions>()
  const [sensitivity, setSensitivity] = useState<Sensitivity>(() => readSavedSensitivity())
  const [activity, setActivity] = useState<ActivityMode>(() => readSavedActivity())
  const [savedPlaces, setSavedPlaces] = useState<Place[]>(() => readSavedPlaces())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [showPreferences, setShowPreferences] = useState(false)
  const [showReasons, setShowReasons] = useState(false)
  const loadedSavedPlace = useRef(false)
  const resultRef = useRef<HTMLElement>(null)

  const effectiveActivity = sensitivity === 'dog-walk' ? 'dog-walk' : activity === 'dog-walk' ? 'walking' : activity
  const advice = useMemo(
    () => (conditions ? buildAdvice(conditions, sensitivity, effectiveActivity) : undefined),
    [conditions, effectiveActivity, sensitivity],
  )
  const bestWindowRanges = useMemo(() => (advice ? groupWindows(advice.bestWindows) : []), [advice])
  const bestWindowsAreTomorrow = advice?.bestWindows[0]?.relativeDay === 'tomorrow'
  const planningForTomorrow = Boolean(
    conditions &&
      !conditions.hourly.some(
        (hour) => hour.relativeDay === 'today' && hour.isDaylight && isUpcomingHour(hour.time),
      ),
  )
  const dailySummary = useMemo(
    () => (conditions && advice ? buildDailySummary(conditions.place, advice, conditions, effectiveActivity) : ''),
    [advice, conditions, effectiveActivity],
  )
  const sunGuidanceKey = getSunGuidanceKey(sensitivity, effectiveActivity)
  const isCurrentPlaceSaved = Boolean(conditions && savedPlaces.some((place) => samePlace(place, conditions.place)))
  const bestOutdoorDay = useMemo(
    () => (conditions ? pickBestOutdoorDay(conditions.daily, planningForTomorrow ? 1 : 0) : undefined),
    [conditions, planningForTomorrow],
  )
  const activityLabel =
    activityOptions.find((option) => option.id === effectiveActivity)?.label.toLowerCase() ?? 'outdoor plans'

  const loadConditions = useCallback(async (place: Place, options?: { scrollToResults?: boolean; preserveUrl?: boolean }) => {
    setLoading(true)
    setError('')
    setShareMessage('')

    try {
      const nextConditions = await fetchConditions(place)
      setConditions(nextConditions)
      setQuery(formatPlace(place))
      setSearchResults([])
      savePlace(place)

      if (!options?.preserveUrl && window.location.search) {
        window.history.replaceState({}, '', window.location.pathname)
      }

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
    const sharedState = readSharedState()

    if (sharedState) {
      setSensitivity(sharedState.sensitivity)
      setActivity(sharedState.activity)
      saveSensitivity(sharedState.sensitivity)
      saveActivity(sharedState.activity)
      void loadConditions(sharedState.place, { preserveUrl: true })
      return
    }

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
      const trimmedQuery = query.trim()

      if (conditions && normalizeSearchText(trimmedQuery) === normalizeSearchText(formatPlace(conditions.place))) {
        await loadConditions(conditions.place, { scrollToResults: true })
        return
      }

      const places = await searchPlaces(trimmedQuery)

      if (places.length === 0) {
        throw new Error('No matching places found. Try a nearby town or city.')
      }

      if (places.length === 1) {
        await loadConditions(places[0], { scrollToResults: true })
      } else {
        setSearchResults(places)
        setLoading(false)
      }
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

    const message = buildShareText(conditions.place, advice, conditions, sensitivity, effectiveActivity)

    try {
      // Pass text only (URL is inside the message). A separate `url` field makes
      // many apps drop the summary and share just the link.
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Outside Today',
          text: message,
        })
        setShareMessage("Shared today's outdoor check.")
        return
      }

      await navigator.clipboard.writeText(message)
      setShareMessage("Copied today's full outdoor check to your clipboard.")
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        setShareMessage('Sharing was cancelled.')
        return
      }

      try {
        await navigator.clipboard.writeText(message)
        setShareMessage("Copied today's full outdoor check to your clipboard.")
      } catch {
        setShareMessage('Could not share right now. Try copying the daily summary card instead.')
      }
    }
  }

  function handleSensitivityChange(nextSensitivity: Sensitivity) {
    setError('')
    setShareMessage('')
    setSensitivity(nextSensitivity)
    saveSensitivity(nextSensitivity)

    if (conditions && window.location.search) {
      window.history.replaceState(
        {},
        '',
        buildShareUrl(conditions.place, nextSensitivity, nextSensitivity === 'dog-walk' ? 'walking' : activity),
      )
    }

    if (nextSensitivity === 'dog-walk') {
      setActivity('walking')
      saveActivity('walking')
    }
  }

  function handleActivityChange(nextActivity: ActivityMode) {
    setError('')
    setShareMessage('')
    const safeActivity = nextActivity === 'dog-walk' ? 'walking' : nextActivity
    setActivity(safeActivity)
    saveActivity(safeActivity)

    if (conditions && window.location.search) {
      const nextSensitivity = sensitivity === 'dog-walk' ? 'normal' : sensitivity
      window.history.replaceState({}, '', buildShareUrl(conditions.place, nextSensitivity, safeActivity))
    }

    if (sensitivity === 'dog-walk') {
      setSensitivity('normal')
      saveSensitivity('normal')
    }
  }

  function handleSaveCurrentPlace() {
    if (!conditions) {
      return
    }

    if (isCurrentPlaceSaved) {
      handleRemoveSavedPlace(conditions.place)
      return
    }

    const nextPlaces = [conditions.place, ...savedPlaces.filter((place) => !samePlace(place, conditions.place))].slice(0, 6)
    setSavedPlaces(nextPlaces)
    savePlaces(nextPlaces)
  }

  function handleRemoveSavedPlace(placeToRemove: Place) {
    const nextPlaces = savedPlaces.filter((place) => !samePlace(place, placeToRemove))
    setSavedPlaces(nextPlaces)
    savePlaces(nextPlaces)
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
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setSearchResults([])
                  }}
                />
                <button
                  className="min-h-12 rounded-2xl bg-slate-950 px-5 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  Check
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-2" role="list" aria-label="Matching places">
                  <p className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Choose a place
                  </p>
                  {searchResults.map((place) => (
                    <button
                      className="min-h-12 w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-emerald-50 focus:bg-emerald-50"
                      key={`${place.latitude}-${place.longitude}`}
                      type="button"
                      onClick={() => void loadConditions(place, { scrollToResults: true })}
                    >
                      <span className="block font-bold text-slate-900">{place.name}</span>
                      <span className="block text-xs text-slate-500">
                        {[place.admin1, place.country].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                className="mt-3 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
                type="button"
                onClick={handleUseLocation}
              >
                Use my current location
              </button>
              {savedPlaces.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Saved locations</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {savedPlaces.map((place) => (
                      <span
                        className="inline-flex min-h-11 items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700"
                        key={`${place.latitude}-${place.longitude}`}
                      >
                        <button
                          className="min-h-11 px-3 hover:bg-emerald-50 hover:text-emerald-700"
                          type="button"
                          onClick={() => void loadConditions(place, { scrollToResults: true })}
                        >
                          {place.name}
                        </button>
                        <button
                          aria-label={`Remove ${formatPlace(place)}`}
                          className="min-h-11 min-w-11 border-l border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          type="button"
                          onClick={() => handleRemoveSavedPlace(place)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button
                aria-expanded={showPreferences}
                className="mt-4 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-white"
                type="button"
                onClick={() => setShowPreferences((open) => !open)}
              >
                <span>
                  <span className="block text-sm font-bold text-slate-800">Customise advice</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {sensitivityOptions.find((option) => option.id === sensitivity)?.label}
                    {sensitivity === 'dog-walk' ? '' : ` · ${activityOptions.find((option) => option.id === activity)?.label}`}
                  </span>
                </span>
                <span className="text-sm font-bold text-slate-500">{showPreferences ? 'Hide' : 'Show'}</span>
              </button>
              {showPreferences && (
                <div className="mt-3 space-y-4">
                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-700">Who is this for?</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {sensitivityOptions.map((option) => {
                        const selected = sensitivity === option.id

                        return (
                          <button
                            className={`min-h-12 rounded-2xl border px-3 py-2 text-left transition ${
                              selected
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-4 ring-emerald-100'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-200 hover:bg-white'
                            }`}
                            key={option.id}
                            type="button"
                            onClick={() => handleSensitivityChange(option.id)}
                          >
                            <span className="block text-sm font-black">{option.label}</span>
                            <span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{option.help}</span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                  {sensitivity === 'dog-walk' ? (
                    <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                      Dog walking mode is on. Advice prioritises heat, pavement, and short outdoor windows for pets.
                    </p>
                  ) : (
                    <fieldset>
                      <legend className="text-sm font-semibold text-slate-700">What are you planning?</legend>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {activityPickerOptions.map((option) => {
                          const selected = activity === option.id

                          return (
                            <button
                              className={`min-h-12 rounded-2xl border px-3 py-2 text-left transition ${
                                selected
                                  ? 'border-sky-500 bg-sky-50 text-sky-950 ring-4 ring-sky-100'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-200 hover:bg-white'
                              }`}
                              key={option.id}
                              type="button"
                              onClick={() => handleActivityChange(option.id)}
                            >
                              <span className="block text-sm font-black">{option.label}</span>
                              <span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{option.help}</span>
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
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
                    {planningForTomorrow ? " Tomorrow's" : " Today's"} peak UV: {advice.peakUv.toFixed(1)} ({getUvLevel(advice.peakUv)})
                  </p>
                </div>
                <span className={`rounded-full px-4 py-2 text-sm font-black uppercase ${statusBadges[advice.status]}`}>
                  {advice.status}
                </span>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric icon="sun" label="UV now" value={conditions.current.uvIndex.toFixed(1)} />
                <Metric icon="shield" label={planningForTomorrow ? 'Peak UV tomorrow' : 'Peak UV today'} value={advice.peakUv.toFixed(1)} />
                <Metric
                  icon="air"
                  label="Air quality"
                  value={
                    conditions.current.aqi === undefined
                      ? 'N/A'
                      : `${Math.round(conditions.current.aqi)} · ${getAqiLabel(conditions.current.aqi)}`
                  }
                />
                <Metric icon="temp" label="Temperature" value={formatTemp(conditions.current.temperature)} />
                <Metric icon="feels" label="Feels like" value={formatTemp(conditions.current.feelsLike)} />
                <Metric icon="weather" label="Weather" value={weatherSummary(conditions.current.weatherCode)} />
              </div>

              <div className="mt-8 rounded-3xl border border-emerald-200 bg-white/80 p-5 text-slate-950">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Daily summary card</p>
                    <p className="mt-2 text-xl font-black leading-8">{dailySummary}</p>
                  </div>
                  <button
                    className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                      isCurrentPlaceSaved
                        ? 'border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                    type="button"
                    onClick={handleSaveCurrentPlace}
                  >
                    {isCurrentPlaceSaved ? 'Saved · tap to remove' : 'Save location'}
                  </button>
                </div>
              </div>

              <details
                className="group mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-950"
                open={!planningForTomorrow}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                  <Icon name="shield" className="h-8 w-8 text-orange-600" />
                  <span>
                    <span className="block text-sm font-bold uppercase tracking-[0.2em] text-orange-700">
                      {planningForTomorrow ? 'Plan for tomorrow' : 'Sunscreen advice'}
                    </span>
                    <h3 className="mt-1 text-2xl font-black">{advice.sunscreen.title}</h3>
                  </span>
                  </span>
                  <span className="text-sm font-bold text-orange-700 group-open:hidden">Show</span>
                  <span className="hidden text-sm font-bold text-orange-700 group-open:inline">Hide</span>
                </summary>
                <p className="mt-4 leading-7">{advice.sunscreen.detail}</p>
                <UVScale value={advice.peakUv} />
                <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-6">{advice.sunscreen.tattooNote}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">Sources</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sunSafetySources[sunGuidanceKey].map((source) => (
                    <a
                      className="inline-flex min-h-11 items-center rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-orange-800 underline-offset-4 hover:underline"
                      href={source.url}
                      key={source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.label}
                    </a>
                  ))}
                </div>
              </details>

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
                        className="inline-flex min-h-11 items-center rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-sky-800 underline-offset-4 hover:underline"
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
                <button
                  aria-expanded={showReasons}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  type="button"
                  onClick={() => setShowReasons((open) => !open)}
                >
                  <h3 className="text-lg font-black">Why this recommendation?</h3>
                  <span className="text-sm font-bold opacity-70">{showReasons ? 'Hide' : 'Show'}</span>
                </button>
                {showReasons && (
                  <ul className="mt-4 space-y-3">
                    {advice.reasons.map((reason) => (
                      <li className="flex gap-3 text-sm leading-6" key={reason}>
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
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
                <h3 className="text-xl font-black text-slate-950">
                  {bestWindowsAreTomorrow ? "Tomorrow's best windows" : 'Best daylight windows'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {bestWindowsAreTomorrow
                    ? planningForTomorrow
                      ? `Daylight is done for today. Here are comfortable ranges tomorrow for ${activityLabel}.`
                      : `No comfortable window remains today. Here are better ranges tomorrow for ${activityLabel}.`
                    : `Upcoming daytime ranges tuned for ${activityLabel}.`}
                </p>
                <div className="mt-5 grid gap-3">
                  {bestWindowRanges.length > 0 ? (
                    bestWindowRanges.map((range) => (
                      <div className="rounded-2xl bg-slate-50 p-4" key={range.start}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-slate-950">{range.label}</p>
                          <p className="text-sm font-semibold text-emerald-700">
                            {bestWindowsAreTomorrow ? 'Tomorrow' : 'Best range'}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          UV up to {range.uvMax.toFixed(1)} - rain up to {Math.round(range.rainMax)}% - wind up to{' '}
                          {Math.round(range.windMax)} km/h
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      No comfortable daylight window found soon. Check the 7-day outlook before making plans.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-900/5">
                <HourlyTimeline hours={conditions.hourly} />
              </section>

              <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-900/5">
                <h3 className="text-xl font-black text-slate-950">7-day outlook</h3>
                <div className="mt-5 grid gap-3">
                  {conditions.daily.map((day) => {
                    const isBestDay = bestOutdoorDay?.date === day.date

                    return (
                      <div
                        className={`rounded-2xl border p-4 ${
                          isBestDay ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-white'
                        }`}
                        key={day.date}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-slate-950">{day.label}</p>
                          {isBestDay ? (
                            <p className="text-sm font-semibold text-emerald-700">Best outdoor day</p>
                          ) : (
                            <p className="text-sm font-semibold text-slate-500">UV max {day.uvMax.toFixed(1)}</p>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {formatTemp(day.tempMin)} to {formatTemp(day.tempMax)} - rain up to{' '}
                          {Math.round(day.rainChance)}%
                          {isBestDay ? ` · UV max ${day.uvMax.toFixed(1)}` : ''}
                        </p>
                      </div>
                    )
                  })}
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
          <a className="inline-flex min-h-11 items-center font-semibold text-slate-700 underline" href="https://open-meteo.com/" rel="noreferrer" target="_blank">
            Open-Meteo
          </a>
          .
        </footer>
      </div>
    </main>
  )
}

function HourlyTimeline({ hours }: { hours: HourPoint[] }) {
  const [showAll, setShowAll] = useState(false)
  const todayHours = hours
    .filter((hour) => hour.isDaylight && hour.relativeDay === 'today' && isUpcomingHour(hour.time))
    .slice(0, 8)
  const tomorrowHours =
    todayHours.length === 0
      ? hours.filter((hour) => hour.isDaylight && hour.relativeDay === 'tomorrow').slice(0, 8)
      : []
  const upcomingHours = todayHours.length > 0 ? todayHours : tomorrowHours
  const visibleHours = showAll ? upcomingHours : upcomingHours.slice(0, 4)
  const showingTomorrow = todayHours.length === 0 && tomorrowHours.length > 0

  return (
    <>
      <h3 className="text-xl font-black text-slate-950">{showingTomorrow ? "Tomorrow timeline" : 'Today timeline'}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {showingTomorrow ? "Daylight is over for today. Preview of tomorrow's hours." : 'Quick view of the next daylight hours.'}
      </p>
      {upcomingHours.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No daylight hours left to chart soon.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {visibleHours.map((hour) => {
            const uvWidth = `${Math.min(100, (hour.uvIndex / 11) * 100)}%`
            const rainWidth = `${Math.min(100, hour.rainChance)}%`

            return (
              <div className="rounded-2xl bg-slate-50 px-4 py-3" key={hour.time}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{hour.label}</p>
                  <p className="text-sm font-semibold text-slate-500">{formatTemp(hour.feelsLike)}</p>
                </div>
                <TimelineBar color="bg-orange-400" label={`UV ${hour.uvIndex.toFixed(1)}`} width={uvWidth} />
                <TimelineBar color="bg-sky-400" label={`Rain ${Math.round(hour.rainChance)}%`} width={rainWidth} />
              </div>
            )
          })}
          {upcomingHours.length > 4 && (
            <button
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              type="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Show fewer hours' : `Show ${upcomingHours.length - 4} more hours`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

function TimelineBar({ color, label, width }: { color: string; label: string; width: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
        <span>{label}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${color}`} style={{ width }} />
      </div>
    </div>
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
