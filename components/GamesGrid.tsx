"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { games as allGames } from "@/lib/games";
import { getGameKeyFromHref } from "@/lib/gameStatus";
import { sortByOpenCountThenName, subscribeToGameOpenCountUpdates } from "@/lib/gameOpenStats";

export default function GamesGrid({ initialAllowed }: { initialAllowed: string[] }) {
  const [allowed, setAllowed] = useState<string[]>(initialAllowed || []);
  const [loading, setLoading] = useState(false);
  const [openCountVersion, setOpenCountVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!mounted) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        const allowedNow = allGames
          .filter(g => data?.games?.[getGameKeyFromHref(g.href)] !== false)
          .map(g => g.href);
        setAllowed(allowedNow);
      } catch (e) {
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'flopper_admin_authorized') {
        load();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    return subscribeToGameOpenCountUpdates(() => {
      setOpenCountVersion((prev) => prev + 1);
    });
  }, []);

  const visibleGames = useMemo(
    () =>
      sortByOpenCountThenName(
        allGames.filter((g) => allowed.includes(g.href)),
        (game) => game.name,
        (game) => game.href
      ),
    [allowed, openCountVersion]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
      {visibleGames.map((game) => (
        <Link
          key={game.href}
          href={game.href}
          prefetch={false}
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group border border-[#2f4553]/60"
        >
          <div className="relative aspect-square bg-[#0f212e]">
            {game.image ? (
              <img
                src={game.image}
                alt={`${game.name} preview`}
                className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                loading={game.name === "Blackjack" ? "eager" : "lazy"}
                decoding="async"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-white font-extrabold text-3xl tracking-wide">{game.name}</div>
                  <div className="mt-2 text-xs text-[#557086]">No preview</div>
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#0f212e] via-[#0f212e]/80 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 px-3 pb-3 flex items-end">
              <span className="text-white font-semibold text-lg drop-shadow">{game.name}</span>
            </div>
          </div>
          <div className="p-4 pt-3">
            <p className="text-sm text-[#b1bad3]">{game.tagline}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
