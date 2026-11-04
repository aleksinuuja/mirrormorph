// See room1-tunnel.js for the room format.

export default {
  id: 'boss',
  name: 'Mirror Boss',
  blurb: 'There can be only one. Copy the Overseer and its minions split.',
  hint: 'Copy the boss to split its minions',
  width: 16,
  height: 28,
  goal: 'boss',
  playerStart: { x: 8, y: 3 },
  walls: [
    [3, 9, 1.6, 1.6],
    [11.4, 9, 1.6, 1.6],
    [7.2, 13, 1.6, 1.6],
  ],
  entities: [
    { type: 'boss', x: 8, y: 22, faction: 'hostile' },
    { type: 'minion', x: 5, y: 22, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
    { type: 'minion', x: 11, y: 22, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
    { type: 'minion', x: 6.5, y: 19.5, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
    { type: 'minion', x: 9.5, y: 19.5, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
    { type: 'minion', x: 6.5, y: 24.5, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
    { type: 'minion', x: 9.5, y: 24.5, faction: 'hostile', cohort: 'swarm', minion: true, aggro: 9 },
  ],
};
