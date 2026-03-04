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
  const [userData, setUserData] = useState<UserData | null>(null);
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

  if (!user || !userData) return null;

  const firstName = user.displayName?.split(' ')[0] || 'مستخدم';
  const showCountdown = userData.questionsLeft === 0 || userData.audioMinutesLeft === 0;

  return (
    <div className="w-full bg-[#0a0a0a] border-b border-white/5 py-3 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-white">

        {/* Welcome Section */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
             <i className="fa-solid fa-sparkles text-indigo-400"></i>
          </div>
          <div className="flex flex-col text-right">
            <h3 className="text-sm font-bold">أهلاً بك يا {firstName}</h3>
            <p className="text-[10px] text-white/40 uppercase font-black tracking-wider">رصيدك المتاح اليوم</p>
          </div>
        </div>

        {/* Quotas Section */}
        <div className="flex items-center gap-8 justify-center md:justify-start">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-white/40 uppercase font-bold mb-1">الرسائل</span>
            <span className="text-sm font-black text-indigo-400">{userData.questionsLeft} / 10</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-white/40 uppercase font-bold mb-1">الصوت (دقيقة)</span>
            <span className="text-sm font-black text-indigo-400">{userData.audioMinutesLeft} / 5</span>
          </div>
        </div>

        {/* Action & Timer Section */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          {showCountdown && (
            <div className="flex flex-col items-end">
               <span className="text-[9px] text-indigo-400 font-black uppercase">يتجدد الرصيد في:</span>
               <span className="text-xs font-mono font-bold text-white/80">{timeLeft}</span>
            </div>
          )}
          <button
            onClick={() => alert("قريباً!")}
            className="bg-white text-black px-4 py-2 rounded-xl font-black text-[10px] hover:bg-gray-200 transition-all shadow-lg active:scale-95"
          >
            💎 باقات التميز
          </button>
        </div>

      </div>
    </div>
  );
};

export default UserStatsCard;
