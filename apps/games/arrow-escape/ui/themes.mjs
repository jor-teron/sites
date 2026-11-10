export const THEMES=[['classic','Classic'],['wood','Wood'],['carbus','Car & Bus'],['floor','Floor Tiles'],['stone','Stone']];
const palettes={classic:['#287eac','#b16a3d','#3b9172','#9866b7','#bc5876','#607eaa'],
  wood:['#9d5122','#ae7434','#754228','#ac6231','#8e6c24','#c08040'],
  carbus:['#2e8fd0','#c16a36','#2d9980','#9d75c9','#c3546e','#557cbd'],
  floor:['#288b8e','#ac6e45','#4f826a','#7760ad','#ae5977','#5b78a0'],
  stone:['#6c91a4','#a88761','#72947e','#9187a6','#ac7784','#7b8fa9']};
export function applyBoardTheme(store,value) {
  const key=THEMES.some(([id])=>id===value)?value:'classic';
  document.documentElement.dataset.boardTheme=key;
  try {store.setItem('arrow-escape.board-theme',key);} catch {}
  return key;
}
export function arrowColor(id) {
  const colors=palettes[document.documentElement.dataset.boardTheme]||palettes.classic;
  return colors[id%colors.length];
}
