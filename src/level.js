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
  blurb: 'Two patrollers, one guard room. Copy a sentry and walk out disguised.',
  hint: 'You are mirrormorph. Stay close to target to copy its form.',

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
    '##........##........###',
    '##...1....##.S....S.###',
    '##.o...o..##........###',
    '##.o...o..##.S....S.###',
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

  // Guard room: two columns facing each other. Bodies stay square; heads sweep facing ± arc/2,
  // one full sweep every `period` s. Reading order: left top, right top, left mid, right mid, ...
  posted: [
    { facing: 0, arc: 100, period: 4.5, phase: 0.0 },
    { facing: 180, arc: 100, period: 4.5, phase: 1.05 },
    { facing: 0, arc: 100, period: 4.5, phase: 2.1 },
    { facing: 180, arc: 100, period: 4.5, phase: 3.15 },
    { facing: 0, arc: 100, period: 4.5, phase: 4.2 },
    { facing: 180, arc: 100, period: 4.5, phase: 5.25 },
  ],
};
