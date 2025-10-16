const REALTIME_TOKEN_URL = 'https://api.openai.com/v1/realtime/client_secrets'

const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime'

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
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
      return res.status(upstreamResponse.status || 500).json({
        error: message,
        details: data
      })
    }

    return res.status(200).json({
      token: data.value,
      expiresAt: data.expires_at ?? null
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({
      error: 'Network error while requesting token',
      details: message
    })
  }
}
