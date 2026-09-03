export const MAX_PLAYERS = 5;
export const TICK_MS = 50;
export const TICK_DT = TICK_MS / 1000;
export const SNAPSHOT_EVERY = 1;

export const CABIN = {
  minX: -2.08,
  maxX: 2.08,
  minZ: 0.55,
  maxZ: 21.4,
  ceiling: 2.18,
  aisleHalf: 0.6,
};

export const PLAYER_COLORS = [
  { id: "teal", hex: 0x2ec4b6, css: "#2ec4b6", name: "Teal" },
  { id: "coral", hex: 0xff6b4a, css: "#ff6b4a", name: "Coral" },
  { id: "gold", hex: 0xf4c430, css: "#f4c430", name: "Gold" },
  { id: "violet", hex: 0xb388ff, css: "#b388ff", name: "Violet" },
  { id: "mint", hex: 0x7dffb0, css: "#7dffb0", name: "Mint" },
];

export const ITEM_DEFS = {
  coffee: { label: "Coffee", needs: ["thirst"], color: 0x5c3d2e, css: "#5c3d2e", hold: "cup" },
  water: { label: "Water", needs: ["thirst"], color: 0x7ec8e3, css: "#7ec8e3", hold: "cup" },
  soda: { label: "Soda", needs: ["thirst"], color: 0xe23d28, css: "#e23d28", hold: "can" },
  wine: { label: "Box wine", needs: ["thirst", "drunk"], color: 0x6b1c4a, css: "#6b1c4a", hold: "box" },
  meal: { label: "Hot meal", needs: ["hunger"], color: 0xd4a373, css: "#d4a373", hold: "tray" },
  blanket: { label: "Blanket", needs: ["comfort"], color: 0x3d5a80, css: "#3d5a80", hold: "fold" },
  pillow: { label: "Pillow", needs: ["comfort"], color: 0xf0ead6, css: "#f0ead6", hold: "pillow" },
  barfbag: { label: "Barf bag", needs: ["sick"], color: 0xc4b6a6, css: "#c4b6a6", hold: "bag" },
  headphones: { label: "Headphones", needs: ["boredom"], color: 0x222222, css: "#222222", hold: "cans" },
  firstaid: { label: "First aid", needs: ["medical"], color: 0xe63946, css: "#e63946", hold: "kit" },
  bottle: { label: "Warm bottle", needs: ["baby"], color: 0x8ecae6, css: "#8ecae6", hold: "bottle" },
  extinguisher: { label: "Extinguisher", needs: ["fire"], color: 0xd90429, css: "#d90429", hold: "tank" },
  trashbag: { label: "Trash", needs: ["trash"], color: 0x44555a, css: "#44555a", hold: "bag" },
};

export const NEED_META = {
  thirst: { label: "Drink", icon: "☕", critical: false },
  hunger: { label: "Meal", icon: "🍱", critical: false },
  comfort: { label: "Blanket", icon: "🧣", critical: false },
  sick: { label: "Barf bag", icon: "🤢", critical: false },
  boredom: { label: "Headphones", icon: "🎧", critical: false },
  medical: { label: "First aid", icon: "✚", critical: true },
  baby: { label: "Bottle", icon: "🍼", critical: true },
  trash: { label: "Trash", icon: "🗑️", critical: false },
  drunk: { label: "Box wine", icon: "🍷", critical: false },
};

export const ROW_COUNT = 6;
export const ROW_Z0 = 3.15;
export const ROW_PITCH = 1.58;
export const SEAT_X = [-1.5, -0.9, 0.9, 1.5];
export const SEAT_LETTERS = ["A", "B", "C", "D"];

export const STATIONS = [
  { id: "coffee", z: 18.4, x: -1.55, item: "coffee", label: "Coffee maker" },
  { id: "fridge", z: 19.2, x: -1.55, item: "water", label: "Fridge", cycle: ["water", "soda", "wine"] },
  { id: "oven", z: 20.0, x: -1.55, item: "meal", label: "Oven" },
  { id: "cupboard", z: 18.4, x: 1.55, item: "blanket", label: "Linens", cycle: ["blanket", "pillow", "headphones", "barfbag"] },
  { id: "med", z: 19.2, x: 1.55, item: "firstaid", label: "Med kit" },
  { id: "warmer", z: 20.0, x: 1.55, item: "bottle", label: "Bottle warmer" },
  { id: "ext", z: 17.6, x: 1.55, item: "extinguisher", label: "Extinguisher" },
];

export const CART_DOCK = { x: 0, z: 17.35 };

export const FLIGHT_SECONDS = {
  short: 180,
  regular: 270,
  long: 390,
};

// eventMul / needMul: multiply the *interval* between director events and
// passenger need-calls, so lower = more frequent = harder.
// moodMul: multiplies mood penalties from mistakes, spills, ignored calls, etc.
export const DIFFICULTY = {
  calm: { label: "Calm hop", eventMul: 1.35, needMul: 1.25, moodMul: 0.75 },
  standard: { label: "Standard red-eye", eventMul: 1, needMul: 1, moodMul: 1 },
  chaos: { label: "Chaos from hell", eventMul: 0.68, needMul: 0.72, moodMul: 1.3 },
};

export const PAX_FIRST = [
  "Margo", "Len", "Priya", "Doug", "Yasmin", "Chet", "Ines", "Ravi",
  "Pam", "Nico", "Helga", "Omar", "June", "Felix", "Tilda", "Wes",
  "Asha", "Burt", "Cleo", "Igor", "Nia", "Sal", "Bea", "Hugo",
];

export const PAX_SHIRTS = [
  0xc1121f, 0x669bbc, 0x003049, 0xfdf0d5, 0x780000, 0x2a9d8f,
  0xe9c46a, 0x264653, 0xe76f51, 0x8d99ae, 0x4a4e69, 0xf2cc8f,
];

export function seatLabel(row, seat) {
  return `${row + 1}${SEAT_LETTERS[seat]}`;
}

export function passengerCount() {
  return ROW_COUNT * SEAT_X.length;
}

export function seatWorld(row, seat) {
  return {
    x: SEAT_X[seat],
    z: ROW_Z0 + row * ROW_PITCH,
    aisle: seat === 1 || seat === 2,
    window: seat === 0 || seat === 3,
  };
}

export function makeCode() {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}
