"use client";

import React, { useMemo, useState } from "react";
import PlayArrow from "@mui/icons-material/PlayArrow";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GamePhase = "idle" | "spinning" | "free";
type PaySymbol = "🧀" | "🥖" | "🍺" | "🥐" | "🎩" | "🍷" | "🎻";
type SymbolId = PaySymbol | "🃏";
type GridCell =
	| { kind: "symbol"; symbol: SymbolId }
	| { kind: "rainbow" }
	| { kind: "scatter" };
type FeatureCell =
	| { kind: "coin"; tier: CoinTier; value: number; revealed?: boolean; interacting?: boolean; sucked?: boolean }
	| { kind: "clover"; value: number; revealed?: boolean; interacting?: boolean; sucked?: boolean; isGolden?: boolean }
	| { kind: "cauldron"; currentValue?: number; revealed?: boolean; interacting?: boolean; sucked?: boolean; alreadySucked?: boolean };
type CoinTier = "bronze" | "silver" | "gold" | "diamond";
type Position = [number, number];

const ROWS = 5;
const COLS = 6;
const MIN_CLUSTER = 5;

const SYMBOL_BASE_MULTI: Record<PaySymbol, number> = {
	"🧀": 0.02,
	"🥖": 0.025,
	"🍺": 0.03,
	"🥐": 0.035,
	"🎩": 0.04,
	"🍷": 0.05,
	"🎻": 0.06,
};

const SYMBOL_STEP_MULTI: Record<PaySymbol, number> = {
	"🧀": 0.003,
	"🥖": 0.0035,
	"🍺": 0.0045,
	"🥐": 0.005,
	"🎩": 0.006,
	"🍷": 0.008,
	"🎻": 0.01,
};

const SYMBOL_WEIGHTS: Record<SymbolId, number> = {
	"🧀": 15,
	"🥖": 15,
	"🍺": 15,
	"🥐": 15,
	"🎩": 15,
	"🍷": 15,
	"🎻": 15,
	"🃏": 10,
};

const SCATTER_WEIGHT = 1.25;
const RAINBOW_WEIGHT = 0.65;

const FEATURE_TYPE_WEIGHTS: [CoinTier | "clover" | "cloverGold" | "cauldron", number][] = [
	["bronze", 52],
	["silver", 27],
	["gold", 10],
	["diamond", 1.2],
	["clover", 8],
	["cloverGold", 0.75],
	["cauldron", 2],
];

const CLOVER_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25];
const CLOVER_WEIGHTS = [30, 24, 16, 11, 8, 5.2, 3.2, 1.6, 0.8, 0.25, 0.05];
const GOLDEN_CLOVER_WEIGHTS = [40, 30, 18, 10, 5, 2, 1, 0.5, 0.2, 0.05, 0.01];

const normalizeMoney = (value: number) => {
	if (!Number.isFinite(value)) return 0;
	const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
	return Object.is(rounded, -0) ? 0 : rounded;
};

const formatMoney = (v: number) =>
	normalizeMoney(v).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function pickWeighted<T extends string | number>(entries: [T, number][]) {
	const total = entries.reduce((acc, [, weight]) => acc + Math.max(0, weight), 0);
	let roll = Math.random() * total;
	for (const [item, weight] of entries) {
		roll -= Math.max(0, weight);
		if (roll <= 0) return item;
	}
	return entries[entries.length - 1][0];
}

function randomBaseCell(isFreeSpin: boolean, allowRainbow: boolean = true): GridCell {
	const table: [string, number][] = [
		...Object.entries(SYMBOL_WEIGHTS),
		["SCATTER", isFreeSpin ? SCATTER_WEIGHT * 0.9 : SCATTER_WEIGHT],
		...(allowRainbow ? [["RAINBOW", RAINBOW_WEIGHT] as [string, number]] : []),
	];

	const pick = pickWeighted(table);
	if (pick === "SCATTER") return { kind: "scatter" };
	if (pick === "RAINBOW") return { kind: "rainbow" };
	return { kind: "symbol", symbol: pick as SymbolId };
}

function buildGrid(isFreeSpin: boolean, forceScatters: boolean = false) {
	const grid: GridCell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
	let hasRainbow = false;

	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			const cell = randomBaseCell(isFreeSpin, !hasRainbow);
			if (cell.kind === "rainbow") hasRainbow = true;
			grid[row][col] = cell;
		}
	}

	if (forceScatters) {
		const scatterPositions: [number, number][] = [];
		while (scatterPositions.length < 3) {
			const row = Math.floor(Math.random() * ROWS);
			const col = Math.floor(Math.random() * COLS);
			if (!scatterPositions.some(([r, c]) => r === row && c === col)) {
				scatterPositions.push([row, col]);
				grid[row][col] = { kind: "scatter" };
			}
		}
	}

	return grid;
}

function toPosKey(row: number, col: number) {
	return `${row}-${col}`;
}

function emptyGoldMask() {
	return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
}

function hasAnyGold(mask: boolean[][]) {
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (mask[row][col]) return true;
		}
	}
	return false;
}

function countType(grid: GridCell[][], kind: GridCell["kind"]) {
	let count = 0;
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (grid[row][col].kind === kind) count += 1;
		}
	}
	return count;
}

function displaySymbol(cell: GridCell) {
	if (cell.kind === "scatter") return "📷";
	if (cell.kind === "rainbow") return "🌈";
	return cell.symbol;
}

function randomReelSymbol() {
	return pickWeighted<string>([
		["🧀", 22],
		["🥖", 21],
		["🍺", 20],
		["🍷", 19],
		["🎻", 16],
		["🥐", 17],
		["🎩", 14],
		["🃏", 6],
		["🌈", 0.5],
		["📷", 3],
	]);
}

function gridToReelFrames(sourceGrid: GridCell[][]) {
	return Array.from({ length: COLS }, (_, col) =>
		Array.from({ length: ROWS }, (_, row) => displaySymbol(sourceGrid[row][col]))
	);
}

function matchesTarget(cell: GridCell, target: PaySymbol) {
	if (cell.kind !== "symbol") return false;
	return cell.symbol === target || cell.symbol === "🃏";
}

function getClusterPayoutMulti(symbol: PaySymbol, count: number) {
	const base = SYMBOL_BASE_MULTI[symbol];
	const step = SYMBOL_STEP_MULTI[symbol];
	const extra = Math.max(0, count - MIN_CLUSTER);
	return normalizeMoney(base + step * extra);
}

function findClusters(grid: GridCell[][]) {
	const clusters: { symbol: PaySymbol; positions: Position[] }[] = [];
	const globallyTaken = new Set<string>();
	const dirs: Position[] = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];

	const orderedSymbols: PaySymbol[] = ["🎻", "🍷", "🎩", "🥐", "🍺", "🥖", "🧀"];

	for (const target of orderedSymbols) {
		const visited = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));

		for (let startRow = 0; startRow < ROWS; startRow++) {
			for (let startCol = 0; startCol < COLS; startCol++) {
				if (visited[startRow][startCol]) continue;
				if (globallyTaken.has(toPosKey(startRow, startCol))) continue;
				if (!matchesTarget(grid[startRow][startCol], target)) continue;

				const queue: Position[] = [[startRow, startCol]];
				const comp: Position[] = [];
				visited[startRow][startCol] = true;

				while (queue.length > 0) {
					const [row, col] = queue.shift()!;
					comp.push([row, col]);

					for (const [dr, dc] of dirs) {
						const nr = row + dr;
						const nc = col + dc;
						if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
						if (visited[nr][nc]) continue;
						if (globallyTaken.has(toPosKey(nr, nc))) continue;
						if (!matchesTarget(grid[nr][nc], target)) continue;
						visited[nr][nc] = true;
						queue.push([nr, nc]);
					}
				}

				if (comp.length < MIN_CLUSTER) continue;

				const hasRealTarget = comp.some(([r, c]) => {
					const cell = grid[r][c];
					return cell.kind === "symbol" && cell.symbol === target;
				});
				if (!hasRealTarget) continue;

				comp.forEach(([r, c]) => globallyTaken.add(toPosKey(r, c)));
				clusters.push({ symbol: target, positions: comp });
			}
		}
	}

	return clusters;
}

