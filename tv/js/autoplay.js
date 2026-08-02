function startAutoplay() {
  // Find first real stream (skip apps/pages/empty)
  const firstStreamIndex = channels.findIndex(ch => ch.type === 'stream');

  if (firstStreamIndex !== -1) {
    currentIndex = firstStreamIndex;
    updateActiveTile();
    playChannel(currentIndex);
  }
}
