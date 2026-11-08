// The stealth level. Edit the map freely; everything is read from it.
//
//   #  wall               .  floor
//   o  pillar (cover; a run like oo is one wide block)   =  slab (long low cover)
//   P  player start       E  exit tiles
//   S  posted sentry (settings in `posted`, in reading order: left→right, top→bottom)
//   1 2  patrol endpoints: one sentry walks 1 → 2 → 1 …
//
// Angles are degrees: 0 = east (right), 90 = north (up), -90 = south, 180 = west.

export default {
  name: 'Stealth',
  blurb: 'Sneak up behind the patrolling sentry, take its form, and walk through the guard room.',
  hint: 'Get behind the patroller to copy it',

  map: [
    '###################################',
    '#......############################',
    '#..EE..############################',
    '#......############################',
    '#......############################',
    '###..##############################',
    '###..##############################',
    '###..##############################',
    '#......############################',
    '#......############################',
    '#.S..S.############################',
    '#......############################',
    '#......############################',
    '#..S..S###################........#',
    '#......###################....P...#',
    '#......###################........#',
    '#S...S.###################........#',
    '#......###################..o..o..#',
    '###..#####################........#',
    '###..#####################..o..o..#',
    '###..#####################........#',
    '###..#####################........#',
    '###..####.........................#',
    '###..####.........................#',
    '###..####.ooo.ooo.ooo.ooo.ooo.....#',
    '###.......1.....................2.#',
    '###...............................#',
    '#########..ooo.ooo.ooo.ooo..===...#',
    '#########.........................#',
    '#########.........................#',
    '###################################',
  ],

  // Posted sentries sweep their gaze: facing ± arc/2, one full sweep every `period` seconds.
  posted: [
    { facing: -45, arc: 100, period: 5.0, phase: 0.0 },   // upper left
    { facing: -135, arc: 100, period: 4.2, phase: 1.6 },  // upper right
    { facing: 0, arc: 120, period: 5.5, phase: 3.1 },     // middle left
    { facing: 180, arc: 100, period: 4.6, phase: 0.8 },   // middle right
    { facing: 45, arc: 90, period: 3.8, phase: 2.2 },     // lower left
    { facing: -90, arc: 100, period: 4.4, phase: 4.0 },   // lower right, watches the entrance
  ],
};
