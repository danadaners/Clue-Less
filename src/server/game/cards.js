import { SUSPECT_IDS, WEAPON_IDS, ROOM_IDS } from "./catalog.js";

/** All 21 cards. */
export function createDeck() {
  return [
    ...SUSPECT_IDS.map((id) => ({ id, category: "suspect" })),
    ...WEAPON_IDS.map((id) => ({ id, category: "weapon" })),
    ...ROOM_IDS.map((id) => ({ id, category: "room" })),
  ];
}

function shuffle(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick one random suspect, weapon, and room; return the solution and the 18 cards left. */
export function createSolution(deck) {
  const shuffled = shuffle(deck);
  const pick = (category) => shuffled.find((c) => c.category === category);
  const solution = { suspect: pick("suspect"), weapon: pick("weapon"), room: pick("room") };
  const rest = shuffled.filter((c) => !Object.values(solution).includes(c));
  return { solution, rest };
}

/** Deal one card at a time around the players, in turn order. */
export function dealCards(cards, players) {
  for (const player of players) player.hand = [];
  cards.forEach((card, i) => players[i % players.length].hand.push(card));
}