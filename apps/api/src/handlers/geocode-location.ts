import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { geocodeLocationAddress } from '../lib/location-geocoding';

const GeocodeLocationBodySchema = z.object({
  address: z.string().trim().min(3).max(240),
  limit: z.number().int().min(1).max(5).optional(),
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

export function buildGeocodeLocationHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof GeocodeLocationBodySchema>;
    try {
      payload = GeocodeLocationBodySchema.parse(parseJsonBody<unknown>(event.body));
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

      console.error('Failed to parse geocode-location request', {
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
      const matches = await geocodeLocationAddress(payload.address, payload.limit ?? 3);
      return jsonResponse({ matches }, { statusCode: 200 });
    } catch (error) {
      if (isConfigurationError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'LOCATION_PROVIDER_UNAVAILABLE',
              message: 'Location geocoding is not configured.',
            },
          },
          { statusCode: 503 }
        );
      }

      console.error('Failed to geocode address', {
        userId: auth.userId,
        address: payload.address,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'LOCATION_LOOKUP_FAILED',
            message: 'Failed to resolve address. Try entering coordinates manually.',
          },
        },
        { statusCode: 502 }
      );
    }
  }, verifier);
}

export const handler = buildGeocodeLocationHandler();
