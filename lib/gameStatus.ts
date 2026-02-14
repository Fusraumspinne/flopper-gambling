export const GAME_STATUS_KEYS = [
  "bigbassamazonas",
  "blackjack",
  "poker",
  "mines",
  "keno",
  "dragontower",
  "russianroulette",
  "pump",
  "limbo",
  "dice",
  "roulette",
  "tarot",
  "chicken",
  "horserace",
  "cases",
  "diamonds",
  "crash",
  "plinko",
  "bars",
  "spinningwheel",
  "darts",
  "vault",
  "snakes",
  "coinflip",
  "rps",
  "hilo",
];

export const GAME_LABELS: Record<string, string> = {
  bigbassamazonas: "Big Bass Amazonas",
  blackjack: "Blackjack",
  poker: "Poker",
  mines: "Mines",
  keno: "Keno",
  dragontower: "Dragon Tower",
  russianroulette: "Russian Roulette",
  pump: "Pump",
  limbo: "Limbo",
  dice: "Dice",
  roulette: "Roulette",
  tarot: "Tarot",
  chicken: "Chicken",
  horserace: "Horse Race",
  cases: "Cases",
  diamonds: "Diamonds",
  crash: "Crash",
  plinko: "Plinko",
  bars: "Bars",
  spinningwheel: "Spinning Wheel",
  darts: "Darts",
  vault: "Vault",
  snakes: "Snakes",
  coinflip: "Coin Flip",
  rps: "Rock Paper Scissors",
  hilo: "HiLo",
};

export const GAME_ROUTE_TO_KEY: Record<string, string> = {
  "/bigbassamazonas": "bigbassamazonas",
  "/blackjack": "blackjack",
  "/poker": "poker",
  "/livepoker": "poker",
  "/mines": "mines",
  "/keno": "keno",
  "/dragontower": "dragontower",
  "/russianroulette": "russianroulette",
  "/pump": "pump",
  "/limbo": "limbo",
  "/dice": "dice",
  "/roulette": "roulette",
  "/tarot": "tarot",
  "/chicken": "chicken",
  "/horserace": "horserace",
  "/cases": "cases",
  "/diamonds": "diamonds",
  "/crash": "crash",
  "/plinko": "plinko",
  "/bars": "bars",
  "/spinningwheel": "spinningwheel",
  "/darts": "darts",
  "/vault": "vault",
  "/snakes": "snakes",
  "/coinflip": "coinflip",
  "/rps": "rps",
  "/hilo": "hilo",
};

export const DEFAULT_GAME_STATUS: Record<string, boolean> = GAME_STATUS_KEYS.reduce(
  (acc, key) => {
    acc[key] = true;
    return acc;
  },
  {} as Record<string, boolean>
);

export function getGameKeyFromHref(href: string): string {
  return GAME_ROUTE_TO_KEY[href] ?? href.replace("/", "");
}
