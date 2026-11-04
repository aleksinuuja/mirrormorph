// See room1-tunnel.js for the room format.

export default {
  id: 'stealth',
  name: 'Stealth',
  blurb: 'A hall full of sentries. Walk through as one of them. Shooting blows your cover.',
  hint: 'Copy the lone sentry, then walk through the hall',
  width: 14,
  height: 28,
  goal: 'exit',
  exit: { x: 5.5, y: 25.3, w: 3, h: 2 },
  playerStart: { x: 7, y: 2 },
  walls: [
    [2, 4.5, 1.5, 1.5],     // cover blocks in the yard
    [10.5, 4.5, 1.5, 1.5],
    [0, 11, 5, 0.6],        // divider with a doorway
    [9, 11, 5, 0.6],
    [0, 13.5, 3.5, 10],     // hall sides
    [10.5, 13.5, 3.5, 10],
  ],
  entities: [
    // Lone patroller in the yard
    { type: 'sentry', x: 3, y: 8.3, faction: 'hostile', cohort: 'sentries', aggro: 6,
      patrol: [[3, 8.3], [11, 8.3]] },
    // The hall
    { type: 'sentry', x: 5, y: 15.5, faction: 'hostile', cohort: 'sentries', aggro: 6.5 },
    { type: 'sentry', x: 9, y: 15.5, faction: 'hostile', cohort: 'sentries', aggro: 6.5 },
    { type: 'sentry', x: 7, y: 18.5, faction: 'hostile', cohort: 'sentries', aggro: 6.5 },
    { type: 'sentry', x: 5, y: 21.5, faction: 'hostile', cohort: 'sentries', aggro: 6.5 },
    { type: 'sentry', x: 9, y: 21.5, faction: 'hostile', cohort: 'sentries', aggro: 6.5 },
  ],
};
