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
  
  // API Status states
  const [apiStatus, setApiStatus] = useState({ available: false, hasAPIKey: false });
  
  // Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [processingMode, setProcessingMode] = useState('auto');
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  // API Configuration
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const debugMode = import.meta.env.DEV;

  // Debug logging
  const logDebug = (message, data = null) => {
    if (debugMode) {
      console.log(`🔍 EVE DEBUG: ${message}`, data);
    }
  };

  // API Status Check
  const checkAPIStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      const data = await response.json();
      return {
        available: response.ok,
        hasAPIKey: data.hasAPIKey,
        message: data.message || 'API server reachable'
      };
    } catch (error) {
      console.error('API Health Check failed:', error);
      return {
        available: false,
        hasAPIKey: false,
        message: 'API server unreachable'
      };
    }
  };

  // Test API Connection
  const testAPIConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/test`);
      const data = await response.json();
      
      if (response.ok) {
        logDebug('✅ API connection successful', data);
        return { success: true, data };
      } else {
        logDebug('❌ API connection failed', data);
        return { success: false, error: data.error || 'Connection failed' };
      }
    } catch (error) {
      logDebug('❌ API test error', error);
      return { success: false, error: error.message };
    }
  };

  // Check API status on mount and periodically
  useEffect(() => {
    const checkStatus = async () => {
      const status = await checkAPIStatus();
      setApiStatus(status);
      logDebug('API Status:', status);
    };
    
    checkStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Test API connection on mount
  useEffect(() => {
    const testConnection = async () => {
      if (apiStatus.available && apiStatus.hasAPIKey) {
        const result = await testAPIConnection();
        if (result.success) {
          logDebug('✅ Full API connection verified');
        } else {
          logDebug('❌ API connection test failed', result.error);
        }
      }
    };

    if (debugMode && apiStatus.available) {
      testConnection();
    }
  }, [apiStatus, debugMode]);

  // Derived states
  const hasOpenAIKey = apiStatus.hasAPIKey;
  const isAPIMode = processingMode === 'api-only' || (processingMode === 'auto' && apiStatus.available && hasOpenAIKey);

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

  // Error handler
  const handleError = (error, context) => {
    console.error(`❌ Error in ${context}:`, error);
    
    let userMessage = 'Er is een fout opgetreden. ';
    
    if (error.message.includes('API key') || error.message.includes('Invalid API key')) {
      userMessage += 'Backend API configuratie probleem. Check Railway environment variables.';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      userMessage += 'Kan geen verbinding maken met backend. Check of Railway app draait.';
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      userMessage += 'OpenAI API quota bereikt. Probeer later opnieuw.';
    } else if (error.message.includes('unreachable')) {
      userMessage += 'Backend server niet bereikbaar. Check Railway deployment.';
    } else {
      userMessage += `${error.message}`;
    }
    
    setError(userMessage);
    setIsProcessing(false);
    setProcessingStep('');
  };

  // Whisper transcription via backend
  const transcribeWithWhisper = async (audioBlob) => {
    logDebug('🎙️ Starting Whisper transcription via backend...', audioBlob.size);
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Transcription error: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    logDebug('✅ Whisper transcription completed', result);
    
    return result;
  };

  // GPT-4 analysis via backend
  const analyzeTranscriptWithGPT4 = async (transcriptText) => {
    logDebug('🧠 Starting GPT-4 analysis via backend...');
    
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transcript: transcriptText
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Analysis error: ${errorData.error || response.statusText}`);
    }
    
    const analysis = await response.json();
    logDebug('✅ GPT-4 analysis completed');
    
    return analysis;
  };

  // Local fallback processing
  const processLocalFallback = async (audioBlob) => {
    logDebug('🔧 Using local fallback processing...');
    
    const demoTranscript = `
Meeting verwerkt met lokale analyse op ${new Date().toLocaleString('nl-NL')}.
Duur: ${Math.ceil(sessionDuration / 60)} minuten.

Deze lokale verwerking heeft beperkte mogelijkheden vergeleken met AI-powered analyse.
Voor de beste resultaten, configureer je OpenAI API key in Railway environment variables.

Hoofdpunten uit de meeting:
- Audio opname succesvol verwerkt
- Lokale analyse actief als fallback
- Backend API niet beschikbaar of niet geconfigureerd

Actiepunten geïdentificeerd:
- Backend API configuratie voltooien
- OpenAI API key toevoegen aan Railway
- Test meeting met echte API
    `;
    
    setTranscript(demoTranscript);
    
    const localInsights = {
      meetingType: 'technisch overleg',
      summary: `Lokale analyse van ${Math.ceil(sessionDuration / 60)} minuten meeting. Voor geavanceerde inzichten, configureer backend API.`,
      keyDecisions: ['Lokale verwerking gebruikt als fallback', 'Backend API configuratie vereist'],
      actionItems: [
        {
          task: 'Configureer OpenAI API key in Railway environment variables',
          who: 'Administrator',
          when: 'Zo snel mogelijk',
          priority: 'hoog',
          context: 'Backend API heeft geen toegang tot OpenAI zonder API key'
        },
        {
          task: 'Test volledige backend API functionaliteit',
          who: 'Team',
          when: 'Na API configuratie',
          priority: 'gemiddeld',
          context: 'Verificeer dat backend correct communiceert met OpenAI'
        }
      ],
      keyInsights: [
        'Backend server is bereikbaar maar niet volledig geconfigureerd',
        'Audio opname kwaliteit is goed',
        'Frontend-backend communicatie werkt correct'
      ],
      followUpNeeded: [
        'API key configuratie in Railway environment variables',
        'Test verschillende meeting scenarios met volledige API',
        'Monitor API usage en kosten'
      ],
      nextSteps: [
        'Login bij Railway dashboard',
        'Ga naar Variables tab',
        'Voeg OPENAI_API_KEY toe',
        'Test meeting functionaliteit'
      ],
      blockers: [
        'Geen OpenAI API key geconfigureerd in backend',
        'Backend API niet volledig operationeel'
      ],
      participants: ['Onbekend (lokale analyse detecteert geen sprekers)'],
      sentiment: 'neutraal',
      topics: ['Backend configuratie', 'API integratie', 'Deployment setup'],
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
    logDebug('🔄 Processing audio via backend...', { size: audioBlob.size });
    setIsProcessing(true);
    
    try {
      if (isAPIMode && apiStatus.available && apiStatus.hasAPIKey) {
        // API-powered processing
        setProcessingStep('Transcriptie met Whisper AI...');
        const transcriptionResult = await transcribeWithWhisper(audioBlob);
        
        logDebug('📝 Transcript received', transcriptionResult.text?.substring(0, 100) + '...');
        setTranscript(transcriptionResult.text);
        
        setProcessingStep('Analyse met GPT-4...');
        const analysis = await analyzeTranscriptWithGPT4(transcriptionResult.text);
        
        // Combine results
        const finalInsights = {
          ...analysis,
          transcriptionInfo: {
            duration: transcriptionResult.duration,
            language: transcriptionResult.language,
            wordCount: transcriptionResult.wordCount,
            speakingRate: transcriptionResult.duration > 0 ? 
              Math.round(transcriptionResult.wordCount / (transcriptionResult.duration / 60)) : 0
          }
        };
        
        setInsights(finalInsights);
        logDebug('✅ Full API processing completed');
        
      } else {
        // Local fallback
        setProcessingStep('Lokale analyse...');
        await processLocalFallback(audioBlob);
        
        if (!apiStatus.available) {
          setError('Backend API niet bereikbaar. Check Railway deployment.');
        } else if (!apiStatus.hasAPIKey) {
          setError('OpenAI API key niet geconfigureerd in backend. Check Railway environment variables.');
        }
      }
      
    } catch (error) {
      logDebug('❌ Processing failed, trying fallback', error);
      
      if (isAPIMode) {
        setProcessingStep('API fout - fallback naar lokale analyse...');
        await processLocalFallback(audioBlob);
        handleError(error, 'API processing');
      } else {
        handleError(error, 'audio processing');
      }
      
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      setError('');
      setInsights(null);
      setTranscript('');
      
      logDebug('🎙️ Starting recording...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        logDebug('📁 Audio blob created', audioBlob.size);
        await processAudio(audioBlob);
      };
      
      mediaRecorder.start(1000);
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
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        logDebug('🔇 Stopped audio track');
      });
      streamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
      apiStatus: apiStatus,
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
              {apiStatus.available && apiStatus.hasAPIKey && isAPIMode ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Zap className="w-5 h-5" />
                  <span className="text-sm font-medium">AI Ready</span>
                </div>
              ) : apiStatus.available && !apiStatus.hasAPIKey ? (
                <div className="flex items-center space-x-1 text-orange-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">API Key Needed</span>
                </div>
              ) : !apiStatus.available ? (
                <div className="flex items-center space-x-1 text-red-600">
                  <WifiOff className="w-5 h-5" />
                  <span className="text-sm font-medium">Backend Offline</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-gray-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Lokaal</span>
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
            {apiStatus.available && apiStatus.hasAPIKey && isAPIMode
              ? 'Backend API • Whisper transcriptie • GPT-4 analyse • Nederlandse context' 
              : apiStatus.available && !apiStatus.hasAPIKey
              ? 'Backend bereikbaar • Configureer OpenAI API key in Railway environment variables'
              : !apiStatus.available
              ? 'Backend niet bereikbaar • Check Railway deployment status'
              : 'Lokale modus • Beperkte functionaliteit'
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
                  Backend API Status
                </label>
                <div className={`border rounded-lg p-4 ${
                  apiStatus.available && apiStatus.hasAPIKey 
                    ? 'bg-green-50 border-green-200' 
                    : apiStatus.available 
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    {apiStatus.available && apiStatus.hasAPIKey ? (
                      <Zap className="w-5 h-5 text-green-600" />
                    ) : apiStatus.available ? (
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`font-medium ${
                      apiStatus.available && apiStatus.hasAPIKey 
                        ? 'text-green-800' 
                        : apiStatus.available 
                        ? 'text-amber-800'
                        : 'text-red-800'
                    }`}>
                      {apiStatus.available && apiStatus.hasAPIKey 
                        ? 'Backend API volledig operationeel' 
                        : apiStatus.available 
                        ? 'Backend bereikbaar, API key ontbreekt'
                        : 'Backend niet bereikbaar'
                      }
                    </span>
                  </div>
                  <p className={`text-sm ${
                    apiStatus.available && apiStatus.hasAPIKey 
                      ? 'text-green-700' 
                      : apiStatus.available 
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}>
                    {apiStatus.available && apiStatus.hasAPIKey 
                      ? '✅ Whisper transcriptie en GPT-4 analyse beschikbaar'
                      : apiStatus.available 
                      ? '⚠️ Ga naar Railway dashboard → Variables → voeg OPENAI_API_KEY toe'
                      : '❌ Check Railway deployment status en URL configuratie'
                    }
                  </p>
                  <div className="mt-2 text-xs text-slate-600">
                    <div>Backend URL: {API_BASE_URL}</div>
                    <div>Status: {apiStatus.available ? 'Online' : 'Offline'}</div>
                    <div>API Key: {apiStatus.hasAPIKey ? 'Configured' : 'Missing'}</div>
                  </div>
                </div>
              </div>
              
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
                    disabled={!apiStatus.available || !apiStatus.hasAPIKey}
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
                    <div className="text-xs">Fallback</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rest of the component remains the same... */}
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
                {isAPIMode ? 'Backend API' : 'Lokaal'}
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
                  {isAPIMode ? 'Backend API Processing' : 'Lokale Verwerking'}
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
                  {isAPIMode ? 'Backend API' : 'Lokale Modus'}
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
            {!apiStatus.available && (
              <p className="text-sm mt-2">💡 Tip: Check Railway deployment en backend URL configuratie</p>
            )}
            {apiStatus.available && !apiStatus.hasAPIKey && (
              <p className="text-sm mt-2">💡 Tip: Voeg OPENAI_API_KEY toe aan Railway environment variables</p>
            )}
          </div>
        )}

        {/* Rest of the component (transcript, insights, etc.) remains the same */}
        {/* ... */}
      </div>
    </div>
  );
};

export default EVE;