function tumble(grid: GridCell[][], remove: Set<string>, isFreeSpin: boolean) {
	const nextGrid: GridCell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null as unknown as GridCell));
	const droppedIndices = new Set<string>();

	let hasRainbow = false;
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (!remove.has(toPosKey(row, col)) && grid[row][col].kind === "rainbow") {
				hasRainbow = true;
				break;
			}
		}
		if (hasRainbow) break;
	}

	for (let col = 0; col < COLS; col++) {
		const survivors: { cell: GridCell; oldRow: number }[] = [];
		for (let row = 0; row < ROWS; row++) {
			if (!remove.has(toPosKey(row, col))) {
				survivors.push({ cell: grid[row][col], oldRow: row });
			}
		}

		const numberOfNew = ROWS - survivors.length;

		for (let i = 0; i < numberOfNew; i++) {
			const newCell = randomBaseCell(isFreeSpin, !hasRainbow);
			if (newCell.kind === "rainbow") hasRainbow = true;
			nextGrid[i][col] = newCell;
			droppedIndices.add(toPosKey(i, col));
		}

		for (let i = 0; i < survivors.length; i++) {
			const newRow = i + numberOfNew;
			nextGrid[newRow][col] = survivors[i].cell;
			if (newRow !== survivors[i].oldRow) {
				droppedIndices.add(toPosKey(newRow, col));
			}
		}
	}

	return { nextGrid, droppedIndices };
}

function getTierForValue(value: number): CoinTier {
	if (value < 3) return "bronze";
	if (value < 7) return "silver";
	if (value < 15) return "gold";
	return "diamond";
}

function randomCoinValue(tier: CoinTier) {
	if (tier === "bronze") return Math.floor(Math.random() * 2) + 1; // 1-2
	if (tier === "silver") return Math.floor(Math.random() * 3) + 3; // 3-5
	if (tier === "gold") return Math.floor(Math.random() * 5) + 6; // 6-10
	return Math.floor(Math.random() * 15) + 11; // 11-25
}

function randomCloverValue(isGolden: boolean = false) {
	const weights = isGolden ? GOLDEN_CLOVER_WEIGHTS : CLOVER_WEIGHTS;
	return pickWeighted<number>(CLOVER_VALUES.map((v, i) => [v, weights[i]]));
}

function randomFeatureCell(): FeatureCell {
	const type = pickWeighted(FEATURE_TYPE_WEIGHTS);
	if (type === "clover") return { kind: "clover", value: randomCloverValue(false) };
	if (type === "cloverGold") return { kind: "clover", value: randomCloverValue(true), isGolden: true };
	if (type === "cauldron") return { kind: "cauldron" };
	return { kind: "coin", tier: type as CoinTier, value: randomCoinValue(type as CoinTier) };
}

function adjacent8(row: number, col: number): Position[] {
	const out: Position[] = [];
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if (dr === 0 && dc === 0) continue;
			const nr = row + dr;
			const nc = col + dc;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
			out.push([nr, nc]);
		}
	}
	return out;
}



