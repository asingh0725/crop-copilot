/**
 * OpenAPI Specification for Crop Copilot API v1
 *
 * This file defines the OpenAPI 3.0 spec for the mobile API.
 * Used for API documentation and client SDK generation.
 */

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Crop Copilot API',
    version: '1.0.0',
    description: 'AI-powered agronomy assistant API for mobile and web clients',
    contact: {
      name: 'Crop Copilot Support',
      email: 'support@cropcopilot.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000/api/v1',
      description: 'Development server',
    },
    {
      url: 'https://cropcopilot.com/api/v1',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from Supabase authentication',
      },
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'sb-access-token',
        description: 'Session cookie for web clients',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'object' },
        },
      },
      Input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          type: { type: 'string', enum: ['PHOTO', 'LAB_REPORT'] },
          imageUrl: { type: 'string', format: 'uri', nullable: true },
          description: { type: 'string', nullable: true },
          labData: { type: 'object', nullable: true },
          crop: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          season: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Recommendation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          inputId: { type: 'string' },
          diagnosis: { type: 'object' },
          confidence: { type: 'number', format: 'float' },
          modelUsed: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string', nullable: true },
          analysis: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          location: { type: 'string', nullable: true },
          farmSize: { type: 'number', nullable: true },
          cropsOfInterest: { type: 'array', items: { type: 'string' }, nullable: true },
          experienceLevel: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }, { CookieAuth: [] }],
  paths: {
    '/inputs': {
      post: {
        summary: 'Create a new input and generate recommendation',
        tags: ['Inputs'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type'],
                properties: {
                  type: { type: 'string', enum: ['PHOTO', 'LAB_REPORT'] },
                  imageUrl: { type: 'string', format: 'uri' },
                  description: { type: 'string' },
                  labData: { type: 'object' },
                  crop: { type: 'string' },
                  location: { type: 'string' },
                  season: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Input created and recommendation generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    input: { $ref: '#/components/schemas/Input' },
                    recommendationId: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid input', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      get: {
        summary: 'List user inputs',
        tags: ['Inputs'],
        responses: {
          200: {
            description: 'List of inputs',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Input' },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/inputs/{id}': {
      get: {
        summary: 'Get input by ID',
        tags: ['Inputs'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Input details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Input' },
              },
            },
          },
          404: { description: 'Input not found' },
        },
      },
    },
    '/recommendations': {
      get: {
        summary: 'List recommendations with pagination',
        tags: ['Recommendations'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date_asc', 'date_desc', 'confidence_high', 'confidence_low'] } },
        ],
        responses: {
          200: {
            description: 'Paginated recommendations',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    recommendations: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Recommendation' },
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        pageSize: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/recommendations/{id}': {
      get: {
        summary: 'Get recommendation by ID',
        tags: ['Recommendations'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Recommendation details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Recommendation' },
              },
            },
          },
          404: { description: 'Recommendation not found' },
        },
      },
      delete: {
        summary: 'Delete recommendation',
        tags: ['Recommendations'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: { description: 'Recommendation deleted' },
          404: { description: 'Recommendation not found' },
        },
      },
    },
    '/products': {
      get: {
        summary: 'Search products',
        tags: ['Products'],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'List of products',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    products: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Product' },
                    },
                    pagination: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/profile': {
      get: {
        summary: 'Get user profile',
        tags: ['Profile'],
        responses: {
          200: {
            description: 'User profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
          404: { description: 'Profile not found' },
        },
      },
      put: {
        summary: 'Update user profile',
        tags: ['Profile'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                  farmSize: { type: 'number' },
                  cropsOfInterest: { type: 'array', items: { type: 'string' } },
                  experienceLevel: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Profile updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
        },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload an image',
        tags: ['Upload'],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Image uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid file' },
        },
      },
    },
  },
  tags: [
    { name: 'Inputs', description: 'Input management' },
    { name: 'Recommendations', description: 'Recommendation management' },
    { name: 'Products', description: 'Product search and comparison' },
    { name: 'Profile', description: 'User profile' },
    { name: 'Upload', description: 'File upload' },
  ],
};
