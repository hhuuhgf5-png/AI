
import React, { useState, useEffect, useRef } from 'react';
import { decode, pcmToWavUrl } from '../audioUtils';

interface AudioPlayerProps {
  base64Data: string;
  autoPlay?: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ base64Data, autoPlay = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    // Convert base64 PCM to a playable WAV URL
    const binary = decode(base64Data);
    const url = pcmToWavUrl(binary, 24000);
    setAudioUrl(url);

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [base64Data]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime += seconds;
  };

  const changeSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `audio_${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = parseFloat(e.target.value);
    if (audioRef.current) {
      const newTime = (newProgress / 100) * duration;
      audioRef.current.currentTime = newTime;
      setProgress(newProgress);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/10 shadow-2xl w-full mt-6 space-y-6 backdrop-blur-3xl animate-fadeIn">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          autoPlay={autoPlay}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const current = audioRef.current.currentTime;
              const dur = audioRef.current.duration;
              setCurrentTime(current);
              setDuration(dur);
              setProgress((current / dur) * 100);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          hidden
        />
      )}

      {/* Main Controls Row */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => skip(-10)}
            className="w-12 h-12 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 active:scale-90 rounded-2xl transition-all border border-transparent hover:border-white/10"
            title="تأخير 10 ثوان"
          >
            <i className="fa-solid fa-rotate-left text-lg"></i>
          </button>
          
          <button 
            onClick={togglePlay}
            className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-3xl hover:bg-indigo-50 transition-all shadow-[0_15px_30px_rgba(255,255,255,0.1)] active:scale-95"
          >
            <i className={`fa-solid ${isPlaying ? 'fa-pause text-2xl' : 'fa-play text-2xl ml-1'}`}></i>
          </button>

          <button 
            onClick={() => skip(10)}
            className="w-12 h-12 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 active:scale-90 rounded-2xl transition-all border border-transparent hover:border-white/10"
            title="تقديم 10 ثوان"
          >
            <i className="fa-solid fa-rotate-right text-lg"></i>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownload}
            className="bg-white/5 border border-white/10 text-white/40 w-12 h-12 flex items-center justify-center rounded-2xl text-sm font-bold shadow-sm hover:bg-white/10 hover:text-white active:scale-90 transition-all"
            title="تحميل الملف"
          >
            <i className="fa-solid fa-download"></i>
          </button>
          <button 
            onClick={changeSpeed}
            className="bg-white/5 border border-white/10 text-white/40 px-4 h-12 flex items-center justify-center rounded-2xl text-[10px] font-black shadow-sm hover:bg-white/10 hover:text-white active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest"
          >
            <i className="fa-solid fa-gauge-high text-xs"></i>
            {playbackRate}x
          </button>
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-3">
        <div className="relative h-6 group flex items-center">
          <input 
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress || 0}
            onChange={handleProgressChange}
            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white focus:outline-none"
          />
        </div>
        <div className="flex justify-between text-[10px] font-black text-white/20 font-mono tracking-widest">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      
      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #ffffff;
          border-radius: 50%;
          cursor: pointer;
          border: 3px solid #000;
          box-shadow: 0 0 15px rgba(255,255,255,0.3);
          transition: transform 0.2s ease;
        }
        input[type='range']:active::-webkit-slider-thumb {
          transform: scale(1.5);
        }
      `}</style>
    </div>
  );
};

export default AudioPlayer;
