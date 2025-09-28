#!/usr/bin/env node

// Simple script to generate ephemeral tokens for testing
// Usage: node generate-token.js

const https = require('https');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('Set it with: export OPENAI_API_KEY="sk-proj-your-key-here"');
  process.exit(1);
}

const postData = JSON.stringify({
  session: {
    type: 'realtime',
    model: 'gpt-realtime'
  }
});

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/realtime/client_secrets',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Generating ephemeral token...');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.value) {
        console.log('\n✅ Ephemeral token generated successfully!');
        console.log('\nToken (copy this for the browser):');
        console.log(response.value);
        console.log('\nThis token is valid for a limited time and should be used immediately.');
      } else {
        console.error('❌ Failed to generate token');
        console.error('Response:', data);
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.error('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.write(postData);
req.end();