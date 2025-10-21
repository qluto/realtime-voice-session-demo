import { NextResponse, type NextRequest } from 'next/server'

const REALTIME_TOKEN_URL = 'https://api.openai.com/v1/realtime/client_secrets'

const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime'

export async function POST(_request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      error: 'OPENAI_API_KEY not configured'
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    })
  }

  try {
    const upstreamResponse = await fetch(REALTIME_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: realtimeModel
        }
      })
    })

    const data = await upstreamResponse.json()

    if (!upstreamResponse.ok || !data?.value) {
      const message = data?.error?.message || 'Failed to generate ephemeral token'
      return NextResponse.json({
        error: message,
        details: data
      }, {
        status: upstreamResponse.status || 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      })
    }

    return NextResponse.json({
      token: data.value,
      expiresAt: data.expires_at ?? null
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Network error while requesting token',
      details: message
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    })
  }
}

export function GET() {
  return NextResponse.json({
    error: 'Method not allowed'
  }, {
    status: 405,
    headers: {
      Allow: 'POST',
      'Cache-Control': 'no-store'
    }
  })
}
