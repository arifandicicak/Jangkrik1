import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  MessageSquare, 
  User, 
  Plus, 
  Trash2, 
  Send, 
  Mic, 
  Volume2, 
  Menu, 
  X, 
  Code, 
  Gamepad2, 
  Brain,
  Bug,
  Palette, 
  Award, 
  Mail,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Github,
  Globe,
  Layers,
  Image as ImageIcon,
  Paperclip
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Message, ChatSession } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SYSTEM_INSTRUCTION = `You are "Jangkrik", the AI assistant for Arifandi Tanggahma's portfolio. 
Arifandi (also known as Jangkrik) is a school kid who loves coding, making games, and AI.
Your personality is helpful, tech-savvy, and friendly.
When users ask about Arifandi, refer to the following info:
- About: Jangkrik or Arifandi Tanggahma is an ordinary school kid who really likes coding, is interested in coding, Arif has made his own game, class website, and get various certificates from dicoding.
- Skills: Making games, making websites, learning AI, creating 2D/3D assets for games, painting.
- Certificates: Deep learning fundamentals, machine learning, creating AI with Python, AI Engineer.
- Contact: arifandicicak@gmail.com
Keep responses concise and engaging.`;

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [user, setUser] = useState<any>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showScrollButton, setShowScrollButton] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentSession = useMemo(() => sessions.find(s => s.id === currentSessionId) || null, [sessions, currentSessionId]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          if (!currentSessionId) {
            setCurrentSessionId(data[0].id);
          }
        } else {
          await createNewChat();
        }
      }
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (e) {
      console.error("Failed to fetch user", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchUser();
      await fetchSessions();
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) && !origin.endsWith('.vercel.app') {
        return;
      }
      if (event.data?.type === 'AUTH_SUCCESS') {
        fetchUser().then(() => fetchSessions());
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { url } = await res.json();

      const width = 600;
      const height = 700;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2;
      
      window.open(
        url,
        'google_login',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (e) {
      console.error("Login failed", e);
      alert("Failed to initialize login. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setUser(null);
      fetchSessions();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [currentSession?.messages, isTyping]);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (text: string = input) => {
    if ((!text.trim() && !selectedImage) || !currentSessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      imageData: selectedImage || undefined,
      timestamp: Date.now()
    };

    // Optimistic update
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, messages: [...s.messages, userMessage] };
      }
      return s;
    }));
    
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);

    try {
      // Save user message to backend
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userMessage, sessionId: currentSessionId })
      });

      const parts: any[] = [{ text: text || "What is in this image?" }];
      if (currentImage) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: currentImage.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "I'm sorry, I couldn't process that.",
        timestamp: Date.now()
      };

      const isFirstMessage = currentSession?.messages.length === 0;
      const newTitle = isFirstMessage ? (text || "Image Query").slice(0, 30) + (text.length > 30 ? '...' : '') : undefined;

      // Save AI message to backend
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...aiMessage, sessionId: currentSessionId, sessionTitle: newTitle })
      });

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const newMessages = [...s.messages, aiMessage];
          return { ...s, messages: newMessages, title: newTitle || s.title };
        }
        return s;
      }));
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const createNewChat = async () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now()
    };

    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession)
      });
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
      setIsSidebarOpen(false);
    } catch (e) {
      console.error("Failed to create session", e);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      const filtered = sessions.filter(s => s.id !== id);
      setSessions(filtered);
      if (filtered.length === 0) {
        createNewChat();
      } else if (currentSessionId === id) {
        setCurrentSessionId(filtered[0].id);
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  };

  const clearAllHistory = async () => {
    if (window.confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
      for (const s of sessions) {
        await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
      }
      setSessions([]);
      createNewChat();
      setIsSidebarOpen(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!currentSessionId) return;
    
    try {
      await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: s.messages.filter(m => m.id !== messageId) };
        }
        return s;
      }));
    } catch (e) {
      console.error("Failed to delete message", e);
    }
  };

  const clearCurrentSession = async () => {
    if (!currentSessionId) return;
    if (window.confirm("Clear all messages in this session?")) {
      try {
        await fetch(`/api/sessions/${currentSessionId}/messages`, { method: 'DELETE' });
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [] };
          }
          return s;
        }));
      } catch (e) {
        console.error("Failed to clear session", e);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-brand-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-green"></div>
      </div>
    );
  }

  const startSpeechToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + ' ' + transcript);
    };
    recognition.start();
  };

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-black font-sans perspective-1000">
      {/* Background Effects */}
      <div className="fixed inset-0 grid-bg z-0" />
      <div className="fixed inset-0 scanline z-10" />
      
      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth > 768) && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed md:relative z-50 w-80 h-full bg-brand-black/80 backdrop-blur-xl border-r border-white/5 flex flex-col",
              !isSidebarOpen && "hidden md:flex"
            )}
          >
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <button 
                onClick={() => createNewChat()}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand-green text-brand-black font-black text-sm green-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus size={20} />
                <span>NEW SESSION</span>
              </button>
              
              <div className="mt-10 space-y-2">
                <p className="px-3 text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-4">Recent History</p>
                {sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border",
                      currentSessionId === session.id 
                        ? "bg-brand-green/10 border-brand-green/30 text-brand-green" 
                        : "border-transparent hover:bg-white/5 text-white/40"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <MessageSquare size={18} className={cn("shrink-0", currentSessionId === session.id ? "text-brand-green" : "text-white/20")} />
                      <span className="truncate text-sm font-medium">{session.title}</span>
                    </div>
                    <button 
                      onClick={(e) => deleteSession(session.id, e)}
                      className="md:opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-white/5 bg-white/[0.02] space-y-4">
              {sessions.length > 1 && (
                <button 
                  onClick={clearAllHistory}
                  className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all uppercase tracking-widest"
                >
                  <Trash2 size={14} />
                  <span>Clear All History</span>
                </button>
              )}
              
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {user.avatar ? (
                      <img src={user.avatar} className="w-10 h-10 rounded-2xl object-cover border border-brand-green/30" alt={user.name} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-2xl bg-brand-green/20 flex items-center justify-center text-brand-green border border-brand-green/30">
                        <User size={20} />
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-brand-black bg-brand-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm tracking-tight truncate">{user.name}</p>
                    <button 
                      onClick={handleLogout}
                      className="text-[10px] text-white/40 font-bold uppercase tracking-wider hover:text-red-500 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button 
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                    <span>Sign in with Google</span>
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-2xl bg-brand-green/20 flex items-center justify-center text-brand-green border border-brand-green/30">
                        <User size={20} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-brand-black bg-brand-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm tracking-tight truncate">Explorer</p>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider truncate">Anonymous Mode</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden z-20">
        {/* Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 md:px-10 bg-brand-black/40 backdrop-blur-xl z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-3 hover:bg-white/5 rounded-2xl transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-green/10 flex items-center justify-center text-brand-green border border-brand-green/20">
                <Bug size={22} />
              </div>
              <div>
                <h1 className="font-black text-xl tracking-tighter font-display">JANGKRIK <span className="text-brand-green">AI</span></h1>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Neural Network v3.1</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={clearCurrentSession}
              className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-white/20 hover:text-red-500"
              title="Clear current session"
            >
              <Trash2 size={20} />
            </button>
            <button 
              onClick={() => setShowPortfolio(true)}
              className="group flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-green/50 hover:bg-brand-green/5 transition-all green-glow"
            >
            <div className="w-8 h-8 rounded-xl bg-brand-green/10 flex items-center justify-center text-brand-green group-hover:scale-110 transition-transform">
              <User size={18} />
            </div>
            <span className="font-black text-sm tracking-widest uppercase">Profile</span>
          </button>
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 md:p-12 space-y-10 scrollbar-hide relative scroll-smooth pb-60"
        >
          {showScrollButton && (
            <button 
              onClick={scrollToBottom}
              className="fixed bottom-32 right-10 z-50 p-4 rounded-2xl bg-brand-green text-brand-black shadow-2xl animate-bounce hover:scale-110 transition-all"
            >
              <Plus size={24} className="rotate-45" />
            </button>
          )}
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-12 max-w-4xl mx-auto">
              <motion.div
                initial={{ scale: 0.8, opacity: 0, rotateY: 45 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ type: 'spring', damping: 20 }}
                className="relative preserve-3d"
              >
                <div className="w-32 h-32 rounded-[2.5rem] bg-brand-green/10 flex items-center justify-center text-brand-green border border-brand-green/20 animate-float shadow-[0_0_50px_rgba(0,255,65,0.1)]">
                  <Bug size={64} />
                </div>
                <div className="absolute -bottom-4 -right-4 w-12 h-12 rounded-2xl bg-brand-green flex items-center justify-center text-brand-black shadow-2xl">
                  <Sparkles size={24} />
                </div>
              </motion.div>
              
              <div className="space-y-4">
                <h2 className="text-6xl md:text-8xl font-black tracking-tighter text-white font-display leading-none">
                  JANGKRIK <span className="text-brand-green">AI</span>
                </h2>
                <p className="text-xl md:text-2xl text-white/40 font-medium max-w-xl mx-auto leading-relaxed">
                  The next generation of portfolio interaction. How can I assist you today?
                </p>
              </div>

              <div className="flex flex-col items-center gap-6 w-full">
                <button 
                  onClick={() => setShowPortfolio(true)}
                  className="group relative flex items-center gap-4 px-10 py-5 rounded-3xl bg-brand-green text-brand-black font-black text-xl hover:scale-105 active:scale-95 transition-all green-glow shadow-2xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                  <User size={28} />
                  <span>EXPLORE PORTFOLIO</span>
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full pt-10">
                  {[
                    { q: "Who is Arifandi Tanggahma?", icon: <User size={16} /> },
                    { q: "Show me your certificates", icon: <Award size={16} /> },
                    { q: "What games have you made?", icon: <Gamepad2 size={16} /> },
                    { q: "How can we collaborate?", icon: <Mail size={16} /> }
                  ].map((item, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 + 0.5 }}
                      onClick={() => handleSend(item.q)}
                      className="p-6 text-left rounded-3xl bg-white/[0.02] border border-white/5 hover:border-brand-green/50 hover:bg-brand-green/5 transition-all group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-brand-green group-hover:bg-brand-green/10 transition-all">
                          {item.icon}
                        </div>
                        <p className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">{item.q}</p>
                      </div>
                      <ChevronRight size={18} className="text-white/10 group-hover:text-brand-green group-hover:translate-x-1 transition-all" />
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-12 pb-40">
              {currentSession?.messages.map((msg) => (
                <motion.div
                  initial={{ y: 30, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  key={msg.id}
                  className={cn(
                    "flex gap-6",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-xl overflow-hidden",
                    msg.role === 'user' 
                      ? "bg-white/5 border-white/10 text-white" 
                      : "bg-brand-green/10 border-brand-green/20 text-brand-green"
                  )}>
                    {msg.role === 'user' ? <User size={22} /> : <Bug size={22} />}
                  </div>
                  <div className={cn(
                    "max-w-[85%] p-6 rounded-[2rem] border shadow-2xl preserve-3d card-3d group relative",
                    msg.role === 'user' 
                      ? "bg-white/[0.03] border-white/10 rounded-tr-none" 
                      : "bg-brand-green/[0.03] border-brand-green/20 rounded-tl-none"
                  )}>
                    <button 
                      onClick={() => deleteMessage(msg.id)}
                      className={cn(
                        "absolute top-4 opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 rounded-xl text-white/10 hover:text-red-500 transition-all z-10",
                        msg.role === 'user' ? "-left-12" : "-right-12"
                      )}
                      title="Delete message"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="space-y-4">
                      {msg.imageData && (
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-lg mb-4">
                          <img src={msg.imageData} className="max-w-full h-auto" alt="User upload" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <div className="prose prose-invert prose-emerald max-w-none font-medium leading-relaxed text-white/90">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                    {msg.role === 'model' && (
                      <div className="mt-6 flex items-center gap-2 pt-4 border-t border-white/5">
                        {isSpeaking ? (
                          <button 
                            onClick={stopSpeaking}
                            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-500 transition-all flex items-center gap-2"
                            title="Stop Listening"
                          >
                            <X size={18} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Stop</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => speak(msg.text)}
                            className="p-2.5 hover:bg-white/5 rounded-xl text-white/20 hover:text-brand-green transition-all"
                            title="Listen"
                          >
                            <Volume2 size={18} />
                          </button>
                        )}
                        <button 
                          className="p-2.5 hover:bg-white/5 rounded-xl text-white/20 hover:text-brand-green transition-all ml-auto"
                          title="Copy"
                          onClick={() => navigator.clipboard.writeText(msg.text)}
                        >
                          <Layers size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green">
                    <Bug size={22} />
                  </div>
                  <div className="bg-brand-green/[0.03] border border-brand-green/20 p-6 rounded-[2rem] rounded-tl-none flex gap-1.5 items-center shadow-2xl">
                    <div className="typing-dot" style={{ animationDelay: '0ms' }} />
                    <div className="typing-dot" style={{ animationDelay: '150ms' }} />
                    <div className="typing-dot" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 bg-gradient-to-t from-brand-black via-brand-black/95 to-transparent z-40">
          <div className="max-w-4xl mx-auto relative">
            {selectedImage && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute bottom-full left-0 mb-6 p-3 rounded-3xl bg-brand-black/80 border border-white/10 backdrop-blur-2xl flex items-center gap-4 shadow-2xl"
              >
                <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shadow-inner bg-brand-black">
                  <img src={selectedImage} className="w-full h-full object-cover" alt="Selected" referrerPolicy="no-referrer" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Image Attached</p>
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all text-[10px] font-black uppercase tracking-widest"
                  >
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                </div>
              </motion.div>
            )}
            
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-green/20 via-brand-green/5 to-brand-green/20 rounded-[2.5rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              <div className="relative glass-panel p-2 flex items-end gap-2 green-glow focus-within:border-brand-green/50 transition-all shadow-[0_30px_60px_rgba(0,0,0,0.6)] rounded-[2.5rem]">
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />
                <div className="flex items-center gap-1 p-1">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-full hover:bg-white/5 text-white/30 hover:text-white transition-all hover:scale-110 active:scale-90"
                    title="Attach image"
                  >
                    <Paperclip size={22} />
                  </button>
                  <button 
                    onClick={startSpeechToText}
                    className={cn(
                      "p-4 rounded-full transition-all relative group/mic hover:scale-110 active:scale-90",
                      isListening ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)]" : "hover:bg-white/5 text-white/30 hover:text-white"
                    )}
                  >
                    {isListening ? (
                      <div className="relative">
                        <X size={22} />
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-ping" />
                      </div>
                    ) : (
                      <Mic size={22} />
                    )}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-3 py-1.5 bg-brand-black border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover/mic:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-2xl">
                      {isListening ? "Stop Listening" : "Voice Input"}
                    </div>
                  </button>
                </div>

                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                      (e.target as HTMLTextAreaElement).style.height = 'auto';
                    }
                  }}
                  placeholder="Ask Jangkrik anything..."
                  className="flex-1 bg-transparent border-none focus:ring-0 outline-none resize-none py-5 px-4 text-base md:text-lg max-h-40 font-medium placeholder:text-white/10 overflow-y-auto scrollbar-hide appearance-none"
                />

                <div className="p-1">
                  <button 
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !selectedImage) || isTyping}
                    className={cn(
                      "p-5 rounded-full transition-all shadow-2xl flex items-center justify-center",
                      (!input.trim() && !selectedImage) || isTyping
                        ? "bg-white/5 text-white/10"
                        : "bg-brand-green text-brand-black hover:scale-110 active:scale-90 green-glow"
                    )}
                  >
                    <Send size={22} className={cn(input.trim() || selectedImage ? "translate-x-0.5 -translate-y-0.5" : "")} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center gap-8 mt-6">
              <div className="flex items-center gap-2 opacity-20">
                <div className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />
                <p className="text-[9px] font-black text-white uppercase tracking-[0.4em]">Secure Link</p>
              </div>
              <div className="flex items-center gap-2 opacity-20">
                <div className="w-1 h-1 rounded-full bg-brand-green animate-pulse" style={{ animationDelay: '500ms' }} />
                <p className="text-[9px] font-black text-white uppercase tracking-[0.4em]">Neural Core v3.1</p>
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Modal */}
        <AnimatePresence>
          {showPortfolio && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-brand-black/90 backdrop-blur-2xl perspective-1000"
            >
              <motion.div
                initial={{ scale: 0.9, y: 50, rotateX: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, rotateX: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 50, rotateX: 10, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                className="w-full max-w-6xl h-full max-h-[92vh] glass-panel overflow-hidden flex flex-col relative preserve-3d shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand-green to-transparent opacity-50" />
                
                <button 
                  onClick={() => setShowPortfolio(false)}
                  className="absolute top-6 right-6 p-3 hover:bg-white/10 rounded-2xl z-50 transition-colors group"
                >
                  <X size={28} className="group-hover:rotate-90 transition-transform" />
                </button>

                <div className="flex-1 overflow-y-auto p-8 md:p-20 space-y-24 scrollbar-hide">
                  {/* Hero Section */}
                  <section className="space-y-8 relative">
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-brand-green/10 border border-brand-green/20 text-brand-green text-[10px] font-black uppercase tracking-[0.3em]"
                    >
                      <Sparkles size={14} />
                      <span>Intelligence Profile</span>
                    </motion.div>
                    <div className="space-y-4">
                      <motion.h2 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.85] font-display"
                      >
                        ARIFANDI <br />
                        <span className="text-brand-green">TANGGAHMA</span>
                      </motion.h2>
                      <motion.p 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-2xl text-white/50 max-w-3xl leading-relaxed font-medium"
                      >
                        Jangkrik or Arifandi Tanggahma is an ordinary school kid who really likes coding, is interested in coding, Arif has made his own game, class website, and get various certificates from dicoding.
                      </motion.p>
                    </div>
                  </section>

                  {/* Skills Grid */}
                  <section className="space-y-12">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-white/5" />
                      <h3 className="text-sm font-black uppercase tracking-[0.4em] text-white/20">What I Can Do</h3>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { icon: <Gamepad2 size={32} />, title: "Game Dev", desc: "Crafting interactive worlds and mechanics.", color: "text-blue-400" },
                        { icon: <Globe size={32} />, title: "Web Systems", desc: "Architecting modern digital experiences.", color: "text-purple-400" },
                        { icon: <Brain size={32} />, title: "AI Neural", desc: "Training models and exploring LLMs.", color: "text-brand-green" },
                        { icon: <Layers size={32} />, title: "Make 2D/3D Assets", desc: "Modeling high-fidelity game assets.", color: "text-orange-400" },
                        { icon: <Palette size={32} />, title: "Painter/Art", desc: "Traditional painting and digital art.", color: "text-pink-400" }
                      ].map((skill, i) => (
                        <motion.div 
                          key={i} 
                          initial={{ scale: 0.9, opacity: 0 }}
                          whileInView={{ scale: 1, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.1 }}
                          className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:border-brand-green/30 transition-all group relative overflow-hidden card-3d"
                        >
                          <div className={cn("mb-6 group-hover:scale-110 transition-transform", skill.color)}>
                            {skill.icon}
                          </div>
                          <h4 className="font-black text-2xl mb-2 tracking-tight">{skill.title}</h4>
                          <p className="text-base text-white/30 font-medium leading-relaxed">{skill.desc}</p>
                        </motion.div>
                      ))}
                    </div>
                  </section>

                  {/* Certificates */}
                  <section className="space-y-12">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-white/5" />
                      <h3 className="text-sm font-black uppercase tracking-[0.4em] text-white/20">Certificates</h3>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        "Deep Learning Fundamentals",
                        "Machine Learning Mastery",
                        "AI Development with Python",
                        "AI Engineer"
                      ].map((cert, i) => (
                        <motion.div 
                          key={i} 
                          initial={{ x: i % 2 === 0 ? -20 : 20, opacity: 0 }}
                          whileInView={{ x: 0, opacity: 1 }}
                          viewport={{ once: true }}
                          className="flex items-center gap-6 p-6 rounded-3xl bg-brand-green/[0.03] border border-brand-green/10 hover:bg-brand-green/[0.06] transition-all group"
                        >
                          <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center text-brand-green shrink-0 group-hover:rotate-12 transition-transform">
                            <Award size={32} />
                          </div>
                          <div className="space-y-1">
                            <span className="font-black text-xl tracking-tight text-white/90">{cert}</span>
                            <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">Verified Certificate From Dicoding</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>

                  {/* Contact CTA */}
                  <section className="relative p-12 md:p-24 rounded-[3rem] bg-brand-green text-brand-black overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10 space-y-10 text-center">
                      <h3 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">READY FOR THE <br />NEXT LEVEL?</h3>
                      <p className="text-xl md:text-2xl font-bold opacity-70 max-w-2xl mx-auto">Let's collaborate on your next big idea. I'm available for freelance and full-time opportunities.</p>
                      <div className="flex flex-wrap justify-center gap-4">
                        <a 
                          href="mailto:arifandicicak@gmail.com"
                          className="inline-flex items-center gap-4 px-10 py-5 rounded-3xl bg-brand-black text-white font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
                        >
                          <Mail size={24} />
                          <span>HIRE ME</span>
                        </a>
                        <div className="flex gap-4">
                          <button className="p-5 rounded-3xl bg-brand-black/10 hover:bg-brand-black/20 transition-all">
                            <Github size={24} />
                          </button>
                          <button className="p-5 rounded-3xl bg-brand-black/10 hover:bg-brand-black/20 transition-all">
                            <Globe size={24} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
