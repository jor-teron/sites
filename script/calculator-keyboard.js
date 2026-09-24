document.addEventListener('keydown', (e) => {
  const keyMap = {
  'Backspace' : '<',
  'Delete' : 'C',
    '0': '0',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    '+': '+',
    '-': '-',
    '*': '*',
    'x': '*',
    '/': '/',
    '=': '=',
    'Enter': '=',
    '.': '.',
    'Escape': 'C',
    'Numpad0': '0',
    'Numpad1': '1',
    'Numpad2': '2',
    'Numpad3': '3',
    'Numpad4': '4',
    'Numpad5': '5',
    'Numpad6': '6',
    'Numpad7': '7',
    'Numpad8': '8',
    'Numpad9': '9',
    'NumpadAdd': '+',
    'NumpadSubtract': '-',
    'NumpadMultiply': '*',
    'NumpadDivide': '/',
    'NumpadDecimal': '.',
    'NumpadEnter': '='
  };

  const value = keyMap[e.code] || keyMap[e.key];
  if (value) {
    e.preventDefault();
    const button = Array.from(document.querySelectorAll('.button')).find(
      btn => btn.textContent === value
    );
    if (button) {
      button.click();
    }
  }
});
