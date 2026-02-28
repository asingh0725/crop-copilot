import type { Pool } from 'pg';
import type { PremiumProcessingInput, SprayWindow } from './types';
import { reserveOpenWeatherCall } from './weather-metering';

interface OpenWeatherForecastEntry {
  dt: number;
  main?: {
    temp?: number;
  };
  wind?: {
    speed?: number;
  };
  rain?: {
    ['3h']?: number;
  };
}

interface OpenWeatherForecastResponse {
  list?: OpenWeatherForecastEntry[];
}

interface NwsPointResponse {
  properties?: {
    forecastHourly?: string;
  };
}

interface NwsHourlyPeriod {
  startTime: string;
  endTime: string;
  temperature: number;
  windSpeed: string;
  shortForecast?: string;
}

interface NwsHourlyResponse {
  properties?: {
    periods?: NwsHourlyPeriod[];
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildScore(tempC: number, windMps: number, rainMm: number): number {
  let score = 100;

  if (tempC < 4 || tempC > 32) {
    score -= 30;
  } else if (tempC < 8 || tempC > 28) {
    score -= 12;
  }

  if (windMps > 8) {
    score -= 35;
  } else if (windMps > 5) {
    score -= 15;
  }

  if (rainMm > 2) {
    score -= 30;
  } else if (rainMm > 0.5) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreSummary(score: number): string {
  if (score >= 85) {
    return 'Strong spray window (low rain and wind risk).';
  }

  if (score >= 70) {
    return 'Good spray window with manageable weather risk.';
  }

  if (score >= 55) {
    return 'Marginal spray window; verify local conditions before application.';
  }

  return 'High weather risk for spray activities.';
}

function isLikelyUSLocation(location: string | null): boolean {
  if (!location) {
    return false;
  }

  const normalized = location.toLowerCase();
  return normalized.includes('us') || normalized.includes('united states');
}

function extractMaxWindMps(raw: string): number {
  const values = raw
    .split(' ')
    .map((part) => Number(part.replace(/[^0-9.]/g, '')))
    .filter((part) => Number.isFinite(part));

  if (values.length === 0) {
    return 0;
  }

  const mph = Math.max(...values);
  return round(mph * 0.44704);
}

function dedupeTopWindows(windows: SprayWindow[], limit = 3): SprayWindow[] {
  const sorted = [...windows].sort((a, b) => b.score - a.score);
  return sorted.slice(0, limit);
}

function fallbackWindows(now = new Date()): SprayWindow[] {
  const windows: SprayWindow[] = [];

  for (let day = 1; day <= 3; day += 1) {
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() + day);
    start.setUTCHours(11, 0, 0, 0);

    const end = new Date(start);
    end.setUTCHours(14, 0, 0, 0);

    windows.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      score: 60 - day,
      summary: 'Fallback window generated without live forecast data.',
      source: 'fallback',
    });
  }

  return windows;
}

async function fetchOpenWeatherWindows(
  lat: number,
  lon: number,
  apiKey: string
): Promise<SprayWindow[]> {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`OpenWeather request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OpenWeatherForecastResponse;
  const entries = payload.list ?? [];
  if (entries.length === 0) {
    return [];
  }

  const windows = entries.slice(0, 24).map((entry) => {
    const startsAt = new Date(entry.dt * 1000);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const tempC = entry.main?.temp ?? 20;
    const windMps = entry.wind?.speed ?? 0;
    const rainMm = entry.rain?.['3h'] ?? 0;
    const score = buildScore(tempC, windMps, rainMm);

    return {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      score,
      summary: scoreSummary(score),
      source: 'openweather' as const,
    };
  });

  return dedupeTopWindows(windows.filter((window) => window.score >= 55));
}

async function fetchNwsWindows(lat: number, lon: number): Promise<SprayWindow[]> {
  const pointResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': 'crop-copilot/1.0 (support@cropcopilot.app)',
    },
  });

  if (!pointResponse.ok) {
    throw new Error(`NWS points request failed with status ${pointResponse.status}`);
  }

  const pointPayload = (await pointResponse.json()) as NwsPointResponse;
  const hourlyUrl = pointPayload.properties?.forecastHourly;
  if (!hourlyUrl) {
    return [];
  }

  const hourlyResponse = await fetch(hourlyUrl, {
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': 'crop-copilot/1.0 (support@cropcopilot.app)',
    },
  });

  if (!hourlyResponse.ok) {
    throw new Error(`NWS hourly request failed with status ${hourlyResponse.status}`);
  }

  const hourlyPayload = (await hourlyResponse.json()) as NwsHourlyResponse;
  const periods = hourlyPayload.properties?.periods ?? [];

  const windows = periods.slice(0, 24).map((period) => {
    const tempC = round((period.temperature - 32) * (5 / 9));
    const windMps = extractMaxWindMps(period.windSpeed);
    const rainHint = (period.shortForecast ?? '').toLowerCase();
    const rainMm = rainHint.includes('rain') || rainHint.includes('showers') ? 1 : 0;
    const score = buildScore(tempC, windMps, rainMm);

    return {
      startsAt: period.startTime,
      endsAt: period.endTime,
      score,
      summary: scoreSummary(score),
      source: 'nws' as const,
    };
  });

  return dedupeTopWindows(windows.filter((window) => window.score >= 55));
}

export async function buildSprayWindows(
  input: PremiumProcessingInput,
  options: { pool?: Pool } = {}
): Promise<SprayWindow[]> {
  const lat = input.input.fieldLatitude;
  const lon = input.input.fieldLongitude;

  if (lat === null || lon === null) {
    return fallbackWindows();
  }

  const openWeatherApiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (openWeatherApiKey) {
    try {
      if (options.pool) {
        const reservation = await reserveOpenWeatherCall(options.pool, {
          recommendationId: input.recommendationId,
        });
        if (!reservation.allowed) {
          console.warn('OpenWeather daily cap reached; skipping provider call', {
            recommendationId: input.recommendationId,
            reason: reservation.reason,
          });
        } else {
          const openWeatherWindows = await fetchOpenWeatherWindows(lat, lon, openWeatherApiKey);
          if (openWeatherWindows.length > 0) {
            return openWeatherWindows;
          }
        }
      } else {
        const openWeatherWindows = await fetchOpenWeatherWindows(lat, lon, openWeatherApiKey);
        if (openWeatherWindows.length > 0) {
          return openWeatherWindows;
        }
      }
    } catch (error) {
      console.warn('OpenWeather spray window lookup failed', {
        recommendationId: input.recommendationId,
        error: (error as Error).message,
      });
    }
  }

  if (isLikelyUSLocation(input.input.location)) {
    try {
      const nwsWindows = await fetchNwsWindows(lat, lon);
      if (nwsWindows.length > 0) {
        return nwsWindows;
      }
    } catch (error) {
      console.warn('NWS spray window lookup failed', {
        recommendationId: input.recommendationId,
        error: (error as Error).message,
      });
    }
  }

  return fallbackWindows();
}
