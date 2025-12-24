import Link from "next/link";
import { Casino, Diamond, GridOn, MonetizationOn, ScatterPlot, SportsMma, ShowChart } from "@mui/icons-material";

export default function Home() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Casino Lobby</h1>
        <p className="text-[#b1bad3]">Welcome to Flopper Gambling. Select a game to start playing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          href="/keno"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <GridOn sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Keno</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Pick 10 numbers</p>
          </div>
        </Link>

        <Link
          href="/blackjack"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <Casino sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Blackjack</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Beat the dealer</p>
          </div>
        </Link>

        <Link
          href="/plinko"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <ScatterPlot sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Plinko</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Drop and win</p>
          </div>
        </Link>

        <Link
          href="/limbo"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <ShowChart sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Limbo</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Hit your target multiplier</p>
          </div>
        </Link>

        <Link
          href="/mines"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <Diamond sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Mines</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Find diamonds, avoid mines</p>
          </div>
        </Link>

        <Link
          href="/coinflip"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <MonetizationOn sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Coin Flip</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Build a streak multiplier</p>
          </div>
        </Link>

        <Link
          href="/rps"
          className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group"
        >
          <div className="h-40 bg-[#0f212e] flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-[#213743] to-transparent opacity-50"></div>
            <SportsMma sx={{ fontSize: 48, opacity: 0.5 }} className="group-hover:opacity-100 transition-opacity text-white" />
          </div>
          <div className="p-4">
            <h3 className="text-white font-bold text-lg">Rock Paper Scissors</h3>
            <p className="text-sm text-[#b1bad3] mt-1">Build a streak and cash out</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
