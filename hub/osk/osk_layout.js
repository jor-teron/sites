/*
 * On-screen keyboard — layout (hub/osk/osk_layout.js). Data only.
 * Shared by the Hub OSK panel (hub/osk/osk.js) and the Lab keyboard page (apps/lab/keyboard/).
 * The key rows (US layout) and the spoken names of symbol keys.
 * Row entry: [label, key, shiftKey, flex, extra]
 *   key        KeyboardEvent.key value sent ('a', 'Enter', 'ArrowLeft', ' ')
 *   shiftKey   value with Shift (symbols only; letters use upper case)
 *   flex       relative width (default 1)
 *   extra      { mod:'shift|ctrl|alt' } or { action:'caps' | other } for special keys, { say:'...' } aria name
 */
(function () {
  'use strict';

  const ROWS = [
    [['Esc', 'Escape', null, 1.2, { say: 'Escape' }], ['`', '`', '~'], ['1', '1', '!'], ['2', '2', '@'], ['3', '3', '#'],
      ['4', '4', '$'], ['5', '5', '%'], ['6', '6', '^'], ['7', '7', '&'], ['8', '8', '*'], ['9', '9', '('], ['0', '0', ')'],
      ['-', '-', '_'], ['=', '=', '+'], ['⌫', 'Backspace', null, 1.6, { say: 'Backspace' }]],
    [['Tab', 'Tab', null, 1.5], ['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p'],
      ['[', '[', '{'], [']', ']', '}'], ['\\', '\\', '|', 1.3]],
    [['Caps', '', null, 1.8, { action: 'caps', say: 'Caps Lock' }], ['a'], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l'],
      [';', ';', ':'], ["'", "'", '"'], ['Enter', 'Enter', null, 2]],
    [['Shift', '', null, 2.3, { mod: 'shift' }], ['z'], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'],
      [',', ',', '<'], ['.', '.', '>'], ['/', '/', '?'], ['Del', 'Delete', null, 1.5, { say: 'Delete' }]],
    [['Ctrl', '', null, 1.3, { mod: 'ctrl', say: 'Control' }], ['Alt', '', null, 1.3, { mod: 'alt' }],
      ['Home', 'Home', null, 1.2], ['Space', ' ', null, 5], ['End', 'End', null, 1.2],
      ['←', 'ArrowLeft', null, 1, { say: 'Left arrow' }], ['↑', 'ArrowUp', null, 1, { say: 'Up arrow' }],
      ['↓', 'ArrowDown', null, 1, { say: 'Down arrow' }], ['→', 'ArrowRight', null, 1, { say: 'Right arrow' }]],
  ];

  // Screen-reader names for symbol labels (the label changes with Shift)
  const SAY = {
    '`': 'Backquote', '~': 'Tilde', '!': 'Exclamation mark', '@': 'At sign', '#': 'Hash', '$': 'Dollar', '%': 'Percent',
    '^': 'Caret', '&': 'Ampersand', '*': 'Asterisk', '(': 'Left parenthesis', ')': 'Right parenthesis', '-': 'Minus',
    '_': 'Underscore', '=': 'Equals', '+': 'Plus', '[': 'Left bracket', ']': 'Right bracket', '{': 'Left brace',
    '}': 'Right brace', '\\': 'Backslash', '|': 'Vertical bar', ';': 'Semicolon', ':': 'Colon', "'": 'Apostrophe',
    '"': 'Quote', ',': 'Comma', '<': 'Less than', '.': 'Period', '>': 'Greater than', '/': 'Slash', '?': 'Question mark',
  };

  window.OSK_LAYOUT = { ROWS: ROWS, SAY: SAY };
})();
