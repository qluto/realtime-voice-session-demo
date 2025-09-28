import { defineConfig } from 'vite'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        configure: (proxy, options) => {
          // Custom middleware for token generation
          proxy.on('proxyReq', (proxyReq, req, res) => {
            if (req.url === '/api/generate-token' && req.method === 'POST') {
              // Handle token generation directly in the proxy
              handleTokenGeneration(req, res);
              return;
            }
          });
        }
      }
    }
  }
})

async function handleTokenGeneration(req: any, res: any) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }));
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime'
        }
      })
    });

    const data = await response.json();

    if (response.ok && data.value) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: data.value }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate token', details: data }));
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Network error', details: error.message }));
  }
}