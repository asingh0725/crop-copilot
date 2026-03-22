import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { reverseGeocodeCoordinates } from '../lib/location-geocoding';

const ReverseGeocodeBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError';
}

function isConfigurationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('openweather_api_key')
  );
}

export function buildReverseGeocodeLocationHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof ReverseGeocodeBodySchema>;
    try {
      payload = ReverseGeocodeBodySchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (isValidationError(error) || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          },
          { statusCode: 400 }
        );
      }

      console.error('Failed to parse reverse-geocode request', {
        userId: auth.userId,
        error: (error as Error).message,
      });
      return jsonResponse(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error',
          },
        },
        { statusCode: 500 }
      );
    }

    try {
      const match = await reverseGeocodeCoordinates(payload.latitude, payload.longitude);
      return jsonResponse({ match }, { statusCode: 200 });
    } catch (error) {
      if (isConfigurationError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'LOCATION_PROVIDER_UNAVAILABLE',
              message: 'Location reverse geocoding is not configured.',
            },
          },
          { statusCode: 503 }
        );
      }

      console.error('Failed to reverse geocode coordinates', {
        userId: auth.userId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'LOCATION_LOOKUP_FAILED',
            message: 'Failed to resolve location from coordinates.',
          },
        },
        { statusCode: 502 }
      );
    }
  }, verifier);
}

export const handler = buildReverseGeocodeLocationHandler();
