// The stealth level. Edit the map freely; everything is read from it.
//
//   #  wall               .  floor
//   o  block (cover). Touching o's form one solid block: "oooo" is a wide one,
//      a vertical stack is a tall one.
//   =  slab (long low cover)
//   P  player start       E  exit tiles
//   S  posted sentry (settings in `posted`, in reading order: left→right, top→bottom)
//   1 2, 3 4, 5 6 …  patrol routes: one sentry walks back and forth between each pair
//
// Angles are degrees: 0 = east (right), 90 = north (up), -90 = south, 180 = west.

export default {
  name: 'Stealth',
  blurb: 'Two patrollers, one guard room. Copy a patroller from behind and walk out disguised.',
  hint: 'Get behind a patroller to copy it',

  map: [
    '#######################',
    '####......###.......###',
    '####......###..EE...###',
    '####..P...###..EE...###',
    '####......###.......###',
    '####......###.......###',
    '#######..######..######',
    '#######..######..######',
    '#######..######..######',
    '#######..###........###',
    '##........##.S....S.###',
    '##........##.S......###',
    '##...1....##.S....S.###',
    '##.o...o..##......S.###',
    '##.o...o..##........###',
    '##........####..#######',
    '##.o...o..####..#######',
    '##.o...o..####..#######',
    '##.o...o..####..#######',
    '##........####..#######',
    '##...2....####..#######',
    '#.....................#',
    '#.....................#',
    '#.oooo.oooo.oooo.oooo.#',
    '#.3.................4.#',
    '#.....................#',
    '#.oooo.oooo.oooo.oooo.#',
    '#.....................#',
    '#.....................#',
    '#######################',
  ],

  // Guard room. Posted sentries sweep their gaze: facing ± arc/2, one full sweep every `period` s.
  posted: [
    { facing: 0, arc: 100, period: 4.6, phase: 0.0 },     // left column, top
    { facing: 180, arc: 100, period: 5.2, phase: 2.0 },   // right column, top
    { facing: 0, arc: 110, period: 3.9, phase: 1.2 },     // left column, middle
    { facing: -20, arc: 110, period: 5.0, phase: 3.3 },   // left column, bottom: also watches the corridor
    { facing: 180, arc: 100, period: 4.3, phase: 0.6 },   // right column, middle
    { facing: -160, arc: 110, period: 4.8, phase: 4.1 },  // right column, bottom: also watches the corridor
  ],
};
