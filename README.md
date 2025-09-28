# OpenAI Voice Agent Chat MVP

A minimal voice chat application using OpenAI's GPT Realtime API with WebRTC for browser-based voice conversations.

## Features

- 🎤 Real-time voice conversation with OpenAI's GPT model
- 🌐 Browser-based WebRTC connection
- 🎨 Modern, responsive UI
- 🔒 Secure ephemeral token authentication
- 📊 Real-time usage tracking and statistics
- 🚀 Cached input token monitoring
- 💾 Console logging of detailed API usage
- 💰 Real-time cost calculation with OpenAI pricing
- 🎯 Cache savings analysis and cost optimization insights

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

## Usage

1. Click "Connect to Voice Agent"
2. The system will automatically generate a new ephemeral token
3. Allow microphone access when requested
4. Start talking! The AI will respond with voice

**Note:** Ephemeral tokens are now automatically generated for each new connection, eliminating the need for manual token management.

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