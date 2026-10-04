const textarea = document.querySelector('.notepad-textarea');
const saveButton = document.querySelector('.notepad-save');
const downloadButton = document.querySelector('.notepad-download');
const clearButton = document.querySelector('.notepad-clear');

textarea.value = localStorage.getItem('notepad-text') || '';

saveButton.addEventListener('click', () => {
  localStorage.setItem('notepad-text', textarea.value);
});

downloadButton.addEventListener('click', () => {
  const text = textarea.value;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'My_note.txt';
  a.click();
  URL.revokeObjectURL(url);
});

clearButton.addEventListener('click', () => {
  textarea.value = '';
  localStorage.removeItem('notepad-text');
});

// Enable drag-and-drop for File Sharing integration
textarea.addEventListener('dragstart', (e) => {
  if (textarea.value) {
    e.dataTransfer.setData('text/plain', textarea.value);
  }
});