function FeatureCoin({ tier, value, label }: { tier: CoinTier; value?: number; label?: string }) {
	const colors: Record<CoinTier, { main: string; border: string; text: string }> = {
		bronze: { main: "#d97706", border: "#78350f", text: "#fef3c7" },
		silver: { main: "#cbd5e1", border: "#475569", text: "#0f172a" },
		gold: { main: "#fcd34d", border: "#92400e", text: "#451a03" },
		diamond: { main: "#ffffff", border: "#0ea5e9", text: "#0c4a6e" },
	};

	const c = colors[tier];

	if (tier === "diamond") {
		return (
			<div className="relative w-full h-full flex items-center justify-center animate-feature-pop group">
				<div className="relative w-[90%] h-[90%] flex items-center justify-center">
					<svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible">
						<path 
							d="M25,15 L75,15 L95,40 L50,90 L5,40 Z" 
							fill={c.main} 
							stroke={c.border} 
							strokeWidth="4"
							strokeLinejoin="round"
						/>
						<path d="M25,15 L5,40 L50,40 L25,15 Z" fill="white" fillOpacity="0.4" />
						<path d="M75,15 L95,40 L50,40 L75,15 Z" fill="white" fillOpacity="0.1" />
						<path d="M25,15 L75,15 L50,40 Z" fill="white" fillOpacity="0.6" />
						<path d="M5,40 L50,90 L50,40 Z" fill="black" fillOpacity="0.05" />
						<path d="M95,40 L50,90 L50,40 Z" fill="black" fillOpacity="0.1" />
						<circle cx="35" cy="25" r="4" fill="white" fillOpacity="0.8" />
                        
						<path d="M25,15 L75,15 L95,40 L50,90 L5,40 Z" fill="none" stroke={c.border} strokeWidth="4" strokeLinejoin="round" />
					</svg>
					<div 
						className="absolute inset-x-0 bottom-[40%] flex items-center justify-center font-black select-none text-[0.85rem]"
						style={{ color: c.text, textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}
					>
						{value}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="relative w-full h-full flex items-center justify-center animate-feature-pop group">
			<div 
				className="w-[85%] h-[85%] rounded-full flex items-center justify-center border-4 shadow-lg transition-colors duration-300"
				style={{ 
					backgroundColor: c.main,
					borderColor: c.border,
					color: c.text
				}}
			>
				<div 
					className="font-black text-center select-none"
					style={{ 
						fontSize: "0.9rem",
						textShadow: "0 1px 0 rgba(255,255,255,0.2)"
					}}
				>
					{value}
				</div>
			</div>
		</div>
	);
}

function FeatureClover({ value, revealed, isGolden }: { value: number; revealed?: boolean; isGolden?: boolean }) {
	const bgColor = isGolden ? "bg-[#eab308]" : "bg-[#22c55e]";
	const borderColor = isGolden ? "border-[#854d0e]" : "border-[#14532d]";
	const iconColor = isGolden ? "fill-[#713f12]" : "fill-[#064e3b]";
	const textShadow = isGolden ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : "drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]";

	return (
		<div className="relative w-full h-full flex items-center justify-center animate-feature-pop group">
			<div className={`w-[85%] h-[85%] ${bgColor} rounded-xl flex items-center justify-center border-4 ${borderColor} shadow-md relative overflow-hidden`}>
				<div className="absolute inset-0 p-1.5 opacity-30 pointer-events-none">
					<svg viewBox="0 0 100 100" className={`w-full h-full ${iconColor}`}>
						<path d="M50,45 C30,10 5,30 50,45 C95,30 70,10 50,45 Z" />
						<path d="M50,45 C30,10 5,30 50,45 C95,30 70,10 50,45 Z" transform="rotate(90 50 45)" />
						<path d="M50,45 C30,10 5,30 50,45 C95,30 70,10 50,45 Z" transform="rotate(180 50 45)" />
						<path d="M50,45 C30,10 5,30 50,45 C95,30 70,10 50,45 Z" transform="rotate(270 50 45)" />
					</svg>
				</div>
				<span className={`font-black text-white ${isGolden ? "text-[1.1rem]" : "text-[0.95rem]"} z-10 ${textShadow}`}>
					{revealed ? `${value}` : "?"}
				</span>
			</div>
		</div>
	);
}

function FeatureCauldron({ value }: { value?: number }) {
	return (
		<div className="relative w-full h-full flex items-center justify-center animate-feature-pop">
			<div className="w-[85%] h-[85%] flex items-center justify-center relative">
				<svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
					<path d="M15,35 Q10,95 50,95 Q90,95 85,35 Z" fill="#1e293b" stroke="#020617" strokeWidth="4" />
					<rect x="10" y="30" width="80" height="10" rx="2" fill="#334155" stroke="#020617" strokeWidth="3" />
				</svg>
				<div 
					className="absolute inset-0 flex flex-col items-center justify-center font-black select-none pointer-events-none pt-4"
				>
					<span className="text-[0.7rem] leading-none font-mono text-yellow-400">
						{value !== undefined ? value : "0"}
					</span>
				</div>
			</div>
		</div>
	);
}

function featureVisual(feature: FeatureCell) {
	const isRevealed = feature.revealed;
	const isInteracting = feature.interacting;
	const isSucked = feature.sucked;

	const containerClass = `
		flex items-center justify-center w-full h-full 
		transition-all duration-300 transform-gpu
		${isInteracting ? "scale-110 z-20" : "z-10"} 
		${isRevealed ? "animate-spin-reveal" : ""} 
		${isSucked ? "animate-suck-in" : ""}
	`.trim();

	if (feature.kind === "cauldron") {
		return (
			<div className={containerClass}>
				<FeatureCauldron value={isRevealed ? (feature as any).currentValue : undefined} />
			</div>
		);
	}

	if (feature.kind === "clover") {
		return (
			<div className={containerClass}>
				<FeatureClover value={feature.value} revealed={feature.revealed} isGolden={feature.isGolden} />
			</div>
		);
	}

	return (
		<div className={containerClass}>
			<FeatureCoin tier={feature.tier} value={isRevealed ? feature.value : undefined} label={isRevealed ? undefined : "?"} />
		</div>
	);
}

function Industrial1900Background() {
	return (
		<div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
			<div className="absolute inset-0 bg-gradient-to-b from-[#1a1c2c] via-[#2f3243] to-[#111111]" />
			
			<svg viewBox="0 0 1000 400" className="absolute bottom-0 w-full h-[75%] opacity-40 mix-blend-multiply" preserveAspectRatio="none">
				<path d="M0,400 L0,320 L50,300 L80,330 L120,280 L180,310 L220,240 L280,300 L350,220 L400,280 L480,200 L550,270 L620,180 L700,260 L800,210 L880,290 L1000,240 L1000,400 Z" fill="#0c0d14" />
				<path d="M50,400 L50,250 L100,220 L150,250 L150,400 Z M250,400 L250,180 L350,150 L450,180 L450,400 Z M600,400 L600,200 L700,180 L800,220 L800,400 Z" fill="#08080c" opacity="0.7" />
			</svg>

			<svg viewBox="0 0 1000 600" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMax slice">
				<rect width="1000" height="600" fill="url(#industrialDust)" opacity="0.15" />
				<defs>
					<radialGradient id="industrialDust" cx="50%" cy="80%" r="70%">
						<stop offset="0%" stopColor="#bf953f" stopOpacity="0.4" />
						<stop offset="100%" stopColor="#000000" stopOpacity="0" />
					</radialGradient>
					
					<filter id="smokeBlur">
						<feGaussianBlur in="SourceGraphic" stdDeviation="5" />
					</filter>
				</defs>

				<g transform="translate(80, 200)">
					<g className="animate-smoke-1">
						<circle cx="20" cy="-20" r="25" fill="#4a4a4a" opacity="0.6" filter="url(#smokeBlur)" />
						<circle cx="45" cy="-45" r="30" fill="#333333" opacity="0.4" filter="url(#smokeBlur)" />
					</g>
					<rect x="0" y="0" width="40" height="400" fill="#3d2b1f" stroke="#1a110a" strokeWidth="2" />
					<rect x="-5" y="0" width="50" height="15" fill="#2d1f16" />
					
					<g transform="translate(5, 60)">
						<rect width="30" height="40" fill="#d1bfa7" stroke="#8b4513" strokeWidth="1" />
						<text x="15" y="10" fontSize="4" textAnchor="middle" fill="#000" fontWeight="bold">WANTED</text>
						<circle cx="15" cy="22" r="6" fill="#000" opacity="0.7" />
						<rect x="5" y="32" width="20" height="2" fill="#000" opacity="0.5" />
					</g>

					{Array.from({ length: 15 }).map((_, i) => (
						<rect key={i} x="5" y={40 + i * 25} width="30" height="2" fill="#1a110a" opacity="0.3" />
					))}
				</g>

				<g transform="translate(150, 250)">
					<g transform="translate(0, 30)">
						<rect width="140" height="320" fill="#3d2b1f" stroke="#1a110a" strokeWidth="2" />
						{Array.from({ length: 5 }).map((_, row) => (
							Array.from({ length: 3 }).map((_, col) => (
								<g key={`b1-${row}-${col}`} transform={`translate(${20 + col * 40}, ${30 + row * 55})`}>
									<path d="M0,30 L0,10 Q0,0 12,0 Q24,0 24,10 L24,30 Z" fill="#111" />
									{(row === 1 && col === 1) && <path d="M2,28 L2,10 Q2,2 12,2 Q22,2 22,10 L22,28 Z" fill="#ffd700" opacity="0.1" />}
								</g>
							))
						))}
						{Array.from({ length: 20 }).map((_, i) => (
							<rect key={i} x={Math.random() * 130} y={Math.random() * 310} width="8" height="3" fill="#2a1e16" opacity="0.4" />
						))}
					</g>

					<g transform="translate(130, 80)">
						<path d="M0,40 L120,40 L120,270 L0,270 Z" fill="#2d1f16" stroke="#1a110a" strokeWidth="2" />
						<path d="M0,40 L60,0 L120,40" fill="#1a110a" />
						<rect x="30" y="180" width="60" height="90" fill="#111" stroke="#222" strokeWidth="1" />
						<rect x="0" y="100" width="120" height="6" fill="#1a110a" />
						<rect x="0" y="140" width="120" height="6" fill="#1a110a" />
					</g>

					<g transform="translate(240, -20)">
						<rect width="70" height="390" fill="#35261b" stroke="#1a110a" strokeWidth="2" />
						<rect x="-5" y="0" width="80" height="15" fill="#1a110a" />
						<g transform="translate(35, 10)">
							<circle r="12" fill="#222" />
							<rect x="-2" y="-25" width="4" height="25" fill="#111" />
						</g>
						<circle cx="35" cy="60" r="18" fill="#111" stroke="#444" strokeWidth="2" />
						<path d="M35,60 L35,48 M35,60 L45,60" stroke="#ffd700" strokeWidth="1.5" />
					</g>
				</g>

				<g transform="translate(580, 220)">
					<g>
						<rect width="200" height="330" fill="#2a1e16" stroke="#1a110a" strokeWidth="2" />
						{Array.from({ length: 15 }).map((_, i) => (
							<rect key={`brick-${i}`} x={Math.random() * 190} y={Math.random() * 320} width="10" height="4" fill="#1a110a" opacity="0.3" />
						))}
						<rect x="20" y="40" width="160" height="30" fill="#111" />
						<rect x="20" y="40" width="160" height="2" fill="#222" />
						<rect x="40" y="0" width="10" height="330" fill="#111" opacity="0.5" />
						<rect x="150" y="0" width="10" height="330" fill="#111" opacity="0.5" />
					</g>
				</g>

				<g transform="translate(820, 150)">
					<g className="animate-smoke-2">
						<circle cx="30" cy="-30" r="35" fill="#555555" opacity="0.5" filter="url(#smokeBlur)" />
						<circle cx="10" cy="-60" r="25" fill="#444444" opacity="0.3" filter="url(#smokeBlur)" />
					</g>
					<rect x="0" y="50" width="120" height="400" fill="#4a3728" stroke="#1a110a" strokeWidth="3" />

                    <rect x="20" y="100" width="30" height="50" rx="4" fill="#1a1a1a" />
					<rect x="70" y="100" width="30" height="50" rx="4" fill="#1a1a1a" />
					<rect x="20" y="180" width="30" height="50" rx="4" fill="#1a1a1a" />
					<rect x="70" y="180" width="30" height="50" rx="4" fill="#1a1a1a" />
					<path d="M-20,55 L60,0 L140,55 Z" fill="#2d1e16" stroke="#1a110a" strokeWidth="2" />
				</g>

				<g transform="translate(300, 500)" opacity="0.8">
					<rect x="0" y="0" width="400" height="100" fill="#2a2a2a" />
					{[60, 160, 260, 360].map((x, i) => (
						<g key={i} transform={`translate(${x-30}, 20)`}>
							<path d="M0,60 L0,20 Q0,0 30,0 Q60,0 60,20 L60,60 Z" fill="#111" />
							<path d="M5,55 L5,20 Q5,5 30,5 Q55,5 55,20 L55,55 Z" fill="url(#furnaceGlow)" className="animate-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
						</g>
					))}
					<defs>
						<radialGradient id="furnaceGlow" cx="50%" cy="100%" r="100%">
							<stop offset="0%" stopColor="#ff4500" />
							<stop offset="60%" stopColor="#e25822" />
							<stop offset="100%" stopColor="#800000" stopOpacity="0" />
						</radialGradient>
					</defs>
				</g>

				<g stroke="#1a110a" strokeWidth="6" fill="none" opacity="0.9">
					<path d="M120,450 L200,450 L200,550" />
					<path d="M820,400 L750,400 L750,550" />
					<circle cx="200" cy="450" r="10" fill="#3d2b1f" strokeWidth="3" />
					<circle cx="750" cy="400" r="10" fill="#3d2b1f" strokeWidth="3" />
				</g>
				
				<g transform="translate(200, 450)">
					<circle r="5" fill="#fff" opacity="0.3" filter="url(#smokeBlur)">
						<animate attributeName="r" values="5;15" dur="2s" repeatCount="indefinite" />
						<animate attributeName="opacity" values="0.3;0" dur="2s" repeatCount="indefinite" />
						<animate attributeName="cy" values="0;-40" dur="2s" repeatCount="indefinite" />
					</circle>
				</g>
				<g transform="translate(750, 400)">
					<circle r="5" fill="#fff" opacity="0.2" filter="url(#smokeBlur)">
						<animate attributeName="r" values="5;20" dur="3s" repeatCount="indefinite" />
						<animate attributeName="opacity" values="0.2;0" dur="3s" repeatCount="indefinite" />
						<animate attributeName="cy" values="0;-60" dur="3s" repeatCount="indefinite" />
					</circle>
				</g>

				<g>
					{Array.from({ length: 15 }).map((_, i) => (
						<circle key={i} r="1.5" fill="#ffd700">
							<animate 
								attributeName="cx" 
								values={`${350 + Math.random() * 300};${200 + Math.random() * 600}`} 
								dur={`${2 + Math.random() * 3}s`} 
								repeatCount="indefinite" 
								begin={`${Math.random() * 2}s`}
							/>
							<animate 
								attributeName="cy" 
								values="550;100" 
								dur={`${2 + Math.random() * 3}s`} 
								repeatCount="indefinite" 
								begin={`${Math.random() * 2}s`}
							/>
							<animate 
								attributeName="opacity" 
								values="0;0.8;0" 
								dur={`${2 + Math.random() * 3}s`} 
								repeatCount="indefinite" 
								begin={`${Math.random() * 2}s`}
							/>
						</circle>
					))}
				</g>

				<g transform="translate(0, 900)">
					<g transform="translate(200, -85)">
						<path d="M0,50 L10,50 L20,30 L100,30 L110,50 L160,50 L160,75 L0,75 Z" fill="#08080c" />
						<path d="M40,30 L45,5 L110,5 L115,30 Z" fill="#0a0a0f" stroke="#1a110a" strokeWidth="1.5" />
						<rect x="55" y="10" width="20" height="15" fill="#111" /> 
						<rect x="80" y="10" width="25" height="15" fill="#111" /> 
						<path d="M-5,70 Q-5,45 25,45 L40,45" fill="none" stroke="#000" strokeWidth="6" />
						<path d="M95,45 L110,45 Q165,45 165,70" fill="none" stroke="#000" strokeWidth="6" />
						<g transform="translate(20, 70)">
							<circle r="18" fill="#111" stroke="#000" strokeWidth="2" />
							<circle r="4" fill="#222" />
							{Array.from({ length: 8 }).map((_, i) => (
								<line key={i} x1="0" y1="0" x2={16 * Math.cos(i * Math.PI / 4)} y2={16 * Math.sin(i * Math.PI / 4)} stroke="#222" strokeWidth="1" />
							))}
						</g>
						<g transform="translate(130, 70)">
							<circle r="18" fill="#111" stroke="#000" strokeWidth="2" />
							<circle r="4" fill="#222" />
							{Array.from({ length: 8 }).map((_, i) => (
								<line key={i} x1="0" y1="0" x2={16 * Math.cos(i * Math.PI / 4)} y2={16 * Math.sin(i * Math.PI / 4)} stroke="#222" strokeWidth="1" />
							))}
						</g>
						<circle cx="5" cy="45" r="5" fill="#ffd700" opacity="0.6" className="animate-pulse" />
						<rect x="0" y="42" width="6" height="6" fill="#111" />
						<circle cx="75" cy="40" r="14" fill="#111" stroke="#000" strokeWidth="2" />
						<circle r="3" cx="75" cy="40" fill="#222" />
					</g>

					<g transform="translate(420, -10)">
						<rect width="40" height="10" fill="#2d1f16" />
						<rect y="12" width="40" height="10" fill="#2d1f16" />
						<rect x="50" y="5" width="20" height="20" fill="#1a110a" opacity="0.5" />
					</g>

					<g transform="translate(780, -20)">
						<path d="M0,20 Q-10,0 0,-15 Q10,0 0,20" fill="#2d1f16" stroke="#1a110a" />
						<path d="M15,20 Q5,0 15,-15 Q25,0 15,20" fill="#3d2b1f" stroke="#1a110a" />
						<text x="7" y="5" fontSize="8" fill="#000" opacity="0.6">$</text>
					</g>

					<g transform="translate(850, 0)">
						<rect x="0" y="-40" width="40" height="40" fill="#3d2b1f" stroke="#1a110a" />
						<path d="M0-40 L40 0 M40-40 L0 0" stroke="#1a110a" strokeWidth="1" opacity="0.3" />
						<text x="20" y="-15" fontSize="10" textAnchor="middle" fill="#000" fontWeight="bold" opacity="0.5">B</text>
						<rect x="45" y="-35" width="35" height="35" fill="#4a3728" stroke="#1a110a" />
						<path d="M45-35 L80 0 M80-35 L45 0" stroke="#1a110a" strokeWidth="1" opacity="0.3" />
						<ellipse cx="110" cy="-25" rx="15" ry="25" fill="#2d1f16" stroke="#1a110a" />
						<rect x="95" y="-35" width="30" height="3" fill="#1a110a" opacity="0.4" />
						<rect x="95" y="-15" width="30" height="3" fill="#1a110a" opacity="0.4" />
					</g>
				</g>

				<g className="animate-searchlight">
					<path d="M500,1000 L400,-100 L600,-100 Z" fill="url(#searchlightGradient)" opacity="0.15" />
				</g>

				<defs>
					<radialGradient id="searchlightGradient" cx="50%" cy="100%" r="100%">
						<stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
						<stop offset="50%" stopColor="#ffffcc" stopOpacity="0.3" />
						<stop offset="100%" stopColor="#ffffcc" stopOpacity="0" />
					</radialGradient>
				</defs>
			</svg>
			
			<div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-screen overflow-hidden">
				<div className="absolute top-0 left-0 w-full h-full animate-vignette-pulse" style={{ background: 'radial-gradient(circle, transparent 40%, black 100%)' }} />
			</div>
			
			<div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent z-10" />
			<div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent z-10" />
		</div>
	);
}

export default function LeBanditPage() {
	const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
	const { volume } = useSoundVolume();

	const [phase, setPhase] = useState<GamePhase>("idle");
	const [betInput, setBetInput] = useState("100");
	const [betAmount, setBetAmount] = useState(100);
	const [anteBet, setAnteBet] = useState(false);
	const [grid, setGrid] = useState<GridCell[][]>(() => buildGrid(false));
	const [reelFrames, setReelFrames] = useState<string[][]>(() => gridToReelFrames(buildGrid(false)));
	const [reelsSpinning, setReelsSpinning] = useState<boolean[]>(() => Array(COLS).fill(false));
	const [spinKey, setSpinKey] = useState(0);
	const [goldMask, setGoldMask] = useState<boolean[][]>(() => emptyGoldMask());
	const [featureCells, setFeatureCells] = useState<Map<string, FeatureCell>>(new Map());
	const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
	const [lastDropIndices, setLastDropIndices] = useState<Set<string>>(new Set());
	const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
	const [isAutospinning, setIsAutospinning] = useState(false);
	const [isExecutingSpin, setIsExecutingSpin] = useState(false);
	const [isTumbling, setIsTumbling] = useState(false);
	const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
	const [lastWin, setLastWin] = useState(0);
	const [lastFeatureWin, setLastFeatureWin] = useState(0);
	const [isFeatureActive, setIsFeatureActive] = useState(false);

	const gameId = "lebandit";

	const pendingRoundStakeRef = React.useRef(0);
	const pendingMultiDenominatorRef = React.useRef(0);
	const pendingRoundPayoutRef = React.useRef(0);
	const isExecutingSpinRef = React.useRef(false);

	const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
	const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);

	const audioRef = React.useRef<{
		bet: HTMLAudioElement | null;
		spin: HTMLAudioElement | null;
		win: HTMLAudioElement | null;
		lose: HTMLAudioElement | null;
	}>({ bet: null, spin: null, win: null, lose: null });

	const playAudio = (a: HTMLAudioElement | null) => {
		if (!a) return;
		const v =
			typeof window !== "undefined" && typeof (window as any).__flopper_sound_volume__ === "number"
				? (window as any).__flopper_sound_volume__
				: 1;
		if (!v) return;
		try {
			a.volume = v;
			a.currentTime = 0;
			void a.play();
		} catch {}
	};

	React.useEffect(() => {
		if (volume <= 0) return;
		if (!audioRef.current.bet) {
			audioRef.current = {
				bet: new Audio("/sounds/Bet.mp3"),
				spin: new Audio("/sounds/Tick.mp3"),
				win: new Audio("/sounds/Win.mp3"),
				lose: new Audio("/sounds/LimboLose.mp3"),
			};
		}

		const prime = async () => {
			const arr = Object.values(audioRef.current);
			for (const a of arr) {
				if (!a) continue;
				try {
					a.muted = true;
					await a.play();
					a.pause();
					a.currentTime = 0;
					a.muted = false;
				} catch {
					a.muted = false;
				}
			}
		};

		document.addEventListener("pointerdown", prime, { once: true });
		return () => document.removeEventListener("pointerdown", prime);
	}, [volume]);

	const settleRound = React.useCallback(
		(stake: number, payout: number, multiDenominator: number) => {
			const p = normalizeMoney(payout);
			const s = normalizeMoney(stake);
			const isWinRound = p >= s;

			if (p > 0) {
				addToBalance(p, multiDenominator);
				setLastWin(p);
				playAudio(audioRef.current.win);
			} else {
				setLastWin(0);
				if (s > 0) {
					finalizePendingLoss();
					playAudio(audioRef.current.lose);
				}
			}

			if (s > 0 && !isWinRound && p > 0) {
				finalizePendingLoss();
			}

			pendingRoundStakeRef.current = 0;
			pendingRoundPayoutRef.current = 0;
			setPendingRoundPayout(0);
		},
		[addToBalance, finalizePendingLoss]
	);

	const executeSpin = React.useCallback(async (isBonusBuy: boolean = false) => {
		if (isExecutingSpinRef.current) return;
		isExecutingSpinRef.current = true;
		setIsExecutingSpin(true);
		setIsTumbling(false);
		setLastFeatureWin(0);
		setLastDropIndices(new Set());
		setIsFeatureActive(false);

		const isFreeSpin = phase === "free";
		const freeBefore = freeSpinsLeft;
		if (isFreeSpin) {
			setFreeSpinsLeft((v) => Math.max(0, v - 1));
			setPhase("free");
		} else {
			setPhase("spinning");
		}

		let workingGold = goldMask.map((row) => [...row]);
		
		if (!isFreeSpin) {
			workingGold = emptyGoldMask();
			setGoldMask(workingGold);
			setFeatureCells(new Map());
		} else {
			setFeatureCells(new Map());
		}

		playAudio(audioRef.current.spin);
		setSpinKey((v) => v + 1);

		let workingGrid = buildGrid(isFreeSpin, isBonusBuy);
		const startFrames = gridToReelFrames(grid).map((col) => [randomReelSymbol(), ...col]);
		setReelFrames(startFrames);
		setReelsSpinning(Array(COLS).fill(true));

		await new Promise<void>((resolve) => {
			setReelFrames(Array.from({ length: COLS }, () => Array.from({ length: ROWS * 2 }, () => randomReelSymbol())));
			setReelsSpinning(Array(COLS).fill(true));

			let stoppedCount = 0;
			const baseDelay = 400;
			const reelDelay = 200;

			for (let col = 0; col < COLS; col++) {
				setTimeout(() => {
					setGrid((prev) => {
						const next = prev.map((r) => [...r]);
						for (let row = 0; row < ROWS; row++) {
							next[row][col] = workingGrid[row][col];
						}
						return next;
					});

					setReelsSpinning((prev) => {
						const next = [...prev];
						next[col] = false;
						return next;
					});

					stoppedCount += 1;
					if (stoppedCount === COLS) {
						setTimeout(resolve, 180);
					}
				}, baseDelay + col * reelDelay);
			}
		});

		setGrid(workingGrid.map((row) => [...row]));
		setHighlighted(new Set());

		let spinWin = 0;
		while (true) {
			const clusters = findClusters(workingGrid);
			if (clusters.length === 0) break;

			setIsTumbling(true);
			const remove = new Set<string>();
			let cascadeWin = 0;

			for (const cluster of clusters) {
				const clusterMulti = getClusterPayoutMulti(cluster.symbol, cluster.positions.length);
				cascadeWin = normalizeMoney(cascadeWin + spinCost * clusterMulti);

				for (const [row, col] of cluster.positions) {
					const key = toPosKey(row, col);
					remove.add(key);
					workingGold[row][col] = true;
				}
			}

			spinWin = normalizeMoney(spinWin + cascadeWin);

			setHighlighted(new Set(remove));
			setGoldMask(workingGold.map((row) => [...row]));

			await sleep(350);

			const tumbleResult = tumble(workingGrid, remove, isFreeSpin);
			workingGrid = tumbleResult.nextGrid;

			setLastDropIndices(tumbleResult.droppedIndices);
			setGrid(workingGrid.map((row) => [...row]));
			setHighlighted(new Set());

			await sleep(650);
			setLastDropIndices(new Set());
		}

		const rainbowCount = countType(workingGrid, "rainbow");
		let featureWin = 0;

		if (rainbowCount > 0 && hasAnyGold(workingGold)) {
			setIsFeatureActive(true);
			await sleep(180);
			
			let totalFeatureWin = 0;
			let currentFeatures = new Map<string, FeatureCell>();
			const currentGold = workingGold.map(row => [...row]);
			
			for (let step = 0; step < 20; step++) {
				let progress = false;

				for (let col = 0; col < COLS; col++) {
					let addedInCol = false;
					for (let row = 0; row < ROWS; row++) {
						if (currentGold[row][col]) {
							const k = toPosKey(row, col);
							if (!currentFeatures.has(k)) {
								currentFeatures.set(k, { ...randomFeatureCell(), revealed: false });
								addedInCol = true;
								progress = true;
							}
						}
					}
					if (addedInCol) {
						setFeatureCells(new Map(currentFeatures));
						await sleep(150);
					}
				}
				
				await sleep(200);
				
				const unrevealedCoins = Array.from(currentFeatures.entries())
					.filter(([, f]) => f.kind === "coin" && !f.revealed && !f.sucked)
					.sort((a, b) => {
						const [rA, cA] = a[0].split("-").map(Number);
						const [rB, cB] = b[0].split("-").map(Number);
						return cA - cB || rA - rB;
					});

				for (const [key, feature] of unrevealedCoins) {
					currentFeatures.set(key, { ...feature, revealed: true });
					setFeatureCells(new Map(currentFeatures));
					progress = true;
					await sleep(150);
				}
				
				if (unrevealedCoins.length > 0) {
					await sleep(300);
				}
				
				const untriggeredClovers = Array.from(currentFeatures.entries())
					.filter(([, f]) => f.kind === "clover" && !f.revealed && !f.sucked);

				for (const [key, clover] of untriggeredClovers) {
					if (clover.kind !== "clover" || clover.sucked) continue;
					progress = true;
					currentFeatures.set(key, { ...clover, revealed: true, interacting: true });
					setFeatureCells(new Map(currentFeatures));
					await sleep(400);
					
					const [rowStr, colStr] = key.split("-");
					const row = Number(rowStr);
					const col = Number(colStr);
					
					let interacted = false;

					const targets = clover.isGolden
						? Array.from(currentFeatures.keys()).map(k => k.split("-").map(Number) as [number, number])
						: adjacent8(row, col);

					for (const [nr, nc] of targets) {
						const nKey = toPosKey(nr, nc);
						if (nKey === key) continue;

						const nCell = currentFeatures.get(nKey);
						if (nCell && !nCell.sucked) {
							if (nCell.kind === "coin") {
								nCell.value = normalizeMoney(nCell.value * clover.value);
								nCell.tier = getTierForValue(nCell.value);
								nCell.interacting = true;
								currentFeatures.set(nKey, { ...nCell });
								interacted = true;
							} else if (nCell.kind === "cauldron" && (nCell.currentValue || 0) > 0) {
								nCell.currentValue = normalizeMoney((nCell.currentValue || 0) * clover.value);
								nCell.interacting = true;
								currentFeatures.set(nKey, { ...nCell });
								interacted = true;
							}
						}
					}
					
					if (interacted) {
						setFeatureCells(new Map(currentFeatures));
						await sleep(500);
						for (const [nr, nc] of targets) {
							const nKey = toPosKey(nr, nc);
							const nCell = currentFeatures.get(nKey);
							if (nCell && (nCell.kind === "coin" || nCell.kind === "cauldron")) {
								nCell.interacting = false;
								currentFeatures.set(nKey, { ...nCell });
							}
						}
					}
					
					const finalClover = currentFeatures.get(key);
					if (finalClover) {
						finalClover.interacting = false;
						currentFeatures.set(key, { ...finalClover });
					}
					setFeatureCells(new Map(currentFeatures));
					await sleep(200);
				}
				
				const untriggeredCauldron = Array.from(currentFeatures.entries())
					.filter(([, f]) => f.kind === "cauldron" && !f.alreadySucked && !f.sucked)
					.sort((a, b) => {
						const [rA, cA] = a[0].split("-").map(Number);
						const [rB, cB] = b[0].split("-").map(Number);
						return cA - cB || rA - rB;
					})[0];

				if (untriggeredCauldron) {
					progress = true;
					const [key, cauldron] = untriggeredCauldron;
					if (cauldron.kind !== "cauldron") continue;
					
					currentFeatures.set(key, { ...cauldron, revealed: true, interacting: true, currentValue: cauldron.currentValue || 0 });
					setFeatureCells(new Map(currentFeatures));
					await sleep(400);

					let accumulated = cauldron.currentValue || 0;
					for (let colX = 0; colX < COLS; colX++) {
						let suckedInCol = false;
						for (let rowX = 0; rowX < ROWS; rowX++) {
							const k = toPosKey(rowX, colX);
							if (k === key) continue;
							
							const f = currentFeatures.get(k);
							const isAbsorbableCauldron =
								f?.kind === "cauldron" && (f.currentValue ?? 0) > 0;
							if (f && (f.kind === "coin" || isAbsorbableCauldron) && !f.sucked) {
								const val = f.kind === "coin" ? f.value : (f.currentValue || 0);
								accumulated = normalizeMoney(accumulated + val);
								f.sucked = true;
								currentFeatures.set(k, { ...f });
								suckedInCol = true;
							}
						}
						if (suckedInCol) {
							const currentC = currentFeatures.get(key);
							if (currentC && currentC.kind === "cauldron") {
								currentC.currentValue = accumulated;
								currentFeatures.set(key, { ...currentC });
							}
							setFeatureCells(new Map(currentFeatures));
							await sleep(150);
						}
					}

					const finalState = currentFeatures.get(key);
					if (finalState && finalState.kind === "cauldron") {
						finalState.interacting = false;
						finalState.alreadySucked = true;
						currentFeatures.set(key, { ...finalState });
					}
					setFeatureCells(new Map(currentFeatures));
					await sleep(300);

					const refillGrid = workingGrid.map(r => [...r]);
					for (let r = 0; r < ROWS; r++) {
						for (let c = 0; c < COLS; c++) {
							if (!workingGold[r][c]) continue;
							
							const pk = toPosKey(r, c);
							const f = currentFeatures.get(pk);
							
							if (f && f.kind === "cauldron" && !f.sucked) {
								continue;
							}

							refillGrid[r][c] = randomBaseCell(isFreeSpin, true);
							currentFeatures.delete(pk);
						}
					}
					workingGrid = refillGrid;
					setGrid(workingGrid.map(row => [...row]));
					setFeatureCells(new Map(currentFeatures));
					await sleep(600);
					continue;
				}

				if (!progress) break;
			}
			
			let finalCoinSum = 0;
			for (const f of currentFeatures.values()) {
				if (!f.sucked) {
					if (f.kind === "coin") finalCoinSum += f.value;
					if (f.kind === "cauldron") finalCoinSum += (f.currentValue || 0);
				}
			}
			totalFeatureWin = normalizeMoney(finalCoinSum * (betAmount / (isFreeSpin ? 10 : 100)));
			
			featureWin = totalFeatureWin;
			setLastFeatureWin(featureWin);
			setFeatureCells(new Map(currentFeatures));
		}

		const updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + spinWin + featureWin);
		pendingRoundPayoutRef.current = updatedRoundPayout;
		setPendingRoundPayout(updatedRoundPayout);

		const scatterCount = countType(workingGrid, "scatter");

		if (isFreeSpin) {
			const retrigger = scatterCount >= 3 ? 5 + Math.max(0, scatterCount - 3) : 0;
			const leftAfter = Math.max(0, freeBefore - 1 + retrigger);
			setFreeSpinsLeft(leftAfter);

			if (leftAfter <= 0) {
				setPhase("idle");
				setIsAutospinning(false);
				settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
			} else {
				setPhase("free");
			}
		} else {
			if (scatterCount >= 3) {
				const freeAward = 15 + Math.max(0, scatterCount - 3) * 2;
				setPhase("free");
				setFreeSpinsLeft(freeAward);
				setIsAutospinning(false);
			} else {
				setPhase("idle");
				settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
			}
		}

		isExecutingSpinRef.current = false;
		setIsExecutingSpin(false);
		setIsTumbling(false);
	}, [phase, freeSpinsLeft, goldMask, grid, spinCost, settleRound]);

	React.useEffect(() => {
		if (!isAutospinning || isExecutingSpin) return;

		if (phase === "idle") {
			if (balance < spinCost && betAmount !== 100) {
				setIsAutospinning(false);
				return;
			}
			const timer = window.setTimeout(() => {
				if (isAutospinning && phase === "idle" && !isExecutingSpinRef.current) {
					handleMainSpin();
				}
			}, 360);
			return () => window.clearTimeout(timer);
		}

		if (phase === "free") {
			if (freeSpinsLeft <= 0) {
				setIsAutospinning(false);
				return;
			}
			const timer = window.setTimeout(() => {
				if (isAutospinning && phase === "free" && !isExecutingSpinRef.current) {
					handleMainSpin();
				}
			}, 360);
			return () => window.clearTimeout(timer);
		}
	}, [isAutospinning, isExecutingSpin, phase, balance, spinCost, freeSpinsLeft]);

	const canPaidSpin = phase === "idle";

	const startPaidSpin = () => {
		if (!canPaidSpin) return;
		if (isExecutingSpinRef.current) return;
		if (betAmount < 100) return;
		if (balance < spinCost && betAmount !== 100) return;

		const actualCost = betAmount === 100 ? 0 : spinCost;

		if (actualCost > 0) {
			subtractFromBalance(actualCost);
		}
		
		pendingRoundStakeRef.current = actualCost;
		pendingMultiDenominatorRef.current = betAmount;
		pendingRoundPayoutRef.current = 0;
		setPendingRoundPayout(0);
		setLastWin(0);
		playAudio(audioRef.current.bet);

		setGoldMask(emptyGoldMask());
		setFeatureCells(new Map());
		void executeSpin();
	};

	const buyBonus = () => {
		if (phase !== "idle" || betAmount < 100 || balance < buyBonusCost) return;
		if (isExecutingSpinRef.current) return;

		setLastWin(0);
		subtractFromBalance(buyBonusCost);
		playAudio(audioRef.current.bet);

		pendingRoundStakeRef.current = buyBonusCost;
		pendingMultiDenominatorRef.current = buyBonusCost;
		pendingRoundPayoutRef.current = 0;
		setPendingRoundPayout(0);
		setGoldMask(emptyGoldMask());
		setFeatureCells(new Map());
		setHighlighted(new Set());
		void executeSpin(true);
	};

	const spinFree = () => {
		if (phase !== "free" || freeSpinsLeft <= 0) return;
		if (isExecutingSpinRef.current) return;
		void executeSpin();
	};

	const handleMainSpin = () => {
		if (isExecutingSpinRef.current) return;
		if (phase === "free") {
			spinFree();
			return;
		}
		startPaidSpin();
	};

	const mainDisabled =
		isExecutingSpin ||
		(phase === "free" ? freeSpinsLeft <= 0 : phase !== "idle" || (balance < spinCost && betAmount !== 100) || betAmount < 100);

	return (
		<>
			<div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
				<div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
					<div className="space-y-2">
						<label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
                        <div className="text-[9px] text-[#93c8a8] font-semibold">Free spin with a $100 bet (no Ante)</div>
						<div className="relative">
							<div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3] font-mono">$</div>
							<input
								type="number"
								value={betInput}
								onChange={(e) => setBetInput(e.target.value)}
								onBlur={() => {
									const val = Number(betInput.replace(",", "."));
									const safe = Number.isFinite(val) ? Math.max(100, val) : 100;
									const normalized = normalizeMoney(safe);
									setBetAmount(normalized);
									setBetInput(String(normalized));
								}}
								disabled={phase !== "idle" || isAutospinning}
								className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
							/>
						</div>

						<div className="grid grid-cols-3 gap-2">
							<button
								onClick={() => {
									const n = normalizeMoney(Math.max(100, betAmount / 2));
									setBetAmount(n);
									setBetInput(String(n));
								}}
								disabled={phase !== "idle" || isAutospinning}
								className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
							>
								½
							</button>
							<button
								onClick={() => {
									const n = normalizeMoney(betAmount * 2);
									setBetAmount(n);
									setBetInput(String(n));
								}}
								disabled={phase !== "idle" || isAutospinning}
								className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
							>
								2×
							</button>
							<button
								onClick={() => {
									const n = normalizeMoney(Math.max(100, balance));
									setBetAmount(n);
									setBetInput(String(n));
								}}
								disabled={phase !== "idle" || isAutospinning}
								className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
							>
								All In
							</button>
						</div>
					</div>

					<div className="p-3 bg-[#132330] rounded-lg border border-[#2f4553] space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-[10px] text-[#b1bad3] font-bold uppercase">Ante Bet - Spin Cost +50%</span>
							<button
								onClick={() => setAnteBet(!anteBet)}
								disabled={phase !== "idle" || isAutospinning}
								className={`w-10 h-5 rounded-full relative transition-colors ${anteBet ? "bg-[#00e701]" : "bg-[#2f4553]"}`}
							>
								<div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${anteBet ? "left-5.5" : "left-0.5"}`} />
							</button>
						</div>
						{!anteBet && (
							<button
								onClick={buyBonus}
								disabled={phase !== "idle" || isAutospinning || betAmount <= 0 || balance < buyBonusCost}
								className="w-full py-1 text-[9px] font-bold uppercase bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded hover:bg-[#f59e0b]/20"
							>
								{`Bonus Buy $${formatMoney(buyBonusCost)}`}
							</button>
						)}
					</div>

					{!isAutospinning && (
						<button
							onClick={() => setIsAutospinning(true)}
							disabled={(phase !== "idle" && phase !== "free") || (phase === "idle" && balance < spinCost && betAmount !== 100)}
							className="w-full py-2 rounded-md font-bold text-xs transition-all flex items-center justify-center gap-2 bg-[#2f4553] hover:bg-[#3e5666] text-[#b1bad3] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{phase === "free" ? "Auto (Free Spins)" : "Auto (Normal Spins)"}
						</button>
					)}

					<button
						onClick={isAutospinning ? () => setIsAutospinning(false) : handleMainSpin}
						disabled={!isAutospinning && mainDisabled}
						className={`w-full ${
							isAutospinning
								? "bg-[#ff4d4d] hover:bg-[#ff3333] text-white shadow-[0_0_20px_rgba(255,77,77,0.2)]"
								: "bg-[#00e701] hover:bg-[#00c201] text-black shadow-[0_0_20px_rgba(0,231,1,0.2)]"
						} disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2`}
					>
						{isAutospinning ? (
							"Stop"
						) : isExecutingSpin ? (
							"Playing"
						) : (
							<>
								<PlayArrow /> Bet
							</>
						)}
					</button>

					{phase === "free" && (
						<div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
							<div className="text-[#b1bad3] text-sm">Current Win</div>
							<div className="text-2xl font-bold text-[#00e701]">${pendingRoundPayout.toFixed(2)}</div>
						</div>
					)}

					{lastWin > 0 && phase === "idle" && (
						<div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
							<div className="text-xs text-[#b1bad3] uppercase">You Won</div>
							<div className="text-xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
						</div>
					)}
				</div>

				<div className="flex-1 flex flex-col gap-6">
					<div className="bg-[#0f212e] p-4 sm:p-8 rounded-3xl self-center w-full">
						<div className="rounded-3xl overflow-hidden relative bg-[#111] h-130 sm:h-155 p-2 sm:p-4">
							<Industrial1900Background />

							<div className="relative z-10 flex flex-col items-center justify-center h-full">
								{phase === "free" && (
									<div className="absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
										<div className="bg-[#0f212e]/90 backdrop-blur-md border border-[#fde047]/20 px-5 py-2 rounded-full flex items-center gap-5 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
											<div className="flex items-center gap-2.5">
												<span className="text-[10px] text-[#b1bad3] font-black uppercase tracking-widest">Spins</span>
												<span className="text-xl font-black text-[#facc15] leading-none">{freeSpinsLeft}</span>
											</div>
										</div>
									</div>
								)}

								<div className="p-1.5 sm:p-2 rounded-2xl w-full max-w-130">
									<div className="grid grid-cols-6 gap-1 sm:gap-1.5 mx-auto w-full">
										{Array.from({ length: COLS }, (_, col) => (
											<div key={`col-${col}`} className="flex flex-col gap-1 sm:gap-1.5 relative overflow-hidden">
												{Array.from({ length: ROWS }, (_, rowIdx) => {
													const cell = grid[rowIdx][col];
													const key = toPosKey(rowIdx, col);
													const isHit = highlighted.has(key);
													const isDropping = lastDropIndices.has(key);
													const isSpinning = reelsSpinning[col];
													const isGold = goldMask[rowIdx]?.[col] ?? false;
													const feature = featureCells.get(key);

													return (
														<div
															key={key}
															className={`aspect-square w-full rounded-lg transition-all duration-200 flex items-center justify-center relative z-0
																${isGold && "bg-[#fbbf24]"}
															`}
														>
															{isGold && !isSpinning && (
																<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
																	<div className="absolute inset-x-0 h-[1px] -top-full transform -rotate-45" />
																	<div className="absolute inset-0" />
																</div>
															)}
															{!isSpinning && (
																<div
																	className={`relative z-10 w-full h-full flex items-center justify-center select-none leading-none transform-gpu filter
																		${isHit ? "animate-pop" : isDropping ? "animate-drop-in" : !isTumbling && isExecutingSpin ? "animate-stop-bounce" : ""}
																	`}
																>
																	{isGold && (isFeatureActive || feature) ? (
																		feature ? featureVisual(feature) : null
																	) : (
																		<span className="text-xl sm:text-3xl lg:text-4xl">
																			{displaySymbol(cell)}
																		</span>
																	)}
																</div>
															)}
														</div>
													);
												})}

												{reelsSpinning[col] && (
													<div className="flex flex-col gap-1 sm:gap-1.5 absolute top-0 left-0 w-full animate-spin-infinite-down pointer-events-none z-20">
														{reelFrames[col].map((symbol, idx) => (
															<div
																key={`spin-${col}-${idx}-${spinKey}`}
																className="aspect-square w-full flex items-center justify-center rounded-lg"
															>
																<span className="text-xl sm:text-3xl lg:text-4xl select-none leading-none filter blur-[1px]">{symbol}</span>
															</div>
														))}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
					</div>

					<GameRecordsPanel gameId={gameId} />
				</div>
			</div>

			<style jsx global>{`
				@keyframes dropIn {
					0% { transform: translateY(-120%); opacity: 0; }
					60% { transform: translateY(10%); opacity: 1; }
					80% { transform: translateY(-5%); }
					100% { transform: translateY(0); opacity: 1; }
				}
				.animate-drop-in {
					animation: dropIn 0.62s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
				}
				@keyframes pop {
					0% { transform: scale(1); }
					50% { transform: scale(1.35); }
					100% { transform: scale(1); }
				}
				.animate-pop {
					animation: pop 0.2s ease-in-out;
				}
				@keyframes stop-bounce {
					0% { transform: translateY(-18px); }
					60% { transform: translateY(4px); }
					100% { transform: translateY(0); }
				}
				.animate-stop-bounce {
					animation: stop-bounce 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
				}
				@keyframes spinInfiniteDown {
					0% { transform: translateY(-8%); }
					100% { transform: translateY(8%); }
				}
				.animate-spin-infinite-down {
					animation: spinInfiniteDown 90ms linear infinite;
				}
				@keyframes spinReveal {
					0% { transform: rotateY(0deg); }
					50% { transform: rotateY(90deg); }
					100% { transform: rotateY(0deg); }
				}
				.animate-spin-reveal {
					animation: spinReveal 0.4s ease-in-out;
				}
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				.animate-fade-in {
					animation: fadeIn 0.3s ease-in forwards;
				}
				@keyframes suckIn {
					0% { transform: scale(1); opacity: 1; }
					100% { transform: scale(0); opacity: 0; }
				}
				.animate-suck-in {
					animation: suckIn 0.3s ease-in forwards;
				}
				@keyframes featurePop {
					0% { transform: scale(0) rotate(-10deg); opacity: 0; }
					70% { transform: scale(1.1) rotate(5deg); opacity: 1; }
					100% { transform: scale(1) rotate(0deg); opacity: 1; }
				}
				.animate-feature-pop {
					animation: featurePop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
				}
				@keyframes goldShimmer {
					0% { top: -100%; left: -100%; }
					100% { top: 200%; left: 200%; }
				}
				.animate-gold-shimmer {
					animation: goldShimmer 3s infinite;
				}
				@keyframes smoke-1 {
					0% { transform: translate(0, 0) scale(1); opacity: 0; }
					20% { opacity: 0.6; }
					100% { transform: translate(-20px, -120px) scale(2.5); opacity: 0; }
				}
				.animate-smoke-1 {
					animation: smoke-1 6s infinite linear;
				}
				@keyframes smoke-2 {
					0% { transform: translate(0, 0) scale(1.2); opacity: 0; }
					20% { opacity: 0.5; }
					100% { transform: translate(30px, -150px) scale(3); opacity: 0; }
				}
				.animate-smoke-2 {
					animation: smoke-2 8s infinite linear;
				}
				@keyframes spin-slow {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
				.animate-spin-slow {
					animation: spin-slow 12s infinite linear;
				}
				@keyframes vignette-pulse {
					0%, 100% { opacity: 0.15; }
					50% { opacity: 0.25; }
				}
				.animate-vignette-pulse {
					animation: vignette-pulse 5s infinite ease-in-out;
				}
				@keyframes searchlight {
					0% { transform: translate(-350px, -50px) rotate(-35deg); }
					50% { transform: translate(350px, -50px) rotate(35deg); }
					100% { transform: translate(-350px, -50px) rotate(-35deg); }
				}
				.animate-searchlight {
					animation: searchlight 12s infinite ease-in-out;
					transform-origin: center bottom;
				}
			`}</style>
		</>
	);
}
