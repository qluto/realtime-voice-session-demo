import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Endpoint to generate ephemeral tokens
app.post('/api/generate-token', async (req, res) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY not configured in environment variables'
    });
  }

  try {
    console.log('🔄 Generating new ephemeral token...');

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
      console.log('✅ Ephemeral token generated successfully');
      res.json({
        token: data.value,
        expires_at: data.expires_at || 'Unknown'
      });
    } else {
      console.error('❌ Failed to generate token:', data);
      res.status(400).json({
        error: 'Failed to generate ephemeral token',
        details: data
      });
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    res.status(500).json({
      error: 'Network error while generating token',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Token generation server is running',
    hasApiKey: !!process.env.OPENAI_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Token generation server running on http://localhost:${PORT}`);
  console.log(`📝 API Key configured: ${process.env.OPENAI_API_KEY ? '✅ Yes' : '❌ No'}`);
});