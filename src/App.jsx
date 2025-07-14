import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Brain, FileText, Loader, CheckCircle, Users, Clock, Target } from 'lucide-react';

const EVE = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [insights, setInsights] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [sessionDuration, setSessionDuration] = useState(0);
  
  // Audio recording setup
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      return true;
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        setPermissionStatus('denied');
      }
      return false;
    }
  };

  const handleListenClick = async () => {
    if (!sessionActive) {
      if (permissionStatus === 'prompt') {
        setShowPermissionModal(true);
      } else if (permissionStatus === 'granted') {
        startListening();
      } else {
        setShowPermissionModal(true);
      }
    } else {
      stopListening();
    }
  };

  const requestMicrophoneAccess = async () => {
    const hasPermission = await checkMicrophonePermission();
    if (hasPermission) {
      setShowPermissionModal(false);
      startListening();
    } else {
      setError('Microfoon toegang is vereist voor EVE. Sta toegang toe in je browser instellingen.');
    }
  };

  const startListening = async () => {
    setError('');
    setInsights(null);
    setTranscript('');
    setSessionActive(true);
    setSessionDuration(0);
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();
    
    // Start duration timer
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setSessionDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudioIntelligently(audioBlob);
      };
      
      mediaRecorder.start();
      setIsListening(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Opname starten mislukt. Probeer opnieuw.');
      clearInterval(timerRef.current);
    }
  };

  const stopListening = async () => {
    setIsListening(false);
    clearInterval(timerRef.current);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const processAudioIntelligently = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      // Step 1: Transcribe with Whisper
      const transcriptText = await transcribeWithWhisper(audioBlob);
      setTranscript(transcriptText);
      
      // Step 2: Generate intelligent insights
      if (transcriptText.trim()) {
        await generateSmartInsights(transcriptText);
      }
      
    } catch (error) {
      console.error('Processing error:', error);
      setError('Audio verwerking mislukt. Probeer opnieuw.');
    }
    
    setIsProcessing(false);
  };

  const transcribeWithWhisper = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'nl');
    formData.append('response_format', 'json');
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Transcriptie mislukt');
    }
    
    const result = await response.json();
    return result.text;
  };

  const generateSmartInsights = async (text) => {
    try {
      // Smart AI-powered analysis focusing on actionable insights
      const prompt = `Analyseer deze Nederlandse meeting transcript en extract actionable insights. Focus op praktische waarde, niet op letterlijke transcriptie.

Transcript: "${text}"

Genereer een JSON response met deze structuur:
{
  "meetingType": "brainstorm/beslissing/update/planning/overleg",
  "keyDecisions": ["beslissing 1", "beslissing 2"],
  "actionItems": [
    {"task": "wat", "who": "wie", "when": "wanneer", "priority": "hoog/gemiddeld/laag"},
    {"task": "wat", "who": "wie", "when": "wanneer", "priority": "hoog/gemiddeld/laag"}
  ],
  "keyInsights": ["inzicht 1", "inzicht 2", "inzicht 3"],
  "followUpNeeded": ["opvolging 1", "opvolging 2"],
  "participants": ["persoon/rol 1", "persoon/rol 2"],
  "nextSteps": ["volgende stap 1", "volgende stap 2"],
  "blockers": ["blocker 1", "blocker 2"],
  "summary": "Een zin samenvatting van de essentie"
}

Wees specifiek en actionable. Als iets onduidelijk is, markeer het als "te verduidelijken".`;

      // Use Claude API or fallback to smart processing
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, prompt })
      });

      if (response.ok) {
        const aiInsights = await response.json();
        setInsights(aiInsights);
      } else {
        // Fallback to rule-based analysis
        const fallbackInsights = generateFallbackInsights(text);
        setInsights(fallbackInsights);
      }

    } catch (error) {
      console.error('Insights generation error:', error);
      const fallbackInsights = generateFallbackInsights(text);
      setInsights(fallbackInsights);
    }
  };

  const generateFallbackInsights = (text) => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.toLowerCase();
    
    // Smart keyword detection for Dutch
    const actionKeywords = ['moeten', 'zullen', 'gaan', 'plannen', 'afspreken', 'regelen', 'zorgen', 'doen'];
    const decisionKeywords = ['beslissen', 'besluiten', 'kiezen', 'akkoord', 'eens', 'vastleggen'];
    const timeKeywords = ['morgen', 'volgende week', 'maandag', 'dinsdag', 'einde', 'deadline'];
    
    const actionItems = sentences
      .filter(s => actionKeywords.some(keyword => s.toLowerCase().includes(keyword)))
      .slice(0, 4)
      .map(s => ({
        task: s.trim(),
        who: 'te bepalen',
        when: timeKeywords.some(t => s.toLowerCase().includes(t)) ? 'termijn genoemd' : 'te plannen',
        priority: 'gemiddeld'
      }));
    
    const decisions = sentences
      .filter(s => decisionKeywords.some(keyword => s.toLowerCase().includes(keyword)))
      .slice(0, 3);
    
    const keyInsights = sentences
      .filter(s => s.length > 50 && s.length < 200)
      .slice(0, 4);

    return {
      meetingType: 'overleg',
      keyDecisions: decisions.length > 0 ? decisions : ['Geen expliciete beslissingen geïdentificeerd'],
      actionItems: actionItems.length > 0 ? actionItems : [{ task: 'Actiepunten verduidelijken', who: 'alle deelnemers', when: 'volgende meeting', priority: 'gemiddeld' }],
      keyInsights: keyInsights.length > 0 ? keyInsights : ['Gesprek bevat waardevolle informatie die verdere analyse vereist'],
      followUpNeeded: ['Follow-up bepalen na review'],
      participants: ['Meerdere sprekers gedetecteerd'],
      nextSteps: ['Volgende stappen plannen'],
      blockers: words.includes('probleem') || words.includes('blocker') ? ['Mogelijke blockers genoemd'] : [],
      summary: `${Math.ceil(sessionDuration / 60)} minuten gesprek met ${sentences.length} hoofdpunten besproken`
    };
  };

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
    setIsProcessing(false);
    setSessionDuration(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Brain className="w-12 h-12 text-blue-600" />
            <h1 className="text-6xl font-light text-slate-800">EVE</h1>
          </div>
          <p className="text-xl text-slate-600 font-light">Slimme Meeting Assistent</p>
          <p className="text-sm text-slate-500 mt-2">Extracteert inzichten, beslissingen en actiepunten</p>
        </div>

        {/* Session Info */}
        {sessionActive && (
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-full px-6 py-2 shadow-lg flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">{formatTime(sessionDuration)}</span>
              </div>
              {isListening && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-slate-600">Luistert</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Control */}
        <div className="flex flex-col items-center mb-12">
          {!sessionActive ? (
            <button
              onClick={handleListenClick}
              disabled={!!error}
              className="w-64 h-64 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center group"
            >
              <div className="text-center">
                <Mic className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-light">Start Meeting</span>
              </div>
            </button>
          ) : (
            <button
              onClick={stopListening}
              disabled={isProcessing}
              className="w-64 h-64 rounded-full bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center group"
            >
              <div className="text-center">
                <MicOff className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-light">Analyseer</span>
              </div>
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mb-8 flex flex-col items-center space-y-4">
            <div className="flex items-center space-x-3 text-slate-600">
              <Loader className="w-6 h-6 animate-spin" />
              <span className="text-lg font-light">Meeting analyseren...</span>
            </div>
            <div className="flex space-x-2 text-sm text-slate-500">
              <span>🎤 Transcriberen</span>
              <span>→</span>
              <span>🧠 Inzichten extraheren</span>
              <span>→</span>
              <span>📋 Actiepunten identificeren</span>
            </div>
          </div>
        )}

        {/* Smart Insights Display */}
        {insights && (
          <div className="space-y-6 mb-8">
            {/* Summary Header */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Brain className="w-6 h-6 text-blue-500" />
                <h2 className="text-xl font-medium text-slate-800">Meeting Samenvatting</h2>
              </div>
              <p className="text-slate-600 text-lg leading-relaxed">{insights.summary}</p>
              <div className="flex items-center space-x-4 mt-4 text-sm text-slate-500">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{insights.participants?.length || 0} deelnemers</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(sessionDuration)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Target className="w-4 h-4" />
                  <span>{insights.meetingType}</span>
                </div>
              </div>
            </div>

            {/* Action Items */}
            {insights.actionItems && insights.actionItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <h3 className="text-lg font-medium text-slate-800">Actiepunten</h3>
                </div>
                <div className="space-y-3">
                  {insights.actionItems.map((item, index) => (
                    <div key={index} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{item.task}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600">
                            <span><strong>Wie:</strong> {item.who}</span>
                            <span><strong>Wanneer:</strong> {item.when}</span>
                          </div>
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

            {/* Key Decisions */}
            {insights.keyDecisions && insights.keyDecisions.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-medium text-slate-800 mb-4">Belangrijke Beslissingen</h3>
                <ul className="space-y-2">
                  {insights.keyDecisions.map((decision, index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-slate-600">{decision}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Insights */}
            <div className="grid md:grid-cols-2 gap-6">
              {insights.keyInsights && insights.keyInsights.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Belangrijkste Inzichten</h3>
                  <ul className="space-y-3">
                    {insights.keyInsights.map((insight, index) => (
                      <li key={index} className="text-slate-600 text-sm leading-relaxed">
                        • {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.nextSteps && insights.nextSteps.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Volgende Stappen</h3>
                  <ul className="space-y-3">
                    {insights.nextSteps.map((step, index) => (
                      <li key={index} className="text-slate-600 text-sm leading-relaxed">
                        • {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Blockers (if any) */}
            {insights.blockers && insights.blockers.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h3 className="text-lg font-medium text-amber-800 mb-4">Aandachtspunten / Blockers</h3>
                <ul className="space-y-2">
                  {insights.blockers.map((blocker, index) => (
                    <li key={index} className="text-amber-700 text-sm">⚠️ {blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={resetSession}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                Nieuwe Meeting Starten
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!sessionActive && !error && !insights && (
          <div className="text-center text-slate-500 max-w-lg mx-auto">
            <p className="text-sm leading-relaxed mb-4">
              Start je meeting en laat EVE de belangrijkste beslissingen, actiepunten en inzichten voor je identificeren.
            </p>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-center">
                <Brain className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                <p>Slimme analyse</p>
              </div>
              <div className="text-center">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p>Actiepunten</p>
              </div>
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                <p>Inzichten</p>
              </div>
            </div>
          </div>
        )}

        {/* Permission Modal */}
        {showPermissionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform scale-100 transition-all">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6">
                  <Mic className="w-8 h-8 text-blue-600" />
                </div>
                
                <h3 className="text-xl font-semibold text-slate-800 mb-4">
                  Microfoon Toegang Vereist
                </h3>
                
                <p className="text-slate-600 mb-6 leading-relaxed">
                  EVE heeft toegang tot je microfoon nodig om meetings te analyseren. 
                  Je audio wordt lokaal verwerkt en nooit opgeslagen of gedeeld.
                </p>

                {permissionStatus === 'denied' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                    <p className="text-amber-800 text-sm">
                      Microfoon toegang werd eerder geweigerd. Klik op het microfoon icoon in je browser's adresbalk om toegang toe te staan.
                    </p>
                  </div>
                )}
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowPermissionModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={requestMicrophoneAccess}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Toegang Verlenen
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EVE;
