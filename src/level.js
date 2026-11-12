// The rooms. Edit the maps freely; everything is read from them.
//
//   #  wall               .  floor
//   o  block (cover). Touching o's form one solid block: "oooo" is a wide one,
//      a vertical stack is a tall one.
//   =  slab (long low cover)
//   P  player start       E  exit tiles (stand on them for a few seconds to escape)
//   D  emergency door (opens when every sentry is destroyed and sends in reinforcements)
//   S  posted sentry (settings in `posted`, in reading order: left→right, top→bottom)
//   1 2, 3 4, 5 6 …  patrol routes: one sentry walks back and forth between each pair
//
// `enemy` picks the robot type for every sentry in the room (an archetype in config.js).
//
// Angles are degrees: 0 = east (right), 90 = north (up), -90 = south, 180 = west.

const room1 = {
  name: 'Railguns',
  enemy: 'sentry',
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
    '##........##........D##',
    '##...1....##.S....S.D##',
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

// Room 2: the same map, held by gunners (gatling, auto-aim, slow swing).
const room2 = {
  ...room1,
  name: 'Gatlings',
  enemy: 'gunner',
  blurb: 'Same halls, new guards: gunners with slow-swinging gatlings. Copy one and let it aim for you.',
};

export default [room1, room2];
