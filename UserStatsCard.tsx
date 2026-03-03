import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

interface UserStatsCardProps {
  user: User | null;
}

interface UserData {
  questionsLeft: number;
  audioMinutesLeft: number;
  lastReset: any;
}

const UserStatsCard: React.FC<UserStatsCardProps> = ({ user }) => {
  const [userData, setUserData] = useState<UserData>({
    questionsLeft: 10,
    audioMinutesLeft: 5,
    lastReset: null
  });
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);

    const initializeUser = async () => {
      try {
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
          await setDoc(userDocRef, {
            questionsLeft: 10,
            audioMinutesLeft: 5,
            lastReset: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("Error initializing user data:", error);
      }
    };

    initializeUser();

    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data() as UserData);
      } else {
        setUserData({
          questionsLeft: 10,
          audioMinutesLeft: 5,
          lastReset: null
        });
      }
    }, (error) => {
      console.error("Error fetching user data:", error);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();

      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!user) return null;

  const firstName = user.displayName?.split(' ')[0] || 'مستخدم';
  const showCountdown = userData.questionsLeft === 0 || userData.audioMinutesLeft === 0;

  return (
    <div
      className="w-full max-w-7xl mx-auto px-6 md:px-12 mt-4"
      style={{ position: 'fixed', top: '80px', left: '10px', right: '10px', zIndex: 99999, backgroundColor: '#111', padding: '10px', border: '1px solid red' }}
    >
      <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>

        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-xl group-hover:scale-110 transition-transform duration-700">
             <i className="fa-solid fa-sparkles text-indigo-400 text-xl"></i>
          </div>
          <div className="flex flex-col text-right">
            <h3 className="text-xl font-black text-white font-serif italic">أهلاً بك يا {firstName}</h3>
            <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mt-1">رصيدك الحالي المتاح للاستخدام</p>
          </div>
        </div>

        <div className="flex flex-row items-center gap-8 md:gap-16">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">الرسائل</span>
            <span className="text-2xl font-black text-white tracking-tighter">{userData.questionsLeft} / 10</span>
          </div>
          <div className="w-[1px] h-10 bg-white/5 hidden md:block"></div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">الصوت (دقيقة)</span>
            <span className="text-2xl font-black text-white tracking-tighter">{userData.audioMinutesLeft} / 5</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6">
          {showCountdown && (
            <div className="flex flex-col items-center md:items-end gap-1.5">
               <span className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.2em]">يتجدد الرصيد في:</span>
               <span className="text-base font-black text-white tracking-[0.1em] font-mono bg-white/5 px-4 py-1.5 rounded-xl border border-white/5">{timeLeft}</span>
            </div>
          )}
          <button
            onClick={() => alert("قريباً!")}
            className="bg-white text-black px-8 py-4 rounded-[1.5rem] font-black text-xs hover:bg-indigo-50 transition-all active:scale-95 shadow-2xl shadow-white/5 flex items-center gap-3 tracking-widest uppercase"
          >
            <i className="fa-solid fa-gem text-indigo-500"></i>
            باقات التميز
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserStatsCard;
