/**
 * Type Definitions
 *
 * Central location for all TypeScript type definitions.
 * Add specific types as the application develops.
 */

// Placeholder types - will be expanded in future sessions
export type User = {
  id: string;
  email: string;
  name?: string;
};

export type Recommendation = {
  id: string;
  userId: string;
  createdAt: Date;
};
