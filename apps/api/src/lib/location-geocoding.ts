interface OpenWeatherGeocodeEntry {
  name?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export interface ResolvedLocationMatch {
  displayName: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  stateCode: string | null;
  stateName: string | null;
  provider: 'openweather';
}

const US_STATE_NAME_BY_CODE: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

const CA_PROVINCE_NAME_BY_CODE: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

function mapStateName(
  countryCode: string | null,
  stateRaw: string | undefined
): { stateCode: string | null; stateName: string | null } {
  const state = stateRaw?.trim();
  if (!state) {
    return { stateCode: null, stateName: null };
  }

  const upper = state.toUpperCase();
  const byCode =
    countryCode === 'US'
      ? US_STATE_NAME_BY_CODE
      : countryCode === 'CA'
        ? CA_PROVINCE_NAME_BY_CODE
        : null;

  if (!byCode) {
    return {
      stateCode: upper.length <= 3 ? upper : null,
      stateName: state,
    };
  }

  if (byCode[upper]) {
    return { stateCode: upper, stateName: byCode[upper] };
  }

  const byName = Object.entries(byCode).find(
    ([, name]) => name.toLowerCase() === state.toLowerCase()
  );
  if (byName) {
    return { stateCode: byName[0], stateName: byName[1] };
  }

  return {
    stateCode: upper.length <= 3 ? upper : null,
    stateName: state,
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function ensureOpenWeatherApiKey(): string {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY is not configured');
  }

  return apiKey;
}

async function fetchOpenWeatherJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const apiKey = ensureOpenWeatherApiKey();
  params.set('appid', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const url = `https://api.openweathermap.org${path}?${params.toString()}`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `OpenWeather geocoding request failed (${response.status})${body ? `: ${body}` : ''}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function toResolvedMatch(entry: OpenWeatherGeocodeEntry): ResolvedLocationMatch | null {
  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) {
    return null;
  }

  const countryCode = entry.country?.trim().toUpperCase() || null;
  const mappedState = mapStateName(countryCode, entry.state);
  const locationName = entry.name?.trim();
  const displayName = [locationName, mappedState.stateName, countryCode]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(', ');

  return {
    displayName:
      displayName.length > 0 ? displayName : `${entry.lat?.toFixed(4)}, ${entry.lon?.toFixed(4)}`,
    latitude: roundCoordinate(entry.lat as number),
    longitude: roundCoordinate(entry.lon as number),
    countryCode,
    stateCode: mappedState.stateCode,
    stateName: mappedState.stateName,
    provider: 'openweather',
  };
}

export async function geocodeLocationAddress(
  address: string,
  limit = 5
): Promise<ResolvedLocationMatch[]> {
  const payload = await fetchOpenWeatherJson<OpenWeatherGeocodeEntry[]>(
    '/geo/1.0/direct',
    new URLSearchParams({
      q: address,
      limit: String(Math.max(1, Math.min(5, Math.trunc(limit)))),
    })
  );

  return payload.map(toResolvedMatch).filter((entry): entry is ResolvedLocationMatch => Boolean(entry));
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number
): Promise<ResolvedLocationMatch | null> {
  const payload = await fetchOpenWeatherJson<OpenWeatherGeocodeEntry[]>(
    '/geo/1.0/reverse',
    new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      limit: '1',
    })
  );

  const first = payload[0];
  if (!first) {
    return null;
  }

  return toResolvedMatch(first);
}
