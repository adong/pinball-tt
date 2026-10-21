/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: PB.TITLE,
  keys: [
    ['left flipper', 'Z or ←'],
    ['right flipper', '/ or →'],
    ['pull the plunger · let go to launch', 'hold Space or ↓'],
    ['nudge the table (not too much!)', 'N or ↑'],
    ['call your brother · high five', 'T or Enter'],
    ['pause · sound', 'P or Esc · M'],
  ],
  note: '2 players take turns, a ball each, with the same keys.',
  touch: 'The left half of the screen is the left flipper, the right half the right one. While the ball waits by the plunger, hold a finger down, then let go to launch. NUDGE shakes the table. The round face button (top right) calls your brother.',
});
