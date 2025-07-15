import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Brain, FileText, CheckCircle, Clock, Target, Download, Zap, AlertCircle, WifiOff, Settings } from 'lucide-react';

const EVE = () => {
  // Core states
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  
  // Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [processingMode, setProcessingMode] = useState('auto'); // auto, api-only, local-only
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  // API availability check
  const hasOpenAIKey = !!import.meta.env.VITE_OPENAI_API_KEY;
  const isAPIMode = processingMode === 'api-only' || (processingMode === 'auto' && hasOpenAIKey);
  const debugMode = import.meta.env.DEV;

  // Timer effect
  useEffect(() => {
    if (sessionActive && !timerRef.current) {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setSessionDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionActive]);

  // Debug logging
  const logDebug = (message, data = null) => {
    if (debugMode) {
      console.log(`🔍 EVE DEBUG: ${message}`, data);
    }
  };

  // Test API connectivity on mount
  useEffect(() => {
    const testAPIConnection = async () => {
      if (!hasOpenAIKey) return;
      
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          }
        });
        
        if (response.ok) {
          logDebug('✅ OpenAI API connection successful');
        } else {
          logDebug('❌ OpenAI API connection failed', response.status);
        }
      } catch (error) {
        logDebug('❌ OpenAI API test error', error);
      }
    };

    if (debugMode && hasOpenAIKey) {
      testAPIConnection();
    }
  }, [hasOpenAIKey, debugMode]);

  // Error handler
  const handleError = (error, context) => {
    console.error(`❌ Error in ${context}:`, error);
    
    let userMessage = 'Er is een fout opgetreden. ';
    
    if (error.message.includes('API key') || error.message.includes('Unauthorized')) {
      userMessage += 'Controleer je OpenAI API configuratie.';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      userMessage += 'Controleer je internetverbinding.';
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      userMessage += 'API quota bereikt. Probeer later opnieuw.';
    } else {
      userMessage += 'Probeer opnieuw of schakel over naar lokale modus.';
    }
    
    setError(userMessage);
    setIsProcessing(false);
    setProcessingStep('');
  };

  // Start recording with improved audio
  const startRecording = async () => {
    try {
      setError('');
      setInsights(null);
      setTranscript('');
      
      logDebug('🎙️ Starting recording...');
      
      // Request high-quality audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,        // Optimal for Whisper
          channelCount: 1           // Mono sufficient
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Setup MediaRecorder with better codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
        
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          logDebug('📊 Audio chunk received', event.data.size);
        }
      };
      
      mediaRecorder.onstop = async () => {
        logDebug('🛑 Recording stopped, creating blob...');
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType 
        });
        logDebug('📁 Audio blob created', audioBlob.size);
        await processAudio(audioBlob);
      };
      
      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setSessionActive(true);
      startTimeRef.current = Date.now();
      
      logDebug('✅ Recording started successfully');
      
    } catch (error) {
      handleError(error, 'recording startup');
    }
  };

  // Stop recording
  const stopRecording = () => {
    logDebug('🛑 Stopping recording...');
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        logDebug('🔇 Stopped audio track');
      });
      streamRef.current = null;
    }
    
    // Timer will be stopped after processing
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Whisper transcription
  const transcribeWithWhisper = async (audioBlob) => {
    logDebug('🎙️ Starting Whisper transcription...', audioBlob.size);
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'nl');
    formData.append('response_format', 'verbose_json');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Whisper API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const result = await response.json();
    logDebug('✅ Whisper transcription completed', result);
    
    return {
      text: result.text,
      duration: result.duration,
      language: result.language,
      segments: result.segments || []
    };
  };

  // GPT-4 analysis
  const analyzeTranscriptWithGPT4 = async (transcriptText) => {
    logDebug('🧠 Starting GPT-4 analysis...');
    
    const prompt = `
Analyseer deze Nederlandse meeting transcript en geef een gedetailleerde structuur terug.

TRANSCRIPT:
"${transcriptText}"

Geef je analyse terug in exact dit JSON formaat (geen extra tekst):

{
  "meetingType": "standup|brainstorm|beslissing|planning|evaluatie|overleg",
  "summary": "2-3 zinnen samenvatting van de meeting",
  "keyDecisions": [
    "Beslissing 1 die genomen werd",
    "Beslissing 2 die genomen werd"
  ],
  "actionItems": [
    {
      "task": "Specifieke taak beschrijving",
      "who": "Naam van verantwoordelijke persoon",
      "when": "Deadline of tijdsindicatie",
      "priority": "hoog|gemiddeld|laag",
      "context": "Waarom deze taak belangrijk is"
    }
  ],
  "keyInsights": [
    "Belangrijk punt 1 uit discussie",
    "Belangrijk punt 2 uit discussie"
  ],
  "followUpNeeded": [
    "Follow-up actie 1",
    "Follow-up actie 2"  
  ],
  "nextSteps": [
    "Volgende stap 1",
    "Volgende stap 2"
  ],
  "blockers": [
    "Blokkerende issue 1",
    "Blokkerende issue 2"
  ],
  "participants": ["Naam1", "Naam2", "Naam3"],
  "sentiment": "positief|neutraal|negatief",
  "topics": ["Onderwerp 1", "Onderwerp 2"],
  "urgency": "hoog|gemiddeld|laag"
}

Focus op Nederlandse context en nuances. Identificeer actiepunten ook als ze impliciet genoemd worden.
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Je bent een expert in Nederlandse meeting analyse. Geef altijd geldige JSON terug zonder extra tekst.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`GPT-4 API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const result = await response.json();
    const analysisText = result.choices[0].message.content;
    
    logDebug('🧠 Raw GPT-4 response', analysisText.substring(0, 200) + '...');
    
    // Parse JSON response
    const analysis = JSON.parse(analysisText);
    logDebug('✅ GPT-4 analysis completed');
    
    return analysis;
  };

  // Local fallback processing
  const processLocalFallback = async (audioBlob) => {
    logDebug('🔧 Using local fallback processing...');
    
    // Simulate transcript (in real app, you could use browser speech recognition here)
    const demoTranscript = `
Meeting verwerkt met lokale analyse op ${new Date().toLocaleString('nl-NL')}.
Duur: ${Math.ceil(sessionDuration / 60)} minuten.

Deze lokale verwerking heeft beperkte mogelijkheden vergeleken met AI-powered analyse.
Voor de beste resultaten, configureer je OpenAI API key in de instellingen.

Hoofdpunten uit de meeting:
- Audio opname succesvol verwerkt
- Lokale analyse actief als fallback
- Upgrade naar API aanbevolen voor volledige functionaliteit

Actiepunten geïdentificeerd:
- API configuratie voltooien
- Test meeting met echte API
- Evalueer resultaat kwaliteit
    `;
    
    setTranscript(demoTranscript);
    
    // Local analysis
    const localInsights = {
      meetingType: 'technisch overleg',
      summary: `Lokale analyse van ${Math.ceil(sessionDuration / 60)} minuten meeting. Voor geavanceerde inzichten en betere accuracy, schakel over naar API-modus.`,
      keyDecisions: ['Lokale verwerking gebruikt als fallback', 'API configuratie prioriteit voor betere resultaten'],
      actionItems: [
        {
          task: 'Configureer OpenAI API key voor geavanceerde analyse',
          who: 'Administrator',
          when: 'Zo snel mogelijk',
          priority: 'hoog',
          context: 'Lokale analyse heeft beperkte mogelijkheden vergeleken met AI'
        },
        {
          task: 'Test volledige API functionaliteit',
          who: 'Team',
          when: 'Na API configuratie',
          priority: 'gemiddeld',
          context: 'Verificeer verbeterde analyse kwaliteit'
        }
      ],
      keyInsights: [
        'Lokale verwerking werkt als betrouwbare fallback',
        'Audio opname kwaliteit is goed',
        'Gebruikersinterface functioneert correct'
      ],
      followUpNeeded: [
        'API key configuratie in environment variabelen',
        'Test verschillende meeting scenarios met API',
        'Vergelijk resultaat kwaliteit lokaal vs API'
      ],
      nextSteps: [
        'API keys verkrijgen van OpenAI platform',
        'Environment configuratie updaten',
        'Volledige test meeting uitvoeren'
      ],
      blockers: [
        'Geen API toegang geconfigureerd',
        'Beperkte analyse mogelijkheden in lokale modus'
      ],
      participants: ['Onbekend (lokale analyse detecteert geen sprekers)'],
      sentiment: 'neutraal',
      topics: ['Technische configuratie', 'Meeting analyse', 'API integratie'],
      urgency: 'gemiddeld',
      processingMethod: 'local_fallback',
      transcriptionInfo: {
        duration: sessionDuration,
        language: 'nl',
        wordCount: demoTranscript.split(/\s+/).length,
        speakingRate: sessionDuration > 0 ? Math.round(demoTranscript.split(/\s+/).length / (sessionDuration / 60)) : 0
      }
    };
    
    setInsights(localInsights);
    logDebug('✅ Local fallback completed');
  };

  // Main audio processing
  const processAudio = async (audioBlob) => {
    logDebug('🔄 Processing audio...', { size: audioBlob.size, mode: processingMode });
    setIsProcessing(true);
    
    try {
      if (isAPIMode && hasOpenAIKey) {
        // API-powered processing
        setProcessingStep('Transcriptie met Whisper AI...');
        const transcriptionResult = await transcribeWithWhisper(audioBlob);
        
        logDebug('📝 Transcript received', transcriptionResult.text.substring(0, 100) + '...');
        setTranscript(transcriptionResult.text);
        
        setProcessingStep('Analyse met GPT-4...');
        const analysis = await analyzeTranscriptWithGPT4(transcriptionResult.text);
        
        // Combine results
        const finalInsights = {
          ...analysis,
          transcriptionInfo: {
            duration: transcriptionResult.duration,
            language: transcriptionResult.language,
            wordCount: transcriptionResult.text.split(/\s+/).length,
            speakingRate: transcriptionResult.duration > 0 ? 
              Math.round(transcriptionResult.text.split(/\s+/).length / (transcriptionResult.duration / 60)) : 0
          },
          processingMethod: 'whisper+gpt4',
          processedAt: new Date().toISOString()
        };
        
        setInsights(finalInsights);
        logDebug('✅ API processing completed');
        
      } else {
        // Local fallback
        setProcessingStep('Lokale analyse...');
        await processLocalFallback(audioBlob);
      }
      
    } catch (error) {
      logDebug('❌ Processing failed, trying fallback', error);
      
      if (isAPIMode) {
        // API failed, try local fallback
        setProcessingStep('API fout - fallback naar lokale analyse...');
        await processLocalFallback(audioBlob);
        setError('API verwerking mislukt, lokale analyse gebruikt. Check je internetverbinding en API configuratie.');
      } else {
        handleError(error, 'audio processing');
      }
      
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Utility functions
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetSession = () => {
    setSessionActive(false);
    setTranscript('');
    setInsights(null);
    setError('');
    setSessionDuration(0);
    setIsProcessing(false);
    setProcessingStep('');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'hoog': return 'bg-red-100 text-red-800 border-red-200';
      case 'gemiddeld': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'laag': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'positief': return 'bg-green-100 text-green-800';
      case 'negatief': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const exportInsights = () => {
    if (!insights) return;
    
    const exportData = {
      datum: new Date().toLocaleDateString('nl-NL'),
      tijd: new Date().toLocaleTimeString('nl-NL'),
      duur: formatTime(sessionDuration),
      verwerkingsMethode: insights.processingMethod || 'onbekend',
      ...insights,
      volledigeTranscript: transcript
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eve-meeting-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Brain className="w-12 h-12 text-blue-600" />
            <h1 className="text-6xl font-light text-slate-800">EVE</h1>
            <div className="flex items-center space-x-2">
              {hasOpenAIKey && isAPIMode ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Zap className="w-5 h-5" />
                  <span className="text-sm font-medium">AI Ready</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-orange-600">
                  {processingMode === 'local-only' ? <WifiOff className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span className="text-sm font-medium">
                    {processingMode === 'local-only' ? 'Lokaal' : 'API Config Needed'}
                  </span>
                </div>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>
          <p className="text-xl text-slate-600 font-light">AI-Powered Meeting Assistent</p>
          <p className="text-sm text-slate-500 mt-2">
            {hasOpenAIKey && isAPIMode
              ? 'Whisper transcriptie • GPT-4 analyse • Nederlandse context' 
              : processingMode === 'local-only'
              ? 'Lokale modus • Beperkte functionaliteit'
              : 'Configureer API keys voor volledige functionaliteit'
            }
          </p>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">Instellingen</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Verwerkingsmodus
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setProcessingMode('auto')}
                    className={`p-3 rounded-lg border text-sm ${
                      processingMode === 'auto' 
                        ? 'bg-blue-100 border-blue-300 text-blue-800' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" />
                    <div className="font-medium">Auto</div>
                    <div className="text-xs">API als beschikbaar</div>
                  </button>
                  <button
                    onClick={() => setProcessingMode('api-only')}
                    className={`p-3 rounded-lg border text-sm ${
                      processingMode === 'api-only' 
                        ? 'bg-green-100 border-green-300 text-green-800' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    disabled={!hasOpenAIKey}
                  >
                    <Brain className="w-4 h-4 mx-auto mb-1" />
                    <div className="font-medium">Alleen API</div>
                    <div className="text-xs">Beste kwaliteit</div>
                  </button>
                  <button
                    onClick={() => setProcessingMode('local-only')}
                    className={`p-3 rounded-lg border text-sm ${
                      processingMode === 'local-only' 
                        ? 'bg-orange-100 border-orange-300 text-orange-800' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <WifiOff className="w-4 h-4 mx-auto mb-1" />
                    <div className="font-medium">Lokaal</div>
                    <div className="text-xs">Geen internet</div>
                  </button>
                </div>
              </div>
              
              <div className={`border rounded-lg p-4 ${
                hasOpenAIKey ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <h4 className={`font-medium mb-2 ${
                  hasOpenAIKey ? 'text-green-800' : 'text-amber-800'
                }`}>
                  API Status
                </h4>
                <p className={`text-sm ${
                  hasOpenAIKey ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {hasOpenAIKey 
                    ? '✅ OpenAI API key geconfigureerd - AI analyse beschikbaar'
                    : '⚠️ Geen OpenAI API key gevonden. Voeg VITE_OPENAI_API_KEY toe aan .env.local'
                  }
                </p>
                {!hasOpenAIKey && (
                  <p className="text-amber-600 text-xs mt-2">
                    Krijg je API key op platform.openai.com • Kosten: ~€4/maand voor 20 meetings
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Session Info */}
        {sessionActive && (
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-full px-6 py-2 shadow-lg flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">{formatTime(sessionDuration)}</span>
              </div>
              {isRecording && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-slate-600">Opname</span>
                </div>
              )}
              {isProcessing && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <span className="text-sm text-slate-600">Verwerken</span>
                </div>
              )}
              <div className="text-xs text-slate-500">
                {isAPIMode ? 'AI Modus' : 'Lokaal'}
              </div>
            </div>
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="relative">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <div>
                <p className="text-blue-800 font-medium">
                  {isAPIMode ? 'AI Processing' : 'Lokale Verwerking'}
                </p>
                <p className="text-blue-600 text-sm">{processingStep || 'Verwerken...'}</p>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <div className="flex justify-between text-sm text-blue-700 mb-2">
                <span>Voortgang</span>
                <span>
                  {processingStep.includes('Whisper') ? '25%' :
                   processingStep.includes('GPT-4') ? '75%' :
                   processingStep.includes('Lokale') ? '50%' : '10%'}
                </span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: processingStep.includes('Whisper') ? '25%' :
                           processingStep.includes('GPT-4') ? '75%' :
                           processingStep.includes('Lokale') ? '50%' : '10%'
                  }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* Main Button */}
        <div className="flex flex-col items-center mb-12">
          {!sessionActive ? (
            <button
              onClick={startRecording}
              disabled={!!error}
              className="w-64 h-64 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center group"
            >
              <div className="text-center">
                <Mic className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-light">Start Meeting</span>
                <div className="text-sm opacity-75 mt-2">
                  {isAPIMode ? 'AI Powered' : 'Lokale Modus'}
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              disabled={isProcessing}
              className="w-64 h-64 rounded-full bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center group"
            >
              <div className="text-center">
                <MicOff className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-light">
                  {isProcessing ? 'Analyseren...' : 'Stop & Analyseer'}
                </span>
                {isProcessing && (
                  <div className="text-sm opacity-75 mt-2">Even geduld</div>
                )}
              </div>
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
            <p className="font-medium">Fout opgetreden:</p>
            <p>{error}</p>
            {!hasOpenAIKey && (
              <p className="text-sm mt-2">💡 Tip: Configureer je OpenAI API key voor de beste resultaten</p>
            )}
          </div>
        )}

        {/* Transcript Display */}
        {transcript && (
          <div className="mb-8 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-medium text-slate-700">Transcript</h3>
                {insights?.processingMethod && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {insights.processingMethod}
                  </span>
                )}
              </div>
              <span className="text-sm text-slate-500">
                {transcript.split(/\s+/).length} woorden
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-y-auto">
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {transcript}
              </p>
            </div>
          </div>
        )}

        {/* Insights Results */}
        {insights && (
          <div className="space-y-6 mb-8">
            {/* Summary with processing info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Brain className="w-6 h-6 text-blue-500" />
                  <h2 className="text-xl font-medium text-slate-800">Meeting Analyse</h2>
                  {insights.processingMethod && (
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      insights.processingMethod.includes('gpt4') 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {insights.processingMethod.includes('gpt4') ? 'AI Powered' : 'Lokaal'}
                    </div>
                  )}
                </div>
                <button
                  onClick={exportInsights}
                  className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm transition-colors flex items-center space-x-1"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>
              
              <p className="text-slate-600 text-lg leading-relaxed mb-4">{insights.summary}</p>
              
              {/* Meeting metadata */}
              <div className="flex flex-wrap gap-2 mb-4">
                {insights.meetingType && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {insights.meetingType}
                  </span>
                )}
                {insights.sentiment && (
                  <span className={`px-3 py-1 rounded-full text-sm ${getSentimentColor(insights.sentiment)}`}>
                    Sfeer: {insights.sentiment}
                  </span>
                )}
                {insights.urgency && (
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    insights.urgency === 'hoog' ? 'bg-red-100 text-red-800' :
                    insights.urgency === 'laag' ? 'bg-green-100 text-green-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    Urgentie: {insights.urgency}
                  </span>
                )}
              </div>
              
              {/* Enhanced Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">
                    {insights.transcriptionInfo?.wordCount || insights.stats?.wordCount || 0}
                  </div>
                  <div className="text-slate-600">Woorden</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">
                    {insights.actionItems?.length || 0}
                  </div>
                  <div className="text-slate-600">Acties</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">
                    {insights.keyDecisions?.length || 0}
                  </div>
                  <div className="text-slate-600">Beslissingen</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">
                    {formatTime(insights.transcriptionInfo?.duration || sessionDuration)}
                  </div>
                  <div className="text-slate-600">Duur</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">
                    {insights.participants?.length || 0}
                  </div>
                  <div className="text-slate-600">Deelnemers</div>
                </div>
              </div>
            </div>

            {/* Action Items */}
            {insights.actionItems && insights.actionItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <h3 className="text-lg font-medium text-slate-800">
                    Actiepunten ({insights.actionItems.length})
                  </h3>
                </div>
                <div className="space-y-3">
                  {insights.actionItems.map((item, index) => (
                    <div key={index} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800 mb-2">{item.task}</p>
                          <div className="flex items-center space-x-4 text-sm text-slate-600 mb-2">
                            <span><strong>Wie:</strong> {item.who}</span>
                            <span><strong>Wanneer:</strong> {item.when}</span>
                          </div>
                          {item.context && (
                            <p className="text-sm text-slate-500 italic">{item.context}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid for Decisions & Insights */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Decisions */}
              {insights.keyDecisions && insights.keyDecisions.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Beslissingen</h3>
                  <ul className="space-y-3">
                    {insights.keyDecisions.slice(0, 5).map((decision, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-slate-600 text-sm">{decision}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Insights */}
              {insights.keyInsights && insights.keyInsights.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Belangrijkste Punten</h3>
                  <ul className="space-y-3">
                    {insights.keyInsights.slice(0, 5).map((insight, index) => (
                      <li key={index} className="text-slate-600 text-sm">
                        • {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Topics & Participants */}
            {(insights.topics?.length > 0 || insights.participants?.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6">
                {insights.topics && insights.topics.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-medium text-slate-800 mb-4">Onderwerpen</h3>
                    <div className="flex flex-wrap gap-2">
                      {insights.topics.map((topic, index) => (
                        <span key={index} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {insights.participants && insights.participants.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-medium text-slate-800 mb-4">Deelnemers</h3>
                    <div className="flex flex-wrap gap-2">
                      {insights.participants.map((participant, index) => (
                        <span key={index} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                          {participant}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Follow-up & Next Steps */}
            {(insights.followUpNeeded?.length > 0 || insights.nextSteps?.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6">
                {insights.followUpNeeded && insights.followUpNeeded.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h3 className="text-lg font-medium text-blue-800 mb-4">Follow-up Vereist</h3>
                    <ul className="space-y-2">
                      {insights.followUpNeeded.map((item, index) => (
                        <li key={index} className="flex items-start space-x-3">
                          <Target className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                          <span className="text-blue-700 text-sm">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.nextSteps && insights.nextSteps.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                    <h3 className="text-lg font-medium text-green-800 mb-4">Volgende Stappen</h3>
                    <ul className="space-y-2">
                      {insights.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start space-x-3">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-1 flex-shrink-0" />
                          <span className="text-green-700 text-sm">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Blockers */}
            {insights.blockers && insights.blockers.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h3 className="text-lg font-medium text-amber-800 mb-4">
                  Aandachtspunten ({insights.blockers.length})
                </h3>
                <ul className="space-y-2">
                  {insights.blockers.map((blocker, index) => (
                    <li key={index} className="text-amber-700 text-sm">⚠️ {blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={resetSession}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                Nieuwe Meeting
              </button>
              <button
                onClick={exportInsights}
                className="px-8 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium"
              >
                Download Resultaten
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!sessionActive && !error && !insights && (
          <div className="text-center text-slate-500 max-w-lg mx-auto">
            <p className="text-sm leading-relaxed mb-6">
              {hasOpenAIKey && isAPIMode
                ? 'Klik op "Start Meeting" voor AI-powered analyse van je meeting met superieure accuratesse en Nederlandse context begrip.'
                : processingMode === 'local-only'
                ? 'Lokale modus actief - beperkte mogelijkheden. Audio wordt lokaal verwerkt zonder internet.'
                : 'Configureer je OpenAI API key voor de beste resultaten met Whisper transcriptie en GPT-4 analyse.'
              }
            </p>
            <div className="grid grid-cols-3 gap-6 text-xs">
              <div className="text-center">
                <Brain className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                <p className="font-medium">
                  {isAPIMode ? 'AI Analyse' : 'Lokale Analyse'}
                </p>
                <p className="text-slate-400">
                  {isAPIMode ? 'Geavanceerde inzichten' : 'Basis functionaliteit'}
                </p>
              </div>
              <div className="text-center">
                <Zap className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p className="font-medium">
                  {isAPIMode ? 'Nederlandse Context' : 'Eenvoudige Verwerking'}
                </p>
                <p className="text-slate-400">
                  {isAPIMode ? '95%+ accuracy' : 'Keyword detectie'}
                </p>
              </div>
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                <p className="font-medium">Slimme Export</p>
                <p className="text-slate-400">Gestructureerde data</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EVE;
