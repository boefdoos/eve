import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Brain, FileText, CheckCircle, Clock, Target, Download } from 'lucide-react';

const EVE = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [sessionDuration, setSessionDuration] = useState(0);
  
  const recognitionRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Spraakherkenning niet ondersteund. Gebruik Chrome of Edge browser.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'nl-NL';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microfoon toegang geweigerd. Sta toegang toe in je browser.');
        setPermissionStatus('denied');
      } else {
        setError('Spraakherkenning fout: ' + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          console.log('Recognition restart failed:', e);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognition) {
        recognition.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isListening]);

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
      setError('Microfoon toegang is vereist voor EVE.');
    }
  };

  const startListening = () => {
    setError('');
    setInsights(null);
    setTranscript('');
    setSessionActive(true);
    setSessionDuration(0);
    startTimeRef.current = Date.now();
    
    // Start timer
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setSessionDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    
    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch (error) {
      console.error('Error starting recognition:', error);
      setError('Spraakherkenning starten mislukt. Probeer opnieuw.');
      clearInterval(timerRef.current);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    clearInterval(timerRef.current);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Generate insights immediately - NO API CALLS
    if (transcript.trim()) {
      generateLocalInsights(transcript);
    } else {
      setError('Geen spraak gedetecteerd. Probeer opnieuw.');
    }
  };

  const generateLocalInsights = (text) => {
    console.log('Generating local insights for:', text.substring(0, 50) + '...');
    
    // All processing happens locally - no external calls
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const words = text.toLowerCase();
    
    // Nederlandse keyword detectie
    const actionKeywords = {
      'hoog': ['urgent', 'direct', 'onmiddellijk', 'snel', 'belangrijk', 'kritiek', 'prioriteit', 'meteen'],
      'gemiddeld': ['moeten', 'zullen', 'gaan', 'plannen', 'afspreken', 'regelen', 'zorgen', 'doen', 'organiseren', 'voorbereiden', 'maken'],
      'laag': ['overwegen', 'bekijken', 'denken', 'misschien', 'eventueel', 'mogelijk', 'later']
    };
    
    const decisionKeywords = ['beslissen', 'besluiten', 'kiezen', 'akkoord', 'eens', 'vastleggen', 'bepalen', 'afspreken', 'goedkeuren', 'besloten'];
    const timeKeywords = ['morgen', 'overmorgen', 'volgende week', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'weekend', 'einde van de week', 'deadline', 'voor vrijdag', 'deze week', 'volgende maand'];
    const personKeywords = ['ik zal', 'jij gaat', 'hij moet', 'zij zal', 'we moeten', 'jullie gaan', 'team', 'iedereen', 'jan', 'peter', 'marie', 'sarah'];
    const problemKeywords = ['probleem', 'issue', 'blocker', 'uitdaging', 'moeilijk', 'niet mogelijk', 'kan niet', 'gaat niet', 'lukt niet', 'lastig'];
    
    // Extract actiepunten
    const actionItems = [];
    sentences.forEach(sentence => {
      let priority = 'gemiddeld';
      let foundAction = false;
      
      // Check priority
      if (actionKeywords.hoog.some(keyword => sentence.toLowerCase().includes(keyword))) {
        priority = 'hoog';
        foundAction = true;
      } else if (actionKeywords.gemiddeld.some(keyword => sentence.toLowerCase().includes(keyword))) {
        priority = 'gemiddeld';
        foundAction = true;
      } else if (actionKeywords.laag.some(keyword => sentence.toLowerCase().includes(keyword))) {
        priority = 'laag';
        foundAction = true;
      }
      
      if (foundAction && sentence.length > 15) {
        let who = 'te bepalen';
        let when = 'te plannen';
        
        // Find person
        personKeywords.forEach(person => {
          if (sentence.toLowerCase().includes(person)) {
            who = person.split(' ')[0];
          }
        });
        
        // Find time
        timeKeywords.forEach(time => {
          if (sentence.toLowerCase().includes(time)) {
            when = time;
          }
        });
        
        actionItems.push({
          task: sentence.trim(),
          who: who,
          when: when,
          priority: priority
        });
      }
    });

    // Extract beslissingen
    const decisions = sentences.filter(s => 
      decisionKeywords.some(keyword => s.toLowerCase().includes(keyword))
    ).slice(0, 5);

    // Extract inzichten
    const keyInsights = sentences
      .filter(s => s.length > 25 && s.length < 150)
      .filter(s => !actionItems.some(action => action.task === s.trim()))
      .filter(s => !decisions.includes(s))
      .slice(0, 6);

    // Detecteer problemen
    const blockers = sentences.filter(s => 
      problemKeywords.some(keyword => s.toLowerCase().includes(keyword))
    ).slice(0, 4);

    // Volgende stappen
    const nextStepKeywords = ['volgende stap', 'daarna', 'vervolgens', 'dan gaan we', 'volgende keer', 'volgende'];
    const nextSteps = sentences.filter(s => 
      nextStepKeywords.some(keyword => s.toLowerCase().includes(keyword))
    ).slice(0, 5);

    // Meeting type bepalen
    let meetingType = 'overleg';
    if (words.includes('brainstorm') || words.includes('ideeën')) meetingType = 'brainstorm';
    if (decisions.length > 2) meetingType = 'beslissing';
    if (words.includes('update') || words.includes('status')) meetingType = 'update';
    if (actionItems.length > 3) meetingType = 'planning';
    if (words.includes('retrospectief') || words.includes('evaluatie')) meetingType = 'evaluatie';

    const duration = Math.ceil(sessionDuration / 60);
    const wordCount = text.trim().split(/\s+/).length;
    const summary = `${duration} minuten ${meetingType} met ${sentences.length} hoofdpunten besproken. ${actionItems.length} actiepunten geïdentificeerd${decisions.length > 0 ? ` en ${decisions.length} beslissingen genomen` : ''}.`;

    // Follow-up bepalen
    const followUpNeeded = [];
    if (actionItems.some(item => item.who === 'te bepalen')) {
      followUpNeeded.push('Verantwoordelijken toewijzen voor actiepunten');
    }
    if (actionItems.some(item => item.when === 'te plannen')) {
      followUpNeeded.push('Deadlines bepalen voor actiepunten');
    }
    if (blockers.length > 0) {
      followUpNeeded.push('Oplossingen bespreken voor genoemde problemen');
    }

    const insightsData = {
      meetingType,
      summary,
      keyDecisions: decisions.length > 0 ? decisions : ['Geen expliciete beslissingen gedetecteerd'],
      actionItems: actionItems.length > 0 ? actionItems.slice(0, 8) : [
        { task: 'Actiepunten uit gesprek verduidelijken', who: 'team', when: 'voor volgende meeting', priority: 'gemiddeld' }
      ],
      keyInsights: keyInsights.length > 0 ? keyInsights : ['Gesprek bevat waardevolle informatie voor verdere uitwerking'],
      followUpNeeded: followUpNeeded.length > 0 ? followUpNeeded : ['Follow-up bepalen na review'],
      participants: [`${Math.max(1, personKeywords.filter(p => words.includes(p.split(' ')[0])).length)} sprekers gedetecteerd`],
      nextSteps: nextSteps.length > 0 ? nextSteps : ['Volgende stappen plannen'],
      blockers: blockers,
      stats: {
        wordCount: wordCount,
        sentences: sentences.length,
        actionItems: actionItems.length,
        decisions: decisions.length,
        duration: sessionDuration,
        speakingRate: sessionDuration > 0 ? Math.round(wordCount / (sessionDuration / 60)) : 0
      }
    };

    console.log('Generated insights:', insightsData);
    setInsights(insightsData);
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

  const exportInsights = () => {
    if (!insights) return;
    
    const exportData = {
      datum: new Date().toLocaleDateString('nl-NL'),
      tijd: new Date().toLocaleTimeString('nl-NL'),
      duur: formatTime(sessionDuration),
      meetingType: insights.meetingType,
      samenvatting: insights.summary,
      actiepunten: insights.actionItems,
      beslissingen: insights.keyDecisions,
      inzichten: insights.keyInsights,
      volgendeStappen: insights.nextSteps,
      aandachtspunten: insights.blockers,
      followUp: insights.followUpNeeded,
      statistieken: insights.stats,
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
          </div>
          <p className="text-xl text-slate-600 font-light">Slimme Meeting Assistent</p>
          <p className="text-sm text-slate-500 mt-2">
            Nederlandse spraakherkenning • 100% lokaal • Geen kosten
          </p>
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
                <>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-slate-600">Luistert</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {transcript.trim().split(' ').filter(w => w.length > 0).length} woorden
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Button */}
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
              className="w-64 h-64 rounded-full bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center group"
            >
              <div className="text-center">
                <MicOff className="w-16 h-16 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-light">Stop & Analyseer</span>
              </div>
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700 text-center">
            <p>{error}</p>
            <p className="text-sm mt-2">💡 Tip: EVE werkt het beste in Chrome of Edge</p>
          </div>
        )}

        {/* Live Transcript */}
        {sessionActive && transcript && (
          <div className="mb-8 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Mic className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-medium text-slate-700">Live Transcriptie</h3>
              <span className="text-sm text-slate-500">
                ({transcript.trim().split(' ').filter(w => w.length > 0).length} woorden)
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 max-h-32 overflow-y-auto">
              <p className="text-slate-600 text-sm leading-relaxed">
                {transcript || 'Wachten op spraak...'}
              </p>
            </div>
          </div>
        )}

        {/* Insights Results */}
        {insights && (
          <div className="space-y-6 mb-8">
            {/* Summary */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Brain className="w-6 h-6 text-blue-500" />
                  <h2 className="text-xl font-medium text-slate-800">Meeting Analyse</h2>
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
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">{insights.stats?.wordCount || 0}</div>
                  <div className="text-slate-600">Woorden</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">{insights.stats?.actionItems || 0}</div>
                  <div className="text-slate-600">Acties</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">{insights.stats?.decisions || 0}</div>
                  <div className="text-slate-600">Beslissingen</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">{formatTime(insights.stats?.duration || 0)}</div>
                  <div className="text-slate-600">Duur</div>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <div className="font-medium text-slate-800">{insights.stats?.speakingRate || 0}</div>
                  <div className="text-slate-600">WPM</div>
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
                          <div className="flex items-center space-x-4 text-sm text-slate-600">
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

            {/* Grid voor Beslissingen & Inzichten */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Beslissingen */}
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

              {/* Inzichten */}
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

            {/* Follow-up & Volgende Stappen */}
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

            {/* Actie Buttons */}
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
              Klik op "Start Meeting" en begin te praten. EVE luistert automatisch mee en 
              identificeert actiepunten, beslissingen en belangrijke inzichten.
            </p>
            <div className="grid grid-cols-3 gap-6 text-xs">
              <div className="text-center">
                <Brain className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                <p className="font-medium">Slimme AI</p>
                <p className="text-slate-400">Detecteert automatisch</p>
              </div>
              <div className="text-center">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p className="font-medium">Gratis</p>
                <p className="text-slate-400">Geen kosten</p>
              </div>
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                <p className="font-medium">Privé</p>
                <p className="text-slate-400">100% lokaal</p>
              </div>
            </div>
          </div>
        )}

        {/* Permission Modal */}
        {showPermissionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6">
                  <Mic className="w-8 h-8 text-blue-600" />
                </div>
                
                <h3 className="text-xl font-semibold text-slate-800 mb-4">
                  Microfoon Toegang Vereist
                </h3>
                
                <p className="text-slate-600 mb-6 leading-relaxed">
                  EVE heeft toegang tot je microfoon nodig om meetings te analyseren. 
                  Audio wordt lokaal verwerkt en verlaat nooit je browser.
                </p>

                {permissionStatus === 'denied' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                    <p className="text-amber-800 text-sm">
                      Microfoon toegang werd geweigerd. Klik op het 🎤 icoon in je adresbalk om toegang toe te staan.
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
