# 🌟 Weekly Reflection Coaching with AI

A professional coaching experience using OpenAI's GPT Realtime API with ICF Core Competencies for guided weekly reflection sessions.

## Features

- 🧠 **ICF-Certified Coaching Approach**: Implements International Coach Federation Core Competencies
- 🎤 **Real-time Voice Coaching**: Natural voice conversation using OpenAI's GPT Realtime API
- 📋 **Structured Weekly Reflection**: 10-minute guided sessions with clear phases
- 🔍 **Powerful Coaching Questions**: Research-based questions for deep reflection
- 🌐 **Browser-based Experience**: No downloads required, works in modern browsers
- 🔒 **Secure & Private**: Ephemeral token authentication, no data storage
- 📊 **Usage Analytics**: Real-time token consumption and cost tracking
- 💰 **Cost Optimization**: Cached input monitoring and savings analysis
- 🎯 **Professional Structure**: Opening → Reflection → Insights → Integration → Closing

## Prerequisites

- Node.js (v16 or higher)
- OpenAI API key with access to the Realtime API
- Modern browser with microphone support

## Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set your OpenAI API key in .env file:**
   ```bash
   # The .env file should contain:
   OPENAI_API_KEY=sk-proj-your-key-here
   ```

3. **Start both servers:**
   ```bash
   # Option 1: Start both servers together
   npm run dev:full

   # Option 2: Start servers separately (in different terminals)
   npm run server  # Token generation server (port 3001)
   npm run dev     # Frontend development server (port 5173)
   ```

4. **Open your browser** and navigate to http://localhost:5173

### Optional configuration

- `VITE_TOKEN_ENDPOINT` — Override the token broker URL (defaults to `/api/generate-token`)
- `OPENAI_REALTIME_MODEL` — Override the realtime model requested from OpenAI (defaults to `gpt-realtime`)

## Deploying to Vercel

1. **Install and authenticate the Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   ```
2. **Link the repository to a new Vercel project**
   ```bash
   vercel link
   ```
3. **Configure production environment variables**
   ```bash
   vercel env add OPENAI_API_KEY production
   # Optional overrides
   vercel env add OPENAI_API_KEY preview
   vercel env add OPENAI_API_KEY development
   vercel env add OPENAI_REALTIME_MODEL production
   ```
   The frontend automatically calls the serverless function at `/api/generate-token`, so no public token ever reaches the browser.
4. **Deploy**
   ```bash
   vercel --prod
   ```
5. **Verify**
   - Visit the deployment URL shown after the CLI finishes
   - Confirm the UI loads and "Connect" starts a session without console errors
   - Optionally assign a custom domain via the Vercel dashboard

## How to Use Your Coaching Session

1. **Prepare Your Space**: Find a quiet, private space where you can speak freely
2. **Start Session**: Click "Start Coaching Session"
3. **Allow Microphone**: Grant microphone access when prompted
4. **Begin Reflection**: Your coach will guide you through a structured 10-minute session

### Session Structure (10 minutes)

**🎯 Opening & Agenda Setting (1-2 min)**
- Welcome and creating safety
- Establishing the week's focus
- Setting intention for reflection

**🔍 Deep Reflection (4-5 min)**
- Exploring experiences, patterns, emotions
- Powerful questions about energy, challenges, growth
- Space for processing and discovery

**💡 Insight Synthesis (2-3 min)**
- Identifying key learnings and themes
- Articulating discoveries about yourself
- Connecting patterns to values and growth

**⚡ Forward Integration (2-3 min)**
- Applying insights to future actions
- Setting intentions for the coming week
- Creating specific, meaningful commitments

**🙏 Closing (1 min)**
- Acknowledging your reflection work
- Appreciating your commitment to growth

**Note:** Your coach follows ICF Core Competencies, focusing on YOUR wisdom and insights rather than giving advice.

## Usage Tracking Features

The application provides comprehensive usage tracking:

- **Real-time Statistics**: View live token consumption during conversation
- **Cached Input Monitoring**: Track when OpenAI uses cached inputs (highlighted in green)
- **Console Logging**: Detailed usage statistics logged every 10 seconds
- **UI Dashboard**: Visual display of requests, input/output/total tokens, and cached tokens

### Console Output Example
```
🔍 OpenAI API Usage Statistics
📊 Requests: 3
📥 Input Tokens: 1,247
📤 Output Tokens: 892
🔢 Total Tokens: 2,139
📋 Input Token Details:
  Request 1: {text_tokens: 292, audio_tokens: 229, cached_tokens: 0}
    📝 Text Tokens: 292
    🎵 Audio Tokens: 229
  Request 2: {text_tokens: 89, audio_tokens: 156, cached_tokens: 128}
    🚀 Cached Input Tokens: 128
    📝 Text Tokens: 89
    🎵 Audio Tokens: 156
🎯 Token Type Breakdown:
  📝 Text Tokens: 381
  🎵 Audio Tokens: 385
💰 Cost Breakdown (gpt-realtime pricing):
  💸 Input Cost: $0.0358 (1,119 tokens @ $32.00/1M)
  🚀 Cached Input Cost: $0.0001 (128 tokens @ $0.40/1M)
  📤 Output Cost: $0.0571 (892 tokens @ $64.00/1M)
  🔢 Total Cost: $0.0930
  💰 Cache Savings: $0.0040 (4.1% saved)
```

## 💰 Cost Calculation Features

The application provides real-time cost analysis based on official OpenAI pricing:

- **Live Cost Tracking**: Real-time cost calculation during conversations
- **Pricing Models**: Support for gpt-realtime, gpt-4o-realtime-preview, and gpt-4o-mini-realtime-preview
- **Cache Savings**: Calculate savings from cached input tokens
- **Cost Breakdown**: Detailed breakdown of input, cached input, and output costs
- **Token Type Analysis**: Separate tracking of text tokens vs audio tokens
- **Enhanced Details**: Support for latest OpenAI API response format with detailed token breakdowns
- **Percentage Savings**: Shows how much you save by using cached inputs

### Supported Models & Pricing (per 1M tokens)
| Model | Input | Cached Input | Output |
|-------|-------|--------------|--------|
| gpt-realtime | $32.00 | $0.40 | $64.00 |
| gpt-4o-realtime-preview | $40.00 | $2.50 | $80.00 |
| gpt-4o-mini-realtime-preview | $10.00 | $0.30 | $20.00 |

## Manual Token Generation

If you prefer to generate tokens manually:

```bash
curl -X POST https://api.openai.com/v1/realtime/client_secrets \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session": {
      "type": "realtime",
      "model": "gpt-realtime"
    }
  }'
```

## Security Notes

- Ephemeral tokens are temporary and should be regenerated frequently
- Never expose your main OpenAI API key in the browser
- In production, implement server-side token generation

## Troubleshooting

- **"Invalid ephemeral token"**: Make sure the token starts with "ek_" and is recently generated
- **Microphone not working**: Check browser permissions and ensure HTTPS/localhost
- **Connection fails**: Verify your OpenAI API key has Realtime API access

## Architecture

- **Frontend**: Vite + TypeScript + vanilla DOM manipulation
- **Voice Processing**: OpenAI Agents SDK with WebRTC transport
- **Styling**: Modern CSS with dark/light mode support
