
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HistoryItem, Dialect, UserUsage } from './types';

interface LayoutProps {
  children: React.ReactNode;
  activeFeature: string;
  setActiveFeature: (feat: string) => void;
  history: HistoryItem[];
  onHistoryClick: (item: HistoryItem) => void;
  onClearHistory: () => void;
  user: any;
  usage: UserUsage | null;
  onLogin: () => void;
  onLogout: () => void;
  selectedDialect: Dialect;
  onDialectChange: (dialect: Dialect) => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeFeature, 
  setActiveFeature, 
  history, 
  onHistoryClick, 
  onClearHistory,
  user,
  usage,
  onLogin,
  onLogout,
  selectedDialect,
  onDialectChange
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] flex flex-col" dir="rtl">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-black/95 md:backdrop-blur-2xl border-b border-white/5 py-3' : 'bg-black/60 md:backdrop-blur-md py-6'
      }`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-white/5 hover:bg-white hover:text-black active:scale-90 rounded-2xl transition-all text-white/40 border border-white/10 shadow-xl"
            >
              <i className="fa-solid fa-bars-staggered text-lg"></i>
            </button>
            <div 
              className="flex items-center gap-3 md:gap-4 cursor-pointer group" 
              onClick={() => setActiveFeature('home')}
            >
              <div className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-all duration-700">
                <i className="fa-solid fa-graduation-cap text-black text-xl md:text-2xl"></i>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter hidden sm:block font-serif italic leading-none">
                  الـ<span className="text-indigo-500">منصة</span>
                </h1>
                <span className="text-[8px] text-white/20 font-black uppercase tracking-[0.3em] mt-1.5 hidden sm:block">الذكاء الاصطناعي التعليمي</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            {/* Dialect Selector in Header */}
            <div className="hidden md:flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
              {(['standard', 'egyptian', 'saudi', 'lebanese', 'maghrebi'] as Dialect[]).map((d) => (
                <button
                  key={d}
                  onClick={() => onDialectChange(d)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectedDialect === d ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {d === 'standard' ? 'الفصحى' : d === 'egyptian' ? 'المصرية' : d === 'saudi' ? 'السعودية' : d === 'lebanese' ? 'اللبنانية' : 'المغربية'}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setActiveFeature('live')}
              className="flex items-center gap-3 bg-white/5 text-white border border-white/10 px-6 md:px-8 py-3 md:py-4 rounded-2xl font-black hover:bg-white hover:text-black transition-all active:scale-95 text-[10px] tracking-widest uppercase shadow-2xl"
            >
              <i className="fa-solid fa-microphone-lines text-indigo-400"></i>
              <span className="hidden md:inline">مباشر</span>
            </button>

            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl overflow-hidden border shadow-2xl p-1 transition-all ${
                    showUserMenu ? 'bg-white border-white' : 'bg-white/5 border-white/10 hover:border-white/30'
                  }`}
                >
                  <img 
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`} 
                    alt={user.displayName} 
                    referrerPolicy="no-referrer" 
                    className={`w-full h-full object-cover rounded-xl transition-opacity ${showUserMenu ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`} 
                  />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <div className="absolute top-full left-0 mt-4 w-72 bg-black border border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] p-6 space-y-6 animate-fadeIn z-[100]">
                      <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                        <img 
                          src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`} 
                          alt="" 
                          className="w-12 h-12 rounded-full border border-white/10" 
                        />
                        <div className="flex flex-col min-w-0">
                          <p className="text-sm font-black text-white truncate">{user.displayName}</p>
                          <p className="text-[9px] text-white/40 truncate">{user.email}</p>
                        </div>
                      </div>

                      {/* Usage Stats */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                            <span className="text-white/40">الرسائل اليومية</span>
                            <span className={usage && usage.messagesUsed >= 10 ? 'text-red-500' : 'text-indigo-400'}>
                              {usage ? usage.messagesUsed : 0} / 10
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(((usage?.messagesUsed || 0) / 10) * 100, 100)}%` }}
                              className={`h-full ${usage && usage.messagesUsed >= 10 ? 'bg-red-500' : 'bg-indigo-500'}`}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                            <span className="text-white/40">الدقائق الصوتية</span>
                            <span className={usage && usage.audioSecondsUsed >= 300 ? 'text-red-500' : 'text-emerald-400'}>
                              {usage ? formatAudioTime(usage.audioSecondsUsed) : '0:00'} / 5:00
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(((usage?.audioSecondsUsed || 0) / 300) * 100, 100)}%` }}
                              className={`h-full ${usage && usage.audioSecondsUsed >= 300 ? 'bg-red-500' : 'bg-emerald-500'}`}
                            />
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => { onLogout(); setShowUserMenu(false); }}
                        className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/5"
                      >
                        تسجيل الخروج
                      </button>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button 
                onClick={onLogin}
                className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-white text-black rounded-2xl shadow-xl hover:bg-indigo-50 active:scale-90 transition-all"
              >
                <i className="fa-solid fa-user-plus text-lg"></i>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar / Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 md:backdrop-blur-md z-50 transition-opacity duration-500" 
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-[#050505] z-[60] shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col border-l border-white/10"
            >
              <div className="p-8 md:p-10 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white/5 text-indigo-400 rounded-2xl flex items-center justify-center border border-white/10 shadow-xl">
                    <i className="fa-solid fa-clock-rotate-left text-lg"></i>
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-xl md:text-2xl font-black text-white font-serif italic leading-none">سجل النشاط</h2>
                    <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em] mt-2">تاريخ عملياتك</span>
                  </div>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="w-12 h-12 flex items-center justify-center hover:bg-white/5 active:scale-90 rounded-2xl transition-all text-white/20 hover:text-white border border-transparent hover:border-white/10">
                  <i className="fa-solid fa-xmark text-2xl"></i>
                </button>
              </div>

              {/* Mobile Dialect Selector in Sidebar */}
              <div className="lg:hidden p-6 border-b border-white/5 bg-white/[0.01]">
                <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mb-4">اختر اللهجة</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['standard', 'egyptian', 'saudi', 'lebanese', 'maghrebi'] as Dialect[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => onDialectChange(d)}
                      className={`px-3 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                        selectedDialect === d ? 'bg-white text-black border-white shadow-xl' : 'text-white/40 border-white/5 hover:bg-white/5'
                      }`}
                    >
                      {d === 'standard' ? 'الفصحى' : d === 'egyptian' ? 'المصرية' : d === 'saudi' ? 'السعودية' : d === 'lebanese' ? 'اللبنانية' : 'المغربية'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-4">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 opacity-10">
                  <i className="fa-solid fa-folder-open text-7xl mb-6"></i>
                  <p className="text-center font-bold text-lg tracking-widest uppercase">السجل فارغ</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...history].reverse().map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onHistoryClick(item);
                        setIsSidebarOpen(false);
                      }}
                      className="w-full text-right p-6 hover:bg-white/[0.04] active:scale-[0.98] rounded-[2.5rem] border border-white/[0.03] hover:border-white/10 transition-all group bg-white/[0.01] shadow-xl"
                    >
                      <div className="flex items-start gap-5">
                         <div className="w-14 h-14 shrink-0 flex items-center justify-center rounded-2xl bg-white/[0.03] group-hover:bg-indigo-500 text-white/40 group-hover:text-white transition-all duration-500 border border-white/[0.05] shadow-2xl">
                           <FeatureIcon type={item.type} />
                         </div>
                         <div className="flex-1 min-w-0 pt-1">
                            <p className="font-black text-base text-white/80 truncate group-hover:text-white transition-colors tracking-tight">{item.title}</p>
                            <p className="text-[10px] text-white/20 mt-3 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                              <i className="fa-regular fa-clock text-indigo-400/50"></i>
                              {new Date(item.timestamp).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </p>
                         </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {history.length > 0 && (
              <div className="p-8 border-t border-white/5 bg-white/[0.01]">
                <button 
                  onClick={onClearHistory}
                  className="w-full py-5 bg-red-500/5 text-red-500 border border-red-500/20 rounded-3xl font-black hover:bg-red-500 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-3 text-xs tracking-[0.2em] uppercase shadow-2xl shadow-red-500/10"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  مسح السجل بالكامل
                </button>
              </div>
            )}

            {/* Sidebar Download Button */}
            <div className="p-8 border-t border-white/5">
              <a 
                href="/api/export" 
                download
                className="w-full flex items-center justify-center gap-3 bg-white text-black py-5 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all active:scale-95 shadow-2xl shadow-white/5"
              >
                <i className="fa-solid fa-download"></i>
                تصدير المشروع (ZIP)
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-24 md:py-32">
        {children}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:flex max-w-7xl mx-auto w-full px-12 py-16 border-t border-white/5 justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
            <i className="fa-solid fa-graduation-cap text-indigo-400 text-xl"></i>
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm tracking-widest uppercase text-white">منصة التعلم الذكية</span>
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-1">© ٢٠٢٦ جميع الحقوق محفوظة</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-6">
          <a 
            href="/api/export" 
            download
            className="bg-white text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-50 active:scale-95 transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] flex items-center gap-4 group"
          >
            <i className="fa-solid fa-file-zipper text-lg group-hover:rotate-12 transition-transform"></i>
            تحميل كود المصدر (ZIP)
          </a>
          <div className="flex gap-10">
            <a href="#" className="text-white/40 hover:text-white transition-colors font-bold text-[10px] uppercase tracking-widest">الخصوصية</a>
            <a href="#" className="text-white/40 hover:text-white transition-colors font-bold text-[10px] uppercase tracking-widest">الشروط</a>
            <a href="#" className="text-white/40 hover:text-white transition-colors font-bold text-[10px] uppercase tracking-widest">اتصل بنا</a>
          </div>
        </div>
      </footer>

      {/* Mobile Nav */}
      <footer className="md:hidden bg-black/95 md:backdrop-blur-2xl border-t border-white/5 p-4 flex justify-around items-center sticky bottom-0 z-30">
         <button onClick={() => setActiveFeature('home')} className={`flex flex-col items-center gap-2 p-2 flex-1 transition-all active:scale-90 ${activeFeature === 'home' ? 'text-indigo-400' : 'text-white/30'}`}>
            <i className="fa-solid fa-house text-xl"></i>
            <span className="text-[10px] font-black uppercase tracking-tighter">الرئيسية</span>
         </button>
         <button onClick={() => setActiveFeature('live')} className={`flex flex-col items-center gap-2 p-2 flex-1 transition-all active:scale-90 ${activeFeature === 'live' ? 'text-indigo-400' : 'text-white/30'}`}>
            <i className="fa-solid fa-microphone-lines text-xl"></i>
            <span className="text-[10px] font-black uppercase tracking-tighter">مباشر</span>
         </button>
         <button onClick={() => setIsSidebarOpen(true)} className="flex flex-col items-center gap-2 p-2 flex-1 text-white/30 transition-all active:scale-90">
            <i className="fa-solid fa-clock-rotate-left text-xl"></i>
            <span className="text-[10px] font-black uppercase tracking-tighter">السجل</span>
         </button>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

const FeatureIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'assistant': return <i className="fa-solid fa-robot"></i>;
    case 'tts': return <i className="fa-solid fa-volume-high"></i>;
    case 'podcast': return <i className="fa-solid fa-podcast"></i>;
    case 'flashcards': return <i className="fa-solid fa-layer-group"></i>;
    case 'explainer': return <i className="fa-solid fa-book-open-reader"></i>;
    case 'analyzer': return <i className="fa-solid fa-file-magnifying-glass"></i>;
    case 'video': return <i className="fa-solid fa-video"></i>;
    default: return <i className="fa-solid fa-circle-info"></i>;
  }
}

export default Layout;
