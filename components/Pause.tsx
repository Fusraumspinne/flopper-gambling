"use client";
import React from "react";

function Pause() {
  return (
    <div className="min-h-screen bg-[#0f212e] flex flex-col items-center justify-center p-8 text-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-[#2f4553] border-t-pink-400 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">✋</span>
            </div>
          </div>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent mb-4">
          Time for a Short Break
        </h1>

        <p className="text-[#b1bad3] text-xl mb-6">
          A little break will do you good — you addicted players, rest your nerves, get some fresh air,
          and step away from the high score frenzy for a moment
        </p>
    
        <p className="text-sm text-[#557086]">
          Estimated return: shortly — Play responsibly and take care of yourself
        </p>
      </div>
    </div>
  );
}

export default Pause;
