/**
 * Helpers for the weather widget.
 *
 * Open-Meteo is used because it needs no API key and sends
 * `Access-Control-Allow-Origin: *`, so a page can read it directly — the same
 * property that makes the GitHub widget possible. No key means nothing to store
 * and nothing to leak.
 *
 * Like the GitHub widget, this is opt-in: nothing is fetched until a location is
 * chosen. The browser's geolocation API is deliberately not used — it raises a
 * permission prompt and hands over a precise position for something a city name
 * answers just as well.
 *
 * Only the coordinates of the chosen place leave the device, and only to ask
 * what the weather is there.
 */
const FORECAST_HOST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_HOST = 'https://geocoding-api.open-meteo.com/v1/search';

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'];

export const UNIT_SYMBOL = { celsius: '°C', fahrenheit: '°F' };

export function coerceTemperatureUnit(value) {
  return TEMPERATURE_UNITS.includes(value) ? value : 'celsius';
}

/** A place is only usable with real coordinates, so those are what validate it. */
export function coerceWeatherPlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  return {
    name,
    // Enough to tell two places of the same name apart, and no more.
    region: typeof raw.region === 'string' ? raw.region.trim() : '',
    country: typeof raw.country === 'string' ? raw.country.trim() : '',
    // Rounded to about 100 m: more precision than that is someone's street, and
    // the forecast is identical either way.
    latitude: Math.round(latitude * 1000) / 1000,
    longitude: Math.round(longitude * 1000) / 1000,
  };
}

export function geocodeUrl(query, count = 6) {
  const name = String(query ?? '').trim();
  return `${GEOCODE_HOST}?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`;
}

export function forecastUrl(place, unit = 'celsius') {
  const { latitude, longitude } = place;
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    // The forecast is for the place, so its own clock is the right one to read
    // the day boundary in — not the viewer's.
    timezone: 'auto',
    forecast_days: '1',
    temperature_unit: coerceTemperatureUnit(unit),
    wind_speed_unit: coerceTemperatureUnit(unit) === 'fahrenheit' ? 'mph' : 'kmh',
  });
  return `${FORECAST_HOST}?${params}`;
}

export function describePlace(place) {
  if (!place) return '';
  return [place.name, place.region, place.country].filter(Boolean).join(', ');
}

/** The geocoder's rows, reduced to what the picker needs. */
export function summariseGeocode(payload, limit = 6) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const places = [];
  for (const row of rows) {
    const place = coerceWeatherPlace({
      name: row?.name,
      region: row?.admin1,
      country: row?.country,
      latitude: row?.latitude,
      longitude: row?.longitude,
    });
    if (!place) continue;
    places.push({ ...place, id: `${place.latitude},${place.longitude}` });
    if (places.length >= limit) break;
  }
  return places;
}

/**
 * WMO weather codes, which is what Open-Meteo reports, mapped to a label and one
 * of the app's own icons.
 *
 * The codes are grouped rather than listed one by one: a 1×1 widget cannot show
 * the difference between "light drizzle" and "moderate drizzle", and pretending
 * otherwise only costs legibility. `night` names the icon to use after dark
 * where the daytime one would be a sun.
 */
const CONDITIONS = [
  { codes: [0], label: 'Clear', icon: 'sun', night: 'moon' },
  { codes: [1], label: 'Mainly clear', icon: 'cloudSun', night: 'cloud' },
  { codes: [2], label: 'Partly cloudy', icon: 'cloudSun', night: 'cloud' },
  { codes: [3], label: 'Overcast', icon: 'cloud' },
  { codes: [45, 48], label: 'Fog', icon: 'fog' },
  { codes: [51, 53, 55], label: 'Drizzle', icon: 'cloudRain' },
  { codes: [56, 57], label: 'Freezing drizzle', icon: 'cloudRain' },
  { codes: [61, 63, 65], label: 'Rain', icon: 'cloudRain' },
  { codes: [66, 67], label: 'Freezing rain', icon: 'cloudRain' },
  { codes: [71, 73, 75], label: 'Snow', icon: 'cloudSnow' },
  { codes: [77], label: 'Snow grains', icon: 'cloudSnow' },
  { codes: [80, 81, 82], label: 'Rain showers', icon: 'cloudRain' },
  { codes: [85, 86], label: 'Snow showers', icon: 'cloudSnow' },
  { codes: [95], label: 'Thunderstorm', icon: 'cloudLightning' },
  { codes: [96, 99], label: 'Thunderstorm with hail', icon: 'cloudLightning' },
];

const BY_CODE = new Map();
for (const condition of CONDITIONS) {
  for (const code of condition.codes) BY_CODE.set(code, condition);
}

/**
 * An unrecognised code gets a cloud and an honest label rather than being
 * silently drawn as clear weather — the one mistake here that would actually
 * mislead someone looking out of a window.
 */
export function describeCondition(code, isDay = true) {
  const condition = BY_CODE.get(Number(code));
  if (!condition) return { label: 'Unknown', icon: 'cloud', code: Number(code) };
  const icon = !isDay && condition.night ? condition.night : condition.icon;
  return { label: condition.label, icon, code: Number(code) };
}

/**
 * A reading, or null where there is none.
 *
 * `null` and `''` are checked before `Number`, because `Number(null)` is 0 and
 * `Number('')` is 0 — so a field the API explicitly sent as null would otherwise
 * become a confident zero degrees.
 */
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reduces a forecast response to what the widget shows.
 *
 * Returns `null` when the response carries no current temperature, so a partial
 * or changed payload shows as unavailable rather than as a blank reading or a
 * zero. A widget confidently displaying 0° for missing data is worse than one
 * admitting it does not know.
 */
export function summariseWeather(payload, unit = 'celsius') {
  const current = payload?.current;
  const temperature = finite(current?.temperature_2m);
  if (temperature === null) return null;

  const daily = payload?.daily ?? {};
  return {
    temperature,
    apparent: finite(current?.apparent_temperature),
    humidity: finite(current?.relative_humidity_2m),
    wind: finite(current?.wind_speed_10m),
    windUnit: coerceTemperatureUnit(unit) === 'fahrenheit' ? 'mph' : 'km/h',
    isDay: current?.is_day !== 0,
    high: finite(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null),
    low: finite(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null),
    unit: coerceTemperatureUnit(unit),
    symbol: UNIT_SYMBOL[coerceTemperatureUnit(unit)],
    observedAt: typeof current?.time === 'string' ? current.time : null,
    ...describeCondition(current?.weather_code, current?.is_day !== 0),
  };
}

/** Whole degrees: a 1×1 widget has no room for a decimal, and nobody needs one. */
export function formatTemperature(value, symbol = '°') {
  const reading = finite(value);
  if (reading === null) return '—';
  return `${Math.round(reading)}${symbol}`;
}

export function describeWeatherError(status) {
  if (status === 429) return 'Open-Meteo’s free limit is used up for now. It resets shortly.';
  if (status === 400) return 'Open-Meteo could not read that location.';
  if (status >= 500) return 'Open-Meteo is having trouble right now.';
  return `Open-Meteo returned ${status}.`;
}
