/**
 * Authentication Middleware
 *
 * Provides authentication for API routes using either:
 * 1. JWT Bearer token (for mobile clients)
 * 2. Cookie-based session (for web app)
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { User } from '@supabase/supabase-js'

export interface AuthenticatedRequest extends NextRequest {
  user: User
}

export type AuthHandler = (
  request: AuthenticatedRequest,
  context?: any
) => Promise<NextResponse>

/**
 * Middleware to check authentication from either JWT token or cookie session
 */
export function withAuth(handler: AuthHandler) {
  return async (request: NextRequest, context?: any) => {
    try {
      // Check for Bearer token first (mobile clients)
      const authHeader = request.headers.get('Authorization')

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)

        // Create Supabase client with JWT token
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
          return NextResponse.json(
            { error: 'Invalid or expired token' },
            { status: 401 }
          )
        }

        // Attach user to request
        (request as AuthenticatedRequest).user = user
        return handler(request as AuthenticatedRequest, context)
      }

      // Fall back to cookie-based auth (web app)
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Attach user to request
      (request as AuthenticatedRequest).user = user
      return handler(request as AuthenticatedRequest, context)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }
  }
}

/**
 * Optional auth middleware - returns null user if not authenticated
 * Useful for endpoints that have public/private behavior
 */
export function withOptionalAuth(handler: AuthHandler) {
  return async (request: NextRequest, context?: any) => {
    try {
      const authHeader = request.headers.get('Authorization')

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser(token)

        if (user) {
          (request as AuthenticatedRequest).user = user
        }
      } else {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          (request as AuthenticatedRequest).user = user
        }
      }

      return handler(request as AuthenticatedRequest, context)
    } catch (error) {
      console.error('Optional auth middleware error:', error)
      return handler(request as AuthenticatedRequest, context)
    }
  }
}
