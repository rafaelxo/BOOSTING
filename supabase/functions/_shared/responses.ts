import { corsHeaders } from './cors.ts'

export function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function errorResponse(req: Request, message: string, status = 400): Response {
  return jsonResponse(req, { error: message }, status)
}

export function rateLimitResponse(req: Request, retryAfter: number): Response {
  const response = jsonResponse(req, { error: 'Too many requests' }, 429)
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfter))))
  return response
}
