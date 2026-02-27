
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import Layout from './/Layout';
import { gemini } from './geminiService';
import { HistoryItem, DialogueType, VoiceGender, Flashcard, Dialect, ChatMessage, SessionState } from './types';
import AudioPlayer from './/AudioPlayer';
import { createPcmBlob, decode, decodeAudioData, blobToBase64 } from './audioUtils';

const App: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState('home');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('جاري المعالجة...');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedDialect, setSelectedDialect] = useState<Dialect>('standard');
  
  // States for tools
  const [assistantResponse, setAssistantResponse] = useState<{ text: string, audio?: string, showGenderMenu?: boolean, sources?: any[] } | null>(null);
  const [ttsAudio, setTtsAudio] = useState<string | null>(null);
  const [podcastData, setPodcastData] = useState<{ audio: string, dialogue: string } | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [explainerResponse, setExplainerResponse] = useState<{ text: string, audio?: string, showGenderMenu?: boolean, sources?: any[] } | null>(null);
  const [analyzerResponse, setAnalyzerResponse] = useState<{ text: string, audio?: string } | null>(null);
  const [analyzerChatHistory, setAnalyzerChatHistory] = useState<ChatMessage[]>([]);
  const [analyzerFile, setAnalyzerFile] = useState<{ base64: string, type: string, name: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Group Study States
  const [session, setSession] = useState<SessionState>({
    roomId: null,
    isHost: false,
    connected: false,
    messages: [],
    callState: 'idle'
  });
  const [showChat, setShowChat] = useState(false);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  
  const isSyncingRef = useRef(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // PeerJS Initialization
  useEffect(() => {
    const randomId = Math.floor(100000 + Math.random() * 900000).toString();
    const peer = new Peer(randomId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID:', id);
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      setupConnection(conn);
    });

    peer.on('call', (call) => {
      callRef.current = call;
      setSession(prev => ({ ...prev, callState: 'incoming' }));
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setSession(prev => ({ ...prev, connected: true, roomId: conn.peer }));
      setError("تم الاتصال بصديقك بنجاح!");
    });

    conn.on('data', (data: any) => {
      handleIncomingData(data);
    });

    conn.on('close', () => {
      setSession(prev => ({ ...prev, connected: false }));
      setError("انقطع الاتصال بصديقك.");
    });
  };

  const handleIncomingData = (data: any) => {
    if (data.type === 'chat') {
      setSession(prev => ({
        ...prev,
        messages: [...prev.messages, { sender: 'peer', text: data.text, timestamp: Date.now() }]
      }));
      if (!showChat) setShowChat(true);
    } else if (data.type === 'sync-assistant') {
      setAssistantResponse(data.payload);
    } else if (data.type === 'sync-explainer') {
      setExplainerResponse(data.payload);
    } else if (data.type === 'sync-analyzer') {
      if (data.payload.file) setAnalyzerFile(data.payload.file);
      if (data.payload.history) setAnalyzerChatHistory(data.payload.history);
      if (data.payload.response) setAnalyzerResponse(data.payload.response);
    } else if (data.type === 'sync-flashcards') {
      setFlashcards(data.payload);
    } else if (data.type === 'sync-podcast') {
      setPodcastData(data.payload);
    }
  };

  const createGroupSession = () => {
    if (peerRef.current) {
      const id = peerRef.current.id;
      setSession(prev => ({ ...prev, roomId: id, isHost: true, connected: false }));
    }
  };

  const joinGroupSession = (code: string) => {
    if (!code || code.length < 5) {
      handleError({ message: "يرجى إدخال كود صحيح." });
      return;
    }
    if (peerRef.current) {
      const conn = peerRef.current.connect(code);
      connRef.current = conn;
      setupConnection(conn);
    }
  };

  const sendDirectMessage = (text: string) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'chat', text });
      setSession(prev => ({
        ...prev,
        messages: [...prev.messages, { sender: 'me', text, timestamp: Date.now() }]
      }));
    }
  };

  // Syncing logic for tools
  useEffect(() => {
    if (connRef.current && connRef.current.open) {
      if (activeFeature === 'assistant' && assistantResponse) {
        connRef.current.send({ type: 'sync-assistant', payload: assistantResponse });
      }
    }
  }, [assistantResponse, activeFeature]);

  useEffect(() => {
    if (connRef.current && connRef.current.open) {
      if (activeFeature === 'explainer' && explainerResponse) {
        connRef.current.send({ type: 'sync-explainer', payload: explainerResponse });
      }
    }
  }, [explainerResponse, activeFeature]);

  useEffect(() => {
    if (connRef.current && connRef.current.open) {
      if (activeFeature === 'analyzer') {
        connRef.current.send({ 
          type: 'sync-analyzer', 
          payload: { file: analyzerFile, history: analyzerChatHistory, response: analyzerResponse } 
        });
      }
    }
  }, [analyzerFile, analyzerChatHistory, analyzerResponse, activeFeature]);

  useEffect(() => {
    if (connRef.current && connRef.current.open) {
      if (activeFeature === 'flashcards' && flashcards.length > 0) {
        connRef.current.send({ type: 'sync-flashcards', payload: flashcards });
      }
    }
  }, [flashcards, activeFeature]);

  useEffect(() => {
    if (connRef.current && connRef.current.open) {
      if (activeFeature === 'podcast' && podcastData) {
        connRef.current.send({ type: 'sync-podcast', payload: podcastData });
      }
    }
  }, [podcastData, activeFeature]);

  const initiateCall = async () => {
    if (peerRef.current && session.roomId && session.connected) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const call = peerRef.current.call(session.roomId, stream);
        callRef.current = call;
        setSession(prev => ({ ...prev, callState: 'calling' }));
        
        call.on('stream', (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            setSession(prev => ({ ...prev, callState: 'connected' }));
          }
        });
      } catch (err) {
        handleError(err);
      }
    }
  };

  const acceptCall = async () => {
    if (callRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        callRef.current.answer(stream);
        setSession(prev => ({ ...prev, callState: 'connected' }));
        
        callRef.current.on('stream', (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
          }
        });
      } catch (err) {
        handleError(err);
      }
    }
  };

  const rejectCall = () => {
    if (callRef.current) {
      callRef.current.close();
      setSession(prev => ({ ...prev, callState: 'idle' }));
    }
  };

  const endCall = () => {
    if (callRef.current) {
      callRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setSession(prev => ({ ...prev, callState: 'idle' }));
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleSpeaker = async () => {
    if (remoteAudioRef.current) {
      // Note: setSinkId is not supported in all browsers (mostly Chrome/Edge)
      // and switching between earpiece/speaker is complex in web.
      // We'll simulate it by adjusting volume or using the API if available.
      const audio = remoteAudioRef.current as any;
      if (audio.setSinkId) {
        try {
          // This is a placeholder for actual device selection logic
          // In a real app, you'd enumerate devices and pick the right one.
          // For now, we'll just toggle the state.
          setIsSpeakerOn(!isSpeakerOn);
        } catch (e) {
          console.error("Failed to set sink id", e);
        }
      } else {
        setIsSpeakerOn(!isSpeakerOn);
      }
    }
  };

  const handleError = (err: any) => {
    console.error("API Error:", err);
    setError(err.message || "حدث خطأ غير متوقع في الاتصال بالخدمة.");
    setTimeout(() => setError(null), 6000);
    setLoading(false);
  };

  const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    };
    setHistory(prev => [...prev, newItem]);
  };

  // --- Live API Logic ---
  const startLiveConversation = async (customInstruction?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });

      const session = await gemini.connectLive({
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBase64 = createPcmBlob(inputData);
            if (liveSessionRef.current) {
              liveSessionRef.current.sendRealtimeInput({ 
                media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } 
              });
            }
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);
          setLiveActive(true);
        },
        onmessage: async (msg: any) => {
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData && outputAudioContextRef.current) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
            const buffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
            const source = outputAudioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(outputAudioContextRef.current.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
            source.onended = () => sourcesRef.current.delete(source);
          }
          if (msg.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onclose: () => {
          setLiveActive(false);
          cleanupLive();
        },
        onerror: (e: any) => {
          handleError(e);
          setLiveActive(false);
          cleanupLive();
        },
      }, selectedDialect, customInstruction);
      
      liveSessionRef.current = session;
    } catch (err) {
      handleError(err);
    }
  };

  const cleanupLive = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const stopLiveConversation = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
    }
    setLiveActive(false);
    cleanupLive();
  };

  // --- Feature Handlers ---
  const handleAssistant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const promptElement = form.elements.namedItem('prompt') as HTMLInputElement;
    const prompt = promptElement.value;
    setLoading(true);
    setLoadingMessage('جاري البحث والتحليل بالذكاء الاصطناعي...');
    setAssistantResponse(null);
    try {
      const result = await gemini.askAssistant(prompt);
      setAssistantResponse({ text: result.text, sources: result.sources });
      addToHistory({ title: `مساعد: ${prompt}`, type: 'assistant', content: result });
      promptElement.value = '';
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handleTTS = async (text: string, gender: VoiceGender, target: 'assistant' | 'explainer' | 'analyzer' | 'standalone') => {
    setLoading(true);
    setLoadingMessage('جاري توليد الصوت الفاخر...');
    try {
      const audio = await gemini.generateTTS(text, gender, selectedDialect);
      if (audio) {
        if (target === 'assistant') setAssistantResponse(prev => prev ? { ...prev, audio, showGenderMenu: false } : null);
        else if (target === 'explainer') setExplainerResponse(prev => prev ? { ...prev, audio, showGenderMenu: false } : null);
        else if (target === 'analyzer') setAnalyzerResponse(prev => prev ? { ...prev, audio } : null);
        else setTtsAudio(audio);
        
        if (target === 'standalone') {
          addToHistory({ title: `تحويل نص: ${text.substring(0, 20)}...`, type: 'tts', content: audio });
        }
      }
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handleAnalyzer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const promptElement = form.elements.namedItem('prompt') as HTMLInputElement;
    const prompt = promptElement.value;
    
    if (!fileInput.files?.[0]) {
      setError("يرجى اختيار ملف أولاً.");
      return;
    }
    const file = fileInput.files[0];

    if (file.size > 4 * 1024 * 1024) {
      setError("حجم الملف كبير جداً. يرجى اختيار ملف أقل من 4 ميجابايت لضمان سرعة المزامنة.");
      return;
    }
    
    setLoading(true);
    setLoadingMessage('جاري رفع ومعالجة الملف...');
    setUploadingFile(true);
    setAnalyzerResponse(null);
    setAnalyzerChatHistory([]);
    try {
      const base64 = await blobToBase64(file);
      const fileInfo = { base64, type: file.type, name: file.name };
      setAnalyzerFile(fileInfo);
      setUploadingFile(false);
      
      setLoadingMessage('جاري تحليل المحتوى بالذكاء الاصطناعي...');
      const result = await gemini.analyzeFileChat(base64, file.type, file.name, prompt, []);
      setAnalyzerResponse({ text: result });
      
      const newHistory: ChatMessage[] = [
        { role: 'user', parts: [{ text: prompt }, { text: '', inlineData: { data: base64, mimeType: file.type } }] },
        { role: 'model', parts: [{ text: result }] }
      ];
      setAnalyzerChatHistory(newHistory);

      // Sync to peer immediately
      if (session.roomId && session.connected) {
        socketRef.current?.emit('sync-analyzer', { 
          roomId: session.roomId, 
          data: { file: fileInfo, history: newHistory, response: { text: result } } 
        });
      }
      
      addToHistory({ title: `تحليل: ${file.name}`, type: 'analyzer', content: { text: result, history: newHistory, file: fileInfo } });
      promptElement.value = '';
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handleAnalyzerChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!analyzerFile) return;
    
    const form = e.currentTarget;
    const promptElement = form.elements.namedItem('prompt') as HTMLInputElement;
    const prompt = promptElement.value;
    
    setLoading(true);
    setLoadingMessage('جاري تحليل سؤالك حول الملف...');
    try {
      const result = await gemini.analyzeFileChat(
        analyzerFile.base64, 
        analyzerFile.type, 
        analyzerFile.name, 
        prompt, 
        analyzerChatHistory
      );
      
      const newHistory: ChatMessage[] = [
        ...analyzerChatHistory,
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: result }] }
      ];
      
      setAnalyzerChatHistory(newHistory);
      setAnalyzerResponse({ text: result });
      
      // Update history item if it exists
      setHistory(prev => prev.map(item => {
        if (item.type === 'analyzer' && item.content.file?.name === analyzerFile.name) {
          return { ...item, content: { ...item.content, text: result, history: newHistory } };
        }
        return item;
      }));
      
      promptElement.value = '';
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handlePodcast = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const textElement = form.elements.namedItem('text') as HTMLTextAreaElement;
    const text = textElement.value;
    const type = (form.elements.namedItem('type') as HTMLSelectElement).value as DialogueType;
    setLoading(true);
    setLoadingMessage('جاري كتابة سيناريو البودكاست...');
    setPodcastData(null);
    try {
      const dialogue = await gemini.generatePodcastDialogue(text, type);
      setLoadingMessage('جاري تحويل السيناريو لصوت بشري...');
      const audio = await gemini.generateMultiSpeakerTTS(dialogue, selectedDialect);
      if (audio) {
        setPodcastData({ audio, dialogue });
        addToHistory({ title: `بودكاست: ${text.substring(0, 20)}...`, type: 'podcast', content: { audio, dialogue } });
        textElement.value = '';
      }
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handleFlashcards = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const textElement = form.elements.namedItem('text') as HTMLTextAreaElement;
    const text = textElement.value;
    const count = parseInt((form.elements.namedItem('count') as HTMLInputElement).value);
    setLoading(true);
    setLoadingMessage('جاري استخراج البطاقات التعليمية...');
    setFlashcards([]);
    try {
      const cards = await gemini.generateFlashcards(text, count);
      setFlashcards(cards);
      addToHistory({ title: `بطاقات: ${text.substring(0, 20)}...`, type: 'flashcards', content: cards });
      textElement.value = '';
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const handleExplainer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const topicElement = form.elements.namedItem('topic') as HTMLInputElement;
    const topic = topicElement.value;
    setLoading(true);
    setLoadingMessage('جاري تحضير الشرح المفصل...');
    setExplainerResponse(null);
    try {
      const result = await gemini.explainLesson(topic);
      setExplainerResponse({ text: result.text, sources: result.sources });
      addToHistory({ title: `شرح: ${topic}`, type: 'explainer', content: result });
      topicElement.value = '';
    } catch (err) { handleError(err); }
    setLoading(false);
  };

  const renderSources = (sources?: any[]) => {
    if (!sources || sources.length === 0) return null;
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">المصادر المرجعية:</p>
        <div className="flex flex-wrap gap-2">
          {sources.map((chunk, i) => (
            <a 
              key={i} 
              href={chunk.web?.uri || chunk.maps?.uri} 
              target="_blank" 
              rel="noreferrer"
              className="text-[10px] bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-link text-[8px]"></i>
              <span className="max-w-[120px] truncate font-bold">{chunk.web?.title || chunk.maps?.title || 'رابط خارجي'}</span>
            </a>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout 
      activeFeature={activeFeature} 
      setActiveFeature={(feat) => {
        if (liveActive) stopLiveConversation();
        setActiveFeature(feat);
        setAssistantResponse(null);
        setTtsAudio(null);
        setPodcastData(null);
        setFlashcards([]);
        setExplainerResponse(null);
        setAnalyzerResponse(null);
        setAnalyzerChatHistory([]);
        setAnalyzerFile(null);
      }} 
      history={history} 
      onHistoryClick={(item) => {
        if (liveActive) stopLiveConversation();
        setActiveFeature(item.type);
        if (item.type === 'assistant') setAssistantResponse(item.content);
        if (item.type === 'tts') setTtsAudio(item.content);
        if (item.type === 'podcast') setPodcastData(item.content);
        if (item.type === 'flashcards') setFlashcards(item.content);
        if (item.type === 'explainer') setExplainerResponse(item.content);
        if (item.type === 'analyzer') {
          setAnalyzerResponse(item.content);
          setAnalyzerChatHistory(item.content.history || []);
          setAnalyzerFile(item.content.file || null);
        }
      }} 
      onClearHistory={() => {
        if (confirm("سيتم حذف كل السجل، هل أنت متأكد؟")) {
          setHistory([]);
          localStorage.removeItem('elearning_history');
        }
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFeature}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full"
        >
          {/* Error Notification */}
          {error && (
            <div className="fixed top-24 left-4 right-4 md:left-auto md:w-96 bg-red-600 text-white p-4 rounded-2xl shadow-2xl z-[60] animate-slideUp flex items-center justify-between border-2 border-white/20">
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-circle-exclamation text-xl"></i>
                <span className="text-sm font-bold leading-tight">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 active:scale-90 rounded-lg transition-transform"><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}

          {/* Global Dialect Selector */}
          {activeFeature !== 'home' && activeFeature !== 'flashcards' && activeFeature !== 'group' && (
            <div className="max-w-2xl mx-auto mb-12 bg-white/[0.03] backdrop-blur-3xl p-5 md:p-8 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col md:flex-row items-center justify-between gap-6 sticky top-24 z-20 animate-slideUp">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-xl">
                  <i className="fa-solid fa-language text-lg"></i>
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[10px] text-white/30 uppercase tracking-[0.2em]">تخصيص التجربة</span>
                  <span className="font-black text-sm text-white">اختر اللهجة المفضلة</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {(['standard', 'egyptian', 'saudi', 'lebanese', 'maghrebi'] as Dialect[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDialect(d)}
                    disabled={liveActive}
                    className={`px-4 md:px-5 py-2.5 rounded-2xl text-[10px] md:text-[11px] font-black transition-all border tracking-widest uppercase ${
                      selectedDialect === d 
                        ? 'bg-white text-black border-white shadow-[0_10px_20px_rgba(255,255,255,0.1)] active:scale-95' 
                        : 'bg-white/5 text-white/30 border-white/5 hover:border-white/20 hover:bg-white/10 active:scale-95'
                    } ${liveActive ? 'opacity-40' : ''}`}
                  >
                    {d === 'standard' && 'الفصحى'}
                    {d === 'egyptian' && 'المصرية'}
                    {d === 'saudi' && 'السعودية'}
                    {d === 'lebanese' && 'اللبنانية'}
                    {d === 'maghrebi' && 'المغربية'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* HOME PAGE - Bento Grid */}
          {activeFeature === 'home' && (
            <div className="space-y-20">
              {/* Hero Section */}
              <div className="text-center space-y-8 max-w-4xl mx-auto py-20">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-3 bg-white/5 text-white/50 px-8 py-3 rounded-full text-[11px] font-black tracking-[0.3em] uppercase mb-10 border border-white/10 backdrop-blur-xl"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                  </span>
                  مستقبلك يبدأ هنا
                </motion.div>
                <h2 className="text-6xl md:text-[10vw] font-black text-white leading-[0.85] tracking-tighter font-serif italic mb-10">
                  تعلم بـ<span className="text-indigo-500">ذكاء</span> <br />
                  <span className="text-white/10">تطور بسرعة</span>
                </h2>
                <p className="text-white/40 text-xl md:text-2xl font-medium max-w-3xl mx-auto leading-relaxed px-4">
                  اكتشف قوة الذكاء الاصطناعي في رحلتك التعليمية. أدوات متقدمة مصممة خصيصاً لتسهيل الفهم والتحصيل العلمي.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-8">
                <div className="md:col-span-3 lg:col-span-2">
                  <FeatureCard 
                    title="المساعد الشخصي" 
                    desc="اسأل أي سؤال علمي مع ميزة البحث الذكي في الويب." 
                    icon="fa-robot" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('assistant')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-3 lg:col-span-2">
                  <FeatureCard 
                    title="تحويل النص لصوت" 
                    desc="حول نصوصك لصوت طبيعي بلهجات عربية متنوعة." 
                    icon="fa-volume-high" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('tts')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-6 lg:col-span-2">
                  <FeatureCard 
                    title="بودكاست تعليمي" 
                    desc="حول دروسك لحوار ممتع ومسموع بين خبير ومتعلم." 
                    icon="fa-podcast" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('podcast')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <FeatureCard 
                    title="بطاقات تعليمية" 
                    desc="استخرج أهم المصطلحات للمراجعة الذكية." 
                    icon="fa-layer-group" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('flashcards')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <FeatureCard 
                    title="شرح الدروس" 
                    desc="احصل على شرح مفصل ودقيق لأي موضوع علمي." 
                    icon="fa-book-open-reader" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('explainer')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <FeatureCard 
                    title="محلل الملفات" 
                    desc="ارفع ملفاتك واسأل عنها في محادثة ذكية." 
                    icon="fa-file-magnifying-glass" 
                    color="bg-white/5" 
                    onClick={() => setActiveFeature('analyzer')} 
                    className="h-full"
                  />
                </div>
                <div className="md:col-span-6 lg:col-span-6">
                  <FeatureCard 
                    title="المذاكرة الجماعية" 
                    desc="ادرس مع صديقك في نفس الوقت، شارك الملفات والدردشة فورياً." 
                    icon="fa-users-viewfinder" 
                    color="bg-indigo-600/20" 
                    onClick={() => setActiveFeature('group')} 
                    className="h-full border border-indigo-500/30"
                    isNew
                  />
                </div>
              </div>
            </div>
          )}

          {/* GROUP STUDY VIEW */}
          {activeFeature === 'group' && (
            <div className="max-w-4xl mx-auto space-y-10">
              <SectionHeader title="المذاكرة الجماعية الفاخرة" icon="fa-users-viewfinder" onBack={() => setActiveFeature('home')} />
              
              {!session.roomId ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <motion.button 
                    whileHover={{ y: -8, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={createGroupSession}
                    className="bg-white/[0.02] p-8 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl text-center space-y-6 group hover:border-indigo-500/30 transition-all duration-500"
                  >
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-white/5 text-indigo-400 rounded-2xl md:rounded-[2rem] border border-white/10 flex items-center justify-center mx-auto text-2xl md:text-4xl group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500 shadow-2xl shadow-black/50">
                      <i className="fa-solid fa-plus"></i>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl md:text-3xl font-black text-white font-serif italic">إنشاء جلسة</h3>
                      <p className="text-sm md:text-base text-white/20 font-medium leading-relaxed">ابدأ جلسة جديدة واحصل على كود لمشاركته مع صديقك.</p>
                    </div>
                  </motion.button>

                  <motion.div 
                    className="bg-white/[0.02] p-8 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl text-center space-y-8"
                  >
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-white/5 text-white/20 rounded-2xl md:rounded-[2rem] border border-white/10 flex items-center justify-center mx-auto text-2xl md:text-4xl">
                      <i className="fa-solid fa-right-to-bracket"></i>
                    </div>
                    <div className="space-y-6">
                      <h3 className="text-2xl md:text-3xl font-black text-white font-serif italic">انضمام لجلسة</h3>
                      <div className="space-y-4">
                        <input 
                          id="join-code-input"
                          placeholder="أدخل الكود" 
                          className="w-full bg-white/[0.03] border border-white/10 p-4 md:p-6 rounded-xl md:rounded-2xl text-center font-black text-sm md:text-lg outline-none focus:border-indigo-500/50 text-white placeholder:text-white/10" 
                        />
                        <button 
                          onClick={() => {
                            const code = (document.getElementById('join-code-input') as HTMLInputElement).value;
                            joinGroupSession(code);
                          }}
                          className="w-full bg-white text-black py-4 md:py-5 rounded-xl md:rounded-2xl font-black hover:bg-indigo-50 transition-all shadow-2xl shadow-white/10 tracking-widest uppercase text-xs md:text-sm"
                        >
                          انضم الآن
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="bg-white p-10 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl text-center space-y-8">
                  <div className="space-y-2">
                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">كود الجلسة الخاص بك</p>
                    <div 
                      onClick={() => {
                        if (session.roomId) {
                          navigator.clipboard.writeText(session.roomId);
                          setError("تم نسخ الكود بنجاح!");
                        }
                      }}
                      className="text-6xl font-black text-indigo-600 tracking-[0.2em] bg-indigo-50 py-6 rounded-3xl border-2 border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors relative group"
                    >
                      {session.roomId}
                      <div className="absolute -top-3 right-1/2 translate-x-1/2 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">إضغط للنسخ</div>
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setError("تم نسخ رابط التطبيق! أرسله لصديقك ليدخل الكود.");
                      }}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-600 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <i className="fa-solid fa-link"></i>
                      نسخ رابط التطبيق لإرساله لصديقك
                    </button>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <div className={`flex items-center gap-3 px-6 py-3 rounded-full font-black text-sm ${session.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`}>
                      <span className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${session.connected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${session.connected ? 'bg-emerald-600' : 'bg-amber-600'}`}></span>
                      </span>
                      {session.connected ? 'متصل بصديقك الآن' : 'في انتظار انضمام صديقك...'}
                    </div>
                    
                    {session.connected && (
                      <div className="text-gray-500 font-medium max-w-sm">
                        رائع! أنتما الآن في نفس الجلسة. أي ملف ترفعه أو سؤال تسأله سيظهر عند صديقك فوراً.
                      </div>
                    )}

                    <button 
                      onClick={() => {
                        if (peerRef.current) {
                          peerRef.current.destroy();
                        }
                        setSession({ roomId: null, isHost: false, connected: false, messages: [], callState: 'idle' });
                        window.location.reload();
                      }}
                      className="text-red-500 font-black text-sm hover:underline mt-4"
                    >
                      إنهاء الجلسة
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

      {/* LIVE VIEW */}
      {activeFeature === 'live' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="المحادثة الفورية الفاخرة" icon="fa-microphone-lines" onBack={() => setActiveFeature('home')} />
          <div className="bg-white/[0.02] p-16 rounded-[4rem] border border-white/5 shadow-2xl text-center space-y-12 flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            
            <div className={`w-40 h-40 flex items-center justify-center rounded-full transition-all duration-700 border border-white/10 ${liveActive ? 'bg-red-500/10 animate-pulse shadow-[0_0_50px_rgba(239,68,68,0.2)] border-red-500/30' : 'bg-white/5 shadow-inner'}`}>
              <i className={`fa-solid fa-microphone-lines text-6xl transition-all duration-700 ${liveActive ? 'text-red-500 scale-110' : 'text-indigo-400'}`}></i>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-4xl font-black text-white font-serif italic">{liveActive ? 'المساعد يستمع إليك...' : 'جاهز للبدء؟'}</h3>
              <p className="text-white/20 font-medium max-w-sm mx-auto leading-relaxed">
                تحدث مباشرة مع الذكاء الاصطناعي بالصوت في محادثة طبيعية وسريعة ({selectedDialect === 'standard' ? 'بالفصحى' : 'باللهجة المختارة'}).
              </p>
            </div>

            {!liveActive ? (
              <button onClick={startLiveConversation} className="bg-white text-black px-16 py-6 rounded-[2.5rem] font-black text-sm shadow-2xl shadow-white/10 hover:bg-indigo-50 hover:scale-105 transition-all flex items-center gap-4 active:scale-95 tracking-widest uppercase">
                 <i className="fa-solid fa-play"></i>
                 بدء المحادثة الصوتية
              </button>
            ) : (
              <button onClick={stopLiveConversation} className="bg-red-500 text-white px-16 py-6 rounded-[2.5rem] font-black text-sm shadow-2xl shadow-red-500/20 hover:bg-red-600 hover:scale-105 transition-all flex items-center gap-4 active:scale-95 tracking-widest uppercase">
                 <i className="fa-solid fa-stop"></i>
                 إنهاء الجلسة
              </button>
            )}

            {liveActive && (
              <div className="flex gap-4 items-center text-red-500 font-black animate-fadeIn bg-red-500/5 px-8 py-3 rounded-full border border-red-500/20 uppercase tracking-[0.3em] text-[10px]">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                مباشر الآن
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASSISTANT */}
      {activeFeature === 'assistant' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="المساعد الشخصي الذكي" icon="fa-robot" onBack={() => setActiveFeature('home')} />
          
          <div className="bg-white/[0.02] p-6 md:p-10 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10">
            <form onSubmit={handleAssistant} className="flex flex-col sm:flex-row gap-4 bg-white/[0.03] p-3 rounded-2xl md:rounded-[2rem] border border-white/10 shadow-2xl">
              <input name="prompt" required placeholder="اسأل سؤالك العلمي هنا..." className="flex-1 p-4 outline-none bg-transparent font-medium text-base md:text-lg text-white placeholder:text-white/20" />
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading} 
                type="submit" 
                className="bg-white text-black px-8 md:px-10 py-4 rounded-xl md:rounded-2xl hover:bg-indigo-50 disabled:opacity-50 font-black shadow-xl transition-all text-xs md:text-sm tracking-widest uppercase shrink-0"
              >
                إرسال
              </motion.button>
            </form>
            {assistantResponse && (
              <div className="bg-white/[0.03] p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-white/5 space-y-8 animate-slideUp relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50"></div>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-white/80 font-medium text-lg">{assistantResponse.text}</div>
              
              {renderSources(assistantResponse.sources)}
              
              <div className="border-t border-white/5 pt-8">
                {!assistantResponse.showGenderMenu && !assistantResponse.audio && (
                  <button onClick={() => setAssistantResponse(p => p ? { ...p, showGenderMenu: true } : null)} className="flex items-center gap-3 text-white/60 hover:text-white font-black text-xs bg-white/5 hover:bg-white/10 active:scale-95 px-8 py-4 rounded-2xl transition-all border border-white/10 tracking-widest uppercase">
                    <i className="fa-solid fa-headphones text-indigo-400"></i> استماع للإجابة
                  </button>
                )}
                {assistantResponse.showGenderMenu && (
                  <div className="bg-white/[0.02] p-8 rounded-[2rem] space-y-6 animate-fadeIn border border-white/5">
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">اختر نوع الصوت للاستماع</p>
                    <div className="flex gap-4">
                      <button onClick={() => handleTTS(assistantResponse.text, 'male', 'assistant')} className="flex-1 bg-white/5 border border-white/10 hover:border-indigo-500/30 hover:bg-white/10 active:scale-95 p-5 rounded-2xl text-[10px] font-black transition-all text-white/40 uppercase tracking-widest">صوت ذكر (Puck)</button>
                      <button onClick={() => handleTTS(assistantResponse.text, 'female', 'assistant')} className="flex-1 bg-white/5 border border-white/10 hover:border-indigo-500/30 hover:bg-white/10 active:scale-95 p-5 rounded-2xl text-[10px] font-black transition-all text-white/40 uppercase tracking-widest">صوت أنثى (Kore)</button>
                    </div>
                  </div>
                )}
                {assistantResponse.audio && <AudioPlayer base64Data={assistantResponse.audio} autoPlay />}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

      {/* ANALYZER */}
      {activeFeature === 'analyzer' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="محلل الملفات الذكي" icon="fa-file-magnifying-glass" onBack={() => setActiveFeature('home')} />
          {!analyzerFile && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/[0.02] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10"
            >
              <form onSubmit={handleAnalyzer} className="space-y-10">
                <div className="border border-dashed border-white/10 rounded-2xl md:rounded-[2.5rem] p-8 md:p-16 text-center bg-white/[0.03] hover:bg-white/[0.05] transition-all group cursor-pointer relative shadow-inner">
                  <input 
                    name="file" 
                    type="file" 
                    accept=".pdf,image/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                    required 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // We can use a local state or just show a message
                        const label = document.getElementById('file-upload-label');
                        if (label) label.innerText = `تم اختيار: ${file.name}`;
                      }
                    }}
                  />
                  <div className="space-y-6">
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-white/5 rounded-2xl flex items-center justify-center mx-auto shadow-2xl border border-white/10 group-hover:scale-110 transition-all duration-500">
                      <i className="fa-solid fa-cloud-arrow-up text-2xl md:text-4xl text-indigo-400"></i>
                    </div>
                    <div className="space-y-2">
                      <p id="file-upload-label" className="text-xl md:text-2xl font-black text-white font-serif italic">ارفع ملف PDF أو صورة</p>
                      <p className="text-[10px] md:text-sm text-white/20 font-medium tracking-wide uppercase">سيقوم الذكاء الاصطناعي بتحليل المحتوى فوراً</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <input name="prompt" required placeholder="ماذا تريد أن تعرف عن محتوى الملف؟" className="w-full bg-white/[0.03] border border-white/10 p-4 md:p-6 rounded-xl md:rounded-2xl outline-none focus:border-indigo-500/50 font-medium text-base md:text-lg text-white placeholder:text-white/10 shadow-inner" />
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading || uploadingFile} 
                    type="submit" 
                    className="w-full bg-white text-black py-4 md:py-6 rounded-xl md:rounded-2xl hover:bg-indigo-50 disabled:opacity-50 font-black shadow-2xl shadow-white/10 transition-all text-xs md:text-sm tracking-widest uppercase"
                  >
                    {uploadingFile ? 'جاري الرفع والتحليل...' : 'بدء التحليل الذكي'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          )}
          {analyzerChatHistory.length > 0 && (
            <div className="space-y-8 animate-fadeIn">
              <div className="flex items-center justify-between bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                    <i className="fa-solid fa-file-lines text-indigo-400"></i>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">الملف المرفق</p>
                    <span className="font-bold text-sm text-white truncate max-w-[200px]">{analyzerFile?.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setActiveFeature('live');
                      startLiveConversation(`أنت الآن في محادثة مباشرة حول الملف المرفق: "${analyzerFile?.name}". 
                      مهمتك هي الإجابة على استفسارات المستخدم الصوتية بناءً على محتوى هذا الملف فقط. 
                      إذا سألك المستخدم عن شيء غير موجود في الملف، أخبره بلباقة أنك تستطيع المساعدة فقط في محتوى الملف المرفق.`);
                    }}
                    className="text-[10px] font-black text-indigo-400 hover:bg-white/5 px-6 py-3 rounded-xl transition-all flex items-center gap-2 border border-indigo-400/20 uppercase tracking-widest"
                  >
                    <i className="fa-solid fa-microphone"></i>
                    محادثة صوتية
                  </button>
                  <button 
                    onClick={() => {
                      setAnalyzerChatHistory([]);
                      setAnalyzerResponse(null);
                      setAnalyzerFile(null);
                    }}
                    className="text-[10px] font-black text-red-400 hover:bg-red-400/10 px-6 py-3 rounded-xl transition-all border border-red-400/20 uppercase tracking-widest"
                  >
                    تغيير الملف
                  </button>
                </div>
              </div>

              <div className="space-y-6 max-h-[500px] overflow-y-auto p-4 custom-scrollbar bg-white/[0.01] rounded-[2rem] border border-white/5 shadow-inner">
                {analyzerChatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] p-6 rounded-3xl shadow-2xl ${
                      msg.role === 'user' 
                        ? 'bg-white/5 text-white/80 rounded-tr-none border border-white/10' 
                        : 'bg-white text-black rounded-tl-none font-bold'
                    }`}>
                      <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">
                        {msg.parts.find(p => p.text)?.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAnalyzerChat} className="flex gap-4 bg-white/[0.03] p-3 rounded-[2rem] border border-white/10 shadow-2xl sticky bottom-0">
                <input 
                  name="prompt" 
                  required 
                  placeholder="اسأل سؤالاً آخر عن الملف..." 
                  className="flex-1 p-4 outline-none bg-transparent font-medium text-lg text-white placeholder:text-white/10" 
                />
                <button 
                  disabled={loading} 
                  type="submit" 
                  className="bg-white text-black px-8 py-4 rounded-2xl hover:bg-indigo-50 active:scale-95 disabled:opacity-50 font-black transition-all shadow-xl shadow-white/10"
                >
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </form>

              {analyzerResponse && (
                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5 flex gap-4 animate-fadeIn">
                  <button onClick={() => handleTTS(analyzerResponse.text, 'male', 'analyzer')} className="flex-1 bg-white/5 hover:bg-white/10 active:scale-95 p-4 rounded-xl text-[10px] font-black transition-all border border-white/10 uppercase tracking-widest text-white/40">استماع بصوت ذكر</button>
                  <button onClick={() => handleTTS(analyzerResponse.text, 'female', 'analyzer')} className="flex-1 bg-white/5 hover:bg-white/10 active:scale-95 p-4 rounded-xl text-[10px] font-black transition-all border border-white/10 uppercase tracking-widest text-white/40">استماع بصوت أنثى</button>
                </div>
              )}
              {analyzerResponse?.audio && <AudioPlayer base64Data={analyzerResponse.audio} autoPlay />}
            </div>
          )}
        </div>
      )}

      {/* TTS */}
      {activeFeature === 'tts' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="تحويل النص لصوت فاخر" icon="fa-volume-high" onBack={() => setActiveFeature('home')} />
          <div className="bg-white/[0.02] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10">
            <textarea 
              id="tts-input-area" 
              rows={8} 
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 text-white outline-none focus:border-indigo-500/50 transition-all duration-500 resize-none text-lg md:text-xl font-medium placeholder:text-white/10 shadow-inner" 
              placeholder="اكتب النص الذي ترغب في سماعه هنا..."
            ></textarea>
            <div className="flex flex-col md:flex-row gap-6">
              <button disabled={loading} onClick={() => {
                const txt = (document.getElementById('tts-input-area') as HTMLTextAreaElement).value;
                if(txt) handleTTS(txt, 'male', 'standalone');
              }} className="flex-1 bg-white text-black py-4 md:py-6 rounded-xl md:rounded-2xl font-black shadow-2xl shadow-white/10 hover:bg-indigo-50 active:scale-[0.98] transition-all tracking-widest uppercase text-xs md:text-sm">تحويل (صوت ذكر)</button>
              <button disabled={loading} onClick={() => {
                const txt = (document.getElementById('tts-input-area') as HTMLTextAreaElement).value;
                if(txt) handleTTS(txt, 'female', 'standalone');
              }} className="flex-1 bg-white/5 border border-white/10 text-white py-4 md:py-6 rounded-xl md:rounded-2xl font-black hover:bg-white/10 active:scale-[0.98] transition-all tracking-widest uppercase text-xs md:text-sm">تحويل (صوت أنثى)</button>
            </div>
            {ttsAudio && !loading && <AudioPlayer base64Data={ttsAudio} autoPlay />}
          </div>
        </div>
      )}

      {/* PODCAST */}
      {activeFeature === 'podcast' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="بودكاست تعليمي فاخر" icon="fa-podcast" onBack={() => setActiveFeature('home')} />
          <form onSubmit={handlePodcast} className="bg-white/[0.02] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10">
            <textarea 
              name="text" 
              required 
              rows={8} 
              placeholder="الصق محتوى الدرس هنا..." 
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 text-white outline-none focus:border-indigo-500/50 transition-all duration-500 resize-none text-lg md:text-xl font-medium placeholder:text-white/10 shadow-inner"
            ></textarea>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <select name="type" className="bg-white/[0.03] border border-white/10 p-4 md:p-6 rounded-xl md:rounded-2xl outline-none text-white font-black uppercase tracking-widest text-[10px] md:text-xs cursor-pointer hover:bg-white/5 transition-all">
                 <option value="سؤال و جواب" className="bg-black">سؤال و جواب</option>
                 <option value="نقاش طبيعي" className="bg-black">نقاش طبيعي</option>
                 <option value="نقاش حاد" className="bg-black">نقاش حاد</option>
               </select>
               <button disabled={loading} type="submit" className="bg-white text-black px-8 md:px-12 py-4 md:py-6 rounded-xl md:rounded-2xl hover:bg-indigo-50 active:scale-[0.98] disabled:opacity-50 font-black shadow-2xl shadow-white/10 transition-all tracking-widest uppercase text-xs md:text-sm">بدء إنتاج البودكاست</button>
            </div>
          </form>
          {podcastData && (
            <div className="bg-white/[0.03] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-8 animate-slideUp relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
              <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-4">
                <i className="fa-solid fa-microphone text-indigo-400"></i> البودكاست المسموع جاهز
              </h3>
              <AudioPlayer base64Data={podcastData.audio} autoPlay />
            </div>
          )}
        </div>
      )}

      {/* FLASHCARDS */}
      {activeFeature === 'flashcards' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="البطاقات التعليمية الفاخرة" icon="fa-layer-group" onBack={() => setActiveFeature('home')} />
          <form onSubmit={handleFlashcards} className="bg-white/[0.02] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10">
            <textarea 
              name="text" 
              required 
              rows={6} 
              placeholder="أدخل النص لاستخراج البطاقات منه..." 
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 text-white outline-none focus:border-indigo-500/50 transition-all duration-500 resize-none text-lg md:text-xl font-medium placeholder:text-white/10 shadow-inner"
            ></textarea>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex items-center gap-6 bg-white/[0.03] px-8 py-4 rounded-2xl border border-white/10 shadow-inner w-full md:w-auto justify-between md:justify-start">
                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest">العدد</label>
                <input name="count" type="number" defaultValue={5} min={1} max={20} className="w-16 bg-transparent outline-none font-black text-white text-xl text-center" />
              </div>
              <button disabled={loading} type="submit" className="w-full md:flex-1 bg-white text-black py-4 md:py-6 rounded-xl md:rounded-2xl hover:bg-indigo-50 active:scale-[0.98] disabled:opacity-50 font-black shadow-2xl shadow-white/10 transition-all tracking-widest uppercase text-xs md:text-sm">استخراج البطاقات</button>
            </div>
          </form>
          {flashcards.length > 0 && <FlashcardViewer cards={flashcards} />}
        </div>
      )}

      {/* EXPLAINER */}
      {activeFeature === 'explainer' && (
        <div className="max-w-4xl mx-auto space-y-10">
          <SectionHeader title="شرح الدروس الذكي" icon="fa-book-open-reader" onBack={() => setActiveFeature('home')} />
          <form onSubmit={handleExplainer} className="flex flex-col sm:flex-row gap-4 bg-white/[0.03] p-3 rounded-2xl md:rounded-[2rem] border border-white/10 shadow-2xl">
            <input name="topic" required placeholder="ما هو الدرس الذي تريد شرحه؟" className="flex-1 p-4 md:p-5 outline-none bg-transparent font-medium text-base md:text-lg text-white placeholder:text-white/10" />
            <button disabled={loading} type="submit" className="bg-white text-black px-8 md:px-12 py-4 rounded-xl md:rounded-2xl hover:bg-indigo-50 active:scale-95 disabled:opacity-50 font-black shadow-xl transition-all text-xs md:text-sm tracking-widest uppercase shrink-0">شرح الدرس</button>
          </form>
          {explainerResponse && (
            <div className="bg-white/[0.03] p-6 md:p-12 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl space-y-10 animate-slideUp relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50"></div>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-white/80 font-medium text-lg md:text-xl">{explainerResponse.text}</div>
              
              {renderSources(explainerResponse.sources)}
              
              <div className="border-t border-white/5 pt-8 md:pt-10">
                <button onClick={() => setExplainerResponse(p => p ? { ...p, showGenderMenu: true } : null)} className="flex items-center gap-3 md:gap-4 text-white/60 hover:text-white font-black text-[10px] md:text-xs bg-white/5 hover:bg-white/10 active:scale-95 px-6 md:px-10 py-4 md:py-5 rounded-xl md:rounded-2xl transition-all border border-white/10 tracking-widest uppercase">
                  <i className="fa-solid fa-volume-high text-indigo-400"></i> تحويل الشرح لصوت
                </button>
                {explainerResponse.showGenderMenu && (
                  <div className="flex flex-col sm:flex-row gap-4 mt-6 animate-fadeIn bg-white/[0.02] p-6 md:p-8 rounded-2xl md:rounded-[2rem] border border-white/5">
                    <button onClick={() => handleTTS(explainerResponse.text, 'male', 'explainer')} className="flex-1 text-[10px] font-black border border-white/10 p-4 md:p-5 rounded-xl md:rounded-2xl hover:bg-white/10 active:scale-95 transition-all text-white/40 uppercase tracking-widest">صوت ذكر</button>
                    <button onClick={() => handleTTS(explainerResponse.text, 'female', 'explainer')} className="flex-1 text-[10px] font-black border border-white/10 p-4 md:p-5 rounded-xl md:rounded-2xl hover:bg-white/10 active:scale-95 transition-all text-white/40 uppercase tracking-widest">صوت أنثى</button>
                  </div>
                )}
                {explainerResponse.audio && <AudioPlayer base64Data={explainerResponse.audio} autoPlay />}
              </div>
            </div>
          )}
        </div>
      )}
        </motion.div>
      </AnimatePresence>

      {/* Global Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl flex items-center justify-center z-[100] animate-fadeIn">
          <div className="flex flex-col items-center gap-10">
            <div className="relative">
              <div className="w-32 h-32 border-[12px] border-white/5 border-t-indigo-500 rounded-full animate-spin shadow-2xl"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <i className="fa-solid fa-brain text-white text-4xl animate-pulse"></i>
              </div>
            </div>
            <div className="text-center space-y-4">
              <p className="font-black text-4xl text-white font-serif italic tracking-widest uppercase">{loadingMessage}</p>
              <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] animate-pulse">الذكاء الاصطناعي يقوم بالتحليل الآن</p>
            </div>
          </div>
        </div>
      )}
      {/* Floating Chat & Call UI */}
      {session.connected && (
        <div className="fixed bottom-10 left-10 z-[100] flex flex-col items-end gap-6">
          <audio ref={remoteAudioRef} autoPlay className="hidden" />
          
          <AnimatePresence>
            {/* Call Menu (Choice between Chat or Call) */}
            {showCallMenu && !showChat && session.callState === 'idle' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-black/90 backdrop-blur-3xl p-6 rounded-[2.5rem] shadow-2xl border border-white/10 flex flex-col gap-4 w-64"
              >
                <button 
                  onClick={() => { setShowChat(true); setShowCallMenu(false); }}
                  className="flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all text-white/60 hover:text-white font-black text-[10px] tracking-widest uppercase border border-white/5"
                >
                  <div className="w-10 h-10 bg-white/5 text-indigo-400 rounded-xl flex items-center justify-center border border-white/10">
                    <i className="fa-solid fa-comments"></i>
                  </div>
                  محادثة نصية
                </button>
                <button 
                  onClick={() => { initiateCall(); setShowCallMenu(false); }}
                  className="flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all text-white/60 hover:text-white font-black text-[10px] tracking-widest uppercase border border-white/5"
                >
                  <div className="w-10 h-10 bg-white/5 text-emerald-400 rounded-xl flex items-center justify-center border border-white/10">
                    <i className="fa-solid fa-phone"></i>
                  </div>
                  مكالمة صوتية
                </button>
              </motion.div>
            )}

            {/* Incoming Call UI */}
            {session.callState === 'incoming' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-black/90 backdrop-blur-3xl p-10 rounded-[3rem] shadow-2xl border border-emerald-500/30 flex flex-col items-center gap-8 w-72 text-center"
              >
                <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center text-4xl animate-bounce border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <i className="fa-solid fa-phone-volume"></i>
                </div>
                <div className="space-y-2">
                  <h4 className="font-black text-white text-xl font-serif italic">مكالمة واردة...</h4>
                  <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">صديقك يريد التحدث معك</p>
                </div>
                <div className="flex gap-4 w-full">
                  <button onClick={acceptCall} className="flex-1 bg-white text-black py-4 rounded-2xl font-black shadow-2xl shadow-white/10 hover:bg-indigo-50 transition-all text-[10px] tracking-widest uppercase">رد</button>
                  <button onClick={rejectCall} className="flex-1 bg-white/5 text-white/40 py-4 rounded-2xl font-black hover:bg-red-500/20 hover:text-red-500 transition-all text-[10px] tracking-widest uppercase border border-white/10">رفض</button>
                </div>
              </motion.div>
            )}

            {/* Active Call UI */}
            {(session.callState === 'connected' || session.callState === 'calling') && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-black/95 backdrop-blur-3xl p-10 rounded-[3rem] shadow-2xl border border-white/10 flex flex-col items-center gap-10 w-72 text-white"
              >
                <div className="relative">
                  <div className={`w-28 h-28 bg-white/5 rounded-full flex items-center justify-center text-5xl border border-white/10 ${session.callState === 'connected' ? 'animate-pulse shadow-[0_0_40px_rgba(255,255,255,0.05)]' : ''}`}>
                    <i className="fa-solid fa-user text-white/20"></i>
                  </div>
                  {session.callState === 'connected' && (
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-full border-8 border-black flex items-center justify-center text-xs">
                      <i className="fa-solid fa-check"></i>
                    </div>
                  )}
                </div>

                <div className="text-center space-y-2">
                  <h4 className="font-black text-2xl font-serif italic">{session.callState === 'connected' ? 'مكالمة نشطة' : 'جاري الاتصال...'}</h4>
                  <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em]">
                    {session.callState === 'connected' ? 'متصل الآن' : 'في انتظار الرد'}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <button 
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border ${isMuted ? 'bg-red-500 border-red-500 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                  >
                    <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                  </button>
                  <button 
                    onClick={() => endCall()}
                    className="w-16 h-16 bg-red-500 text-white rounded-[1.5rem] flex items-center justify-center text-2xl shadow-2xl shadow-red-500/20 hover:bg-red-600 transition-all"
                  >
                    <i className="fa-solid fa-phone-slash"></i>
                  </button>
                  <button 
                    onClick={toggleSpeaker}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border ${isSpeakerOn ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                  >
                    <i className={`fa-solid ${isSpeakerOn ? 'fa-volume-high' : 'fa-ear-listen'}`}></i>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Chat Window */}
            {showChat && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-96 h-[550px] bg-black/95 backdrop-blur-3xl rounded-[3rem] shadow-2xl border border-white/10 flex flex-col overflow-hidden"
              >
                <div className="bg-white/5 p-8 text-white flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <span className="font-black text-[10px] tracking-[0.3em] uppercase text-white/60">دردشة مباشرة</span>
                  </div>
                  <button onClick={() => setShowChat(false)} className="hover:bg-white/10 p-2 rounded-xl transition-all text-white/20 hover:text-white">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar flex flex-col">
                  {session.messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                      <i className="fa-solid fa-comments text-6xl mb-4"></i>
                      <p className="text-[10px] font-black uppercase tracking-widest">ابدأ المراسلة مع صديقك</p>
                    </div>
                  )}
                  {session.messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] p-5 rounded-[1.5rem] text-sm font-medium leading-relaxed ${
                        msg.sender === 'me' ? 'bg-white text-black rounded-tr-none' : 'bg-white/5 text-white border border-white/10 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
                    if (input.value.trim()) {
                      sendDirectMessage(input.value);
                      input.value = '';
                    }
                  }}
                  className="p-6 bg-white/5 border-t border-white/5 flex gap-4"
                >
                  <input name="msg" placeholder="اكتب رسالة..." className="flex-1 bg-white/5 rounded-2xl px-6 py-4 text-sm font-medium text-white outline-none focus:bg-white/10 transition-all border border-white/5" />
                  <button type="submit" className="bg-white text-black w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-indigo-50 transition-all shadow-xl shadow-white/5">
                    <i className="fa-solid fa-paper-plane text-sm"></i>
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (showChat) {
                setShowChat(false);
              } else if (session.callState !== 'idle') {
                // Do nothing, call UI is visible
              } else {
                setShowCallMenu(!showCallMenu);
              }
            }}
            className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl transition-all border ${
              showChat || session.callState !== 'idle' ? 'bg-white text-black border-white rotate-90' : 'bg-black border-white/10 hover:border-white/30'
            }`}
          >
            <i className={`fa-solid ${showChat || session.callState !== 'idle' ? 'fa-xmark' : 'fa-comments'} text-xl`}></i>
            {!showChat && session.messages.length > 0 && session.messages[session.messages.length-1].sender === 'peer' && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-4 border-black animate-bounce"></span>
            )}
          </motion.button>
        </div>
      )}
    </Layout>
  );
};

// Helper Components
const FeatureCard: React.FC<{ title: string, desc: string, icon: string, color: string, onClick: () => void, className?: string, isNew?: boolean }> = ({ title, desc, icon, color, onClick, className = "", isNew = false }) => (
  <motion.button 
    whileHover={{ y: -12, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full text-right p-10 bg-white/[0.02] rounded-[3rem] border border-white/[0.05] hover:border-white/20 transition-all duration-700 group relative overflow-hidden flex flex-col justify-between gap-8 glass-card ${className}`}
  >
    <div className={`absolute top-0 left-0 w-1.5 h-full ${color} opacity-60 group-hover:w-full group-hover:opacity-[0.03] transition-all duration-700`}></div>
    
    {isNew && (
      <div className="absolute top-8 left-8 bg-indigo-500 text-white text-[9px] font-black px-4 py-1.5 rounded-full shadow-2xl shadow-indigo-500/40 z-20 tracking-widest uppercase">
        جديد
      </div>
    )}
    
    <div className="relative z-10">
      <div className={`w-20 h-20 ${color} rounded-[2rem] flex items-center justify-center text-white text-3xl mb-8 shadow-2xl shadow-black/50 group-hover:scale-110 transition-all duration-700 border border-white/10`}>
        <i className={`fa-solid ${icon}`}></i>
      </div>
      <h3 className="text-3xl font-black text-white mb-4 group-hover:text-indigo-400 transition-colors font-serif italic tracking-tight">{title}</h3>
      <p className="text-white/50 font-medium leading-relaxed text-lg group-hover:text-white/70 transition-colors">{desc}</p>
    </div>

    <div className="relative z-10 flex items-center gap-3 text-indigo-400 font-black text-xs opacity-0 group-hover:opacity-100 transition-all transform translate-x-6 group-hover:translate-x-0 tracking-widest uppercase">
      ابدأ التجربة
      <i className="fa-solid fa-arrow-left text-[10px]"></i>
    </div>
  </motion.button>
);

const SectionHeader: React.FC<{ title: string, icon: string, onBack: () => void }> = ({ title, icon, onBack }) => (
  <div className="flex items-center gap-6 md:gap-8 bg-white/[0.03] backdrop-blur-3xl p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] mb-12 md:mb-20 animate-slideUp">
    <button onClick={onBack} className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center bg-white/5 hover:bg-white hover:text-black active:scale-90 rounded-2xl md:rounded-3xl transition-all text-white/40 border border-white/10 shadow-xl">
      <i className="fa-solid fa-arrow-right text-xl md:text-2xl"></i>
    </button>
    <div className="flex items-center gap-4 md:gap-6">
      <div className="w-12 h-12 md:w-20 md:h-20 bg-white text-black rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-2xl">
        <i className={`fa-solid ${icon} text-xl md:text-3xl`}></i>
      </div>
      <h2 className="text-2xl md:text-5xl font-black text-white font-serif italic tracking-tighter">{title}</h2>
    </div>
  </div>
);

const FlashcardViewer: React.FC<{ cards: Flashcard[] }> = ({ cards }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[currentIndex];

  return (
    <div className="space-y-10">
      <div className="relative h-80 md:h-96 w-full cursor-pointer perspective-2000" onClick={() => setFlipped(!flipped)}>
        <div className={`absolute inset-0 w-full h-full transition-all duration-1000 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}>
          <div className="absolute inset-0 backface-hidden bg-white/[0.03] border border-white/10 rounded-3xl md:rounded-[4rem] flex flex-col items-center justify-center p-8 md:p-12 text-center shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            <span className="text-[10px] font-black text-white/20 mb-6 md:mb-10 uppercase tracking-[0.4em]">المصطلح / السؤال</span>
            <h4 className="text-2xl md:text-4xl font-black text-white leading-tight font-serif italic">{card.term}</h4>
            <div className="mt-8 md:mt-12 flex items-center gap-3 text-white/10 text-[10px] font-black uppercase tracking-widest animate-pulse">
              <i className="fa-solid fa-sync"></i> انقر لرؤية الإجابة
            </div>
          </div>
          <div className="absolute inset-0 backface-hidden bg-white text-black rounded-3xl md:rounded-[4rem] flex flex-col items-center justify-center p-8 md:p-12 text-center shadow-2xl rotate-y-180 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-20"></div>
            <span className="text-[10px] font-black text-black/20 mb-6 md:mb-10 uppercase tracking-[0.4em]">التفسير / الإجابة</span>
            <p className="text-xl md:text-2xl leading-relaxed font-bold">{card.definition}</p>
            <div className="mt-8 md:mt-12 flex items-center gap-3 text-black/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
              <i className="fa-solid fa-sync"></i> انقر للعودة للسؤال
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-6 md:px-12 bg-white/[0.02] p-6 md:p-8 rounded-3xl md:rounded-[3rem] border border-white/5 shadow-2xl">
        <button disabled={currentIndex === 0} onClick={() => { setCurrentIndex(v => v - 1); setFlipped(false); }} className="px-6 md:px-10 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white/40 hover:text-white hover:bg-white/5 active:scale-95 disabled:opacity-5 transition-all uppercase tracking-widest text-[10px]">السابق</button>
        <span className="font-black text-white/20 tracking-[0.3em] text-[10px] md:text-xs">{currentIndex + 1} / {cards.length}</span>
        <button disabled={currentIndex === cards.length - 1} onClick={() => { setCurrentIndex(v => v + 1); setFlipped(false); }} className="px-6 md:px-10 py-3 md:py-4 bg-white text-black rounded-xl md:rounded-2xl font-black hover:bg-indigo-50 active:scale-95 disabled:opacity-5 shadow-2xl shadow-white/10 transition-all uppercase tracking-widest text-[10px]">التالي</button>
      </div>
    </div>
  );
};

export default App;
