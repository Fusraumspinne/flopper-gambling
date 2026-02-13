"use client";
import React, { useState } from 'react'

function Wartungspause() {
  const [changes, setChanges] = useState<string>("I am making some exciting updates to enhance your experience!");

  return (
    <div className="min-h-screen bg-[#0f212e] flex flex-col items-center justify-center p-8 text-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-[#2f4553] border-t-pink-400 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">🎲</span>
            </div>
          </div>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent mb-4">
          Shuffling the Deck...
        </h1>

        <p className="text-[#b1bad3] text-xl mb-6">
          Flopper Gambling is currently undergoing a quick maintenance break
        </p>

        <div className="bg-[#213743] border border-[#2f4553]/60 rounded-xl p-6 mb-8">
          <p className="text-[#557086] text-sm uppercase tracking-widest font-bold mb-2">
            Status Update
          </p>
          <p className="text-white text-lg">
            {changes}
            <br />
            <span className="text-yellow-300/80 italic">Don't worry, your balance is safe</span>
          </p>
        </div>

        <p className="text-sm text-[#557086]">
          Estimated uptime: A few hours • Play responsibly • Follow us for updates
        </p>
        
        <div className="mt-8 flex gap-4 justify-center">
          <div className="h-1 w-12 bg-[#2f4553] rounded-full" />
          <div className="h-1 w-12 bg-pink-400 rounded-full" />
          <div className="h-1 w-12 bg-[#2f4553] rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default Wartungspause