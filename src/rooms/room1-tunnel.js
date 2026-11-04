// Room format
//   width, height       room size in world units (origin bottom-left, y up)
//   goal                'exit' (reach exit rect) or 'boss' (destroy every boss)
//   exit                { x, y, w, h } rect, bottom-left corner
//   playerStart         { x, y }
//   walls               [x, y, w, h] rects, bottom-left corner. Room border is automatic.
//   entities            { type, x, y, faction, cohort?, patrol?, wander?, aggro?, minion?, angle? }
//     type      key in config.archetypes
//     faction   'hostile' | 'friendly' | 'neutral' (relative to the player)
//     cohort    group name; copying a cohort member's type disguises you among them
//     patrol    [[x, y], ...] waypoints walked in a loop when idle
//     wander    [x0, y0, x1, y1] box to wander inside when idle
//     minion    true = orbits the boss and takes part in the "two bosses" split

export default {
  id: 'tunnel',
  name: 'Shape',
  blurb: 'A tunnel too narrow for your hull. Become something that fits.',
  hint: 'Stay close to something to copy it',
  width: 12,
  height: 22,
  goal: 'exit',
  exit: { x: 4.5, y: 19.3, w: 3, h: 2 },
  playerStart: { x: 3, y: 2.5 },
  walls: [
    [0, 9, 5.6, 6],     // left block
    [6.4, 9, 5.6, 6],   // right block: leaves a 0.8-wide tunnel
  ],
  entities: [
    { type: 'drone', x: 8, y: 5, faction: 'neutral', wander: [1, 1, 11, 8] },
    { type: 'rock', x: 10.5, y: 1.6, faction: 'neutral' },
    { type: 'rock', x: 9.5, y: 17, faction: 'neutral' },
    { type: 'rock', x: 2.5, y: 18, faction: 'neutral' },
  ],
};
