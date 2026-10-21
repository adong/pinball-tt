/* 中文 for TT Pinball: the words on the page, the toasts, the table names (also painted on the backbox through
   Kit.lang.t in js/view.js), and the ? panel. Stays in English on purpose: the kids' names (TEDDY, TOMMY) and the
   game's name (Alan picks the names), and the key labels (Z, M, Space shows as 空格 through the kit).
   Kid-friendly words: 弹珠台 (pinball table), 弹簧 (the plunger's spring), 挡板 (flipper), 多球 (MULTIBALL). */
(function () {
  const L = Kit.lang;
  L.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', PB.TITLE, 'Esc', '❚❚', '◀', '▶', 'TILT!']);

  const TABLES = { SPACE: '太空', JUNGLE: '丛林', CANDY: '糖果' };
  const RAMPS = { 'ROCKET RAMP': '火箭坡道', 'VINE RAMP': '藤蔓坡道', 'WATERFALL RAMP': '瀑布坡道', 'CANDY CANE RAMP': '拐杖糖坡道' };
  const dict = {};
  for (const k in TABLES) dict[k] = TABLES[k];
  Object.assign(dict, {
    // title screen
    'Teddy & Tommy flip, bump and bonk!': 'Teddy 和 Tommy 来打弹珠台！',
    '1 PLAYER': '单人', '2 PLAYERS': '双人', 'Teddy and Tommy take turns': 'Teddy 和 Tommy 轮流玩',
    '🚀 SPACE': '🚀 太空', '🐒 JUNGLE': '🐒 丛林', '🍭 CANDY': '🍭 糖果',
    '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通',
    // HUD
    'Pause (P)': '暂停 (P)', Sound: '声音', 'press T': '按 T', 'tap for more help': '再点一下，再帮你一次',
    'HIGH FIVE! ✋': '击掌！✋', NUDGE: '摇一摇',
    'HOLD SPACE, THEN LET GO!': '按住空格拉弹簧，再松开！', 'HOLD YOUR FINGER DOWN, THEN LET GO!': '按住屏幕拉弹簧，再松开！',
    // toasts
    '⭐ ALL THREE LANES! +3,000': '⭐ 三条小路全亮了！+3,000', '🎯 ALL TARGETS DOWN! +5,000': '🎯 靶子全倒啦！+5,000',
    'KICKBACKS ARE ON!': '弹回器打开啦！', 'BOING! KICKBACK!': '嘣！弹回来啦！',
    '💰 JACKPOT! +10,000': '💰 大奖！+10,000', 'MULTIBALL IS READY! SHOOT A RAMP!': '多球准备好了！把球打上坡道！',
    '🎉 MULTIBALL! 🎉': '🎉 多球！🎉', 'MULTIBALL IS OVER': '多球结束了',
    '🛟 BALL SAVED!': '🛟 球救回来啦！', 'OOPS! THE BALL GOT AWAY!': '哎呀！球跑掉了！',
    'CAREFUL! NOT TOO MUCH SHAKING!': '小心！别摇太多啦！', 'TILT! 😵 THE FLIPPERS NAP FOR A MOMENT': '摇太多啦！😵 挡板要睡一会儿',
    'TILT! 😵 NO SHAKING FOR A MOMENT': '摇太多啦！😵 先别摇了', 'ONE MORE SECOND…': '再等一秒…',
    '✋ HIGH FIVE! ✋': '✋ 击掌！✋',
    // screens
    PAUSED: '暂停中', '▶ PLAY': '▶ 继续', '↻ START AGAIN': '↻ 重新开始', '🏠 MENU': '🏠 菜单',
    'GREAT GAME!': '打得真棒！', "IT'S A TIE!": '平局！', 'PLAY AGAIN': '再玩一次',
    // the ? panel
    'left flipper': '左挡板', 'right flipper': '右挡板', 'pull the plunger · let go to launch': '拉弹簧 · 松开就发射',
    'nudge the table (not too much!)': '摇一摇弹珠台（别摇太多！）', 'call your brother · high five': '叫兄弟来帮忙 · 击掌',
    'Z or ← or Left Shift': 'Z 或 ← 或 左 Shift', 'M or → or Right Shift': 'M 或 → 或 右 Shift', 'hold Space or ↓': '按住 空格 或 ↓',
    'N or ↑': 'N 或 ↑', 'T or Enter': 'T 或 回车', 'P or Esc · M on the menus': 'P 或 Esc · 在菜单里按 M',
    'While a ball is in play, M is the right flipper; the 🔊 button at the top switches the sound. 2 players take turns, a ball each, with the same keys.':
      '玩的时候 M 是右挡板，上面的 🔊 按钮开关声音。双人时两个人轮流，每人打一个球，用一样的按键。',
    'The left half of the screen is the left flipper, the right half the right one. While the ball waits by the plunger, hold a finger down, then let go to launch. NUDGE shakes the table. The round face button (top right) calls your brother.':
      '左半边屏幕是左挡板，右半边是右挡板。球在弹簧旁边等着的时候，按住屏幕再松开就能发射。“摇一摇”按钮可以摇弹珠台。右上角的圆形头像按钮可以叫兄弟来帮忙。',
  });
  L.add(dict);

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', JUICE: '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const N = '(TEDDY|TOMMY)';
  L.rule(new RegExp(`^CALL ${N}$`), '叫 $1');
  L.rule(new RegExp(`^${N} IS HERE!$`), '$1 来啦！');
  L.rule(new RegExp(`^${N} IS COMING TO HELP!$`), '$1 来帮忙啦！');
  L.rule(new RegExp(`^${N} SAYS: BALL SAVER ON!$`), '$1 说：保护球打开啦！');
  L.add({ '👇 HIT THE GLOWING TARGET!': '👇 打那个发光的靶子！' });
  L.rule(new RegExp(`^🛟 ${N} SAVED THE BALL!$`), '🛟 $1 把球救回来啦！');
  L.rule(new RegExp(`^🎯 ${N}'S TARGET! \\+5,000$`), '🎯 $1 的靶子！+5,000');
  L.rule(new RegExp(`^BYE BYE, ${N}! 👋$`), '$1 拜拜！👋');
  L.rule(new RegExp(`^${N}'S TURN$`), '轮到 $1 啦');
  L.rule(new RegExp(`^${N} WINS!$`), '$1 赢啦！');
  L.rule(new RegExp(`^(\\S+) (ICE CREAM|WATER|JUICE|COOKIE|WATERMELON|BANANA) FROM ${N}!$`), (m, e, item, who) => `${e} ${who} 送来的${TREAT[item]}！`);
  L.rule(/^(ROCKET RAMP|VINE RAMP|WATERFALL RAMP|CANDY CANE RAMP)! \+2,000$/, (m, r) => `${RAMPS[r]}！+2,000`);
  L.rule(/^MULTIBALL LIGHT (\d) OF (\d)$/, '多球灯 $1 / $2');
  L.rule(/^BALL (\d) OF (\d)$/, '第 $1 个球（共 $2 个）');
  L.rule(/^BEST SCORE ([\d,]+)$/, '最高分 $1');
  L.rule(/^BEST ([\d,]+)$/, '最高分 $1');
  L.rule(/^NEW BEST! ([\d,]+)$/, '新纪录！$1');
})();
