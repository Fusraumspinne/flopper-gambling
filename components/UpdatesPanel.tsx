"use client";
import React, { useEffect, useState } from "react";

export default function UpdatesPanel() {
  const [items] = useState<string[]>([
    "One-month seasons: the first three are getting badges and the last one and the badge will displaced behind the name in the leaderboard",
    "Live modes (poker, crash, roulette, horse racing, blackjack) where you can play against or with other players",
    "Live chat to chat with other players while playing games"
  ]);

  if(items.length === 0) return

  return (
    <section className="mb-4 bg-[#213743] border border-[#2f4553]/60 rounded-lg p-4">
    <div className="flex flex-col items-start space-y-1">
        <h2 className="text-lg font-semibold text-white">Upcoming Updates</h2>
        <div className="text-xs text-[#9fb0c8]">If you got ideas to make the website better reach out to me</div>
    </div>

      <div className="mt-3 list-decimal list-inside space-y-2 text-sm">
        {items.length === 0 && <li className="text-[#557086]">No updates</li>}

        {items.map((it, idx) => (
          <div
            key={idx}
            className="bg-[#0f212e] border border-[#2f4553]/40 rounded px-3 py-2 text-xs text-white leading-snug"
          >
            {it}
          </div>
        ))}
      </div>
    </section>
  );
}