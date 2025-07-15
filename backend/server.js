// server.js - Kopieer dit naar backend/server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// CORS
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Transcription endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(401).json({ error: 'No OpenAI API key configured' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('🎙️ Transcribing audio:', req.file.size, 'bytes');

    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'recording.webm',
      contentType: req.file.mimetype
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'nl');
    formData.append('response_format', 'verbose_json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'Transcription failed' 
      });
    }

    const result = await response.json();
    console.log('✅ Transcription done');

    res.json({
      text: result.text,
      duration: result.duration,
      language: result.language,
      wordCount: result.text.split(/\s+/).length
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(401).json({ error: 'No OpenAI API key configured' });
    }

    const { transcript } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    console.log('🧠 Analyzing transcript...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Je bent een expert in Nederlandse meeting analyse. Geef altijd geldige JSON terug.'
          },
          {
            role: 'user',
            content: `Analyseer dit Nederlandse meeting transcript en geef JSON terug:

"${transcript}"

Gebruik dit format:
{
  "meetingType": "standup|brainstorm|beslissing|planning|evaluatie|overleg",
  "summary": "Korte samenvatting",
  "keyDecisions": ["Beslissing 1", "Beslissing 2"],
  "actionItems": [
    {
      "task": "Taak beschrijving",
      "who": "Verantwoordelijke",
      "when": "Deadline",
      "priority": "hoog|gemiddeld|laag"
    }
  ],
  "keyInsights": ["Inzicht 1", "Inzicht 2"],
  "participants": ["Naam1", "Naam2"],
  "sentiment": "positief|neutraal|negatief",
  "topics": ["Onderwerp 1", "Onderwerp 2"],
  "urgency": "hoog|gemiddeld|laag"
}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'Analysis failed' 
      });
    }

    const result = await response.json();
    let analysisText = result.choices[0].message.content;
    
    // Clean JSON
    analysisText = analysisText.replace(/```json\s*|\s*```/g, '').trim();
    
    try {
      const analysis = JSON.parse(analysisText);
      analysis.processingMethod = 'whisper+gpt4';
      analysis.processedAt = new Date().toISOString();
      
      console.log('✅ Analysis done');
      res.json(analysis);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      res.status(500).json({ error: 'Invalid response format' });
    }

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasAPIKey: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Test connection
app.get('/api/test', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });
    
    if (response.ok) {
      res.json({ status: 'connected', message: 'OpenAI API working' });
    } else {
      res.status(response.status).json({ error: 'OpenAI API error' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Connection failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`🔐 API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
});
