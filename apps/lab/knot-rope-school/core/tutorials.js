// Interactive visual tutorial sequences.
(function (api) {
function figureEightTutorial(step) {
  const stages = [
    { title: "Make the first loop", note: "Bring the working end across the standing part to form one open loop." },
    { title: "Go behind", note: "Carry the working end behind the standing part. Keep the first loop open." },
    { title: "Come forward", note: "Bring the working end back toward you, across the front of the standing part." },
    { title: "Tuck through", note: "Pass the working end down through the first loop. Keep the tail visible." },
    { title: "Dress the knot", note: "Pull the standing part and tail apart gently. Arrange the strands into a neat figure eight." }
  ];
  const paths = [
    '<path class="rope-main" d="M170 8 L170 83 C170 112 125 145 88 125 C52 105 77 66 111 67 C132 67 151 78 170 83"/>',
    '<path class="rope-main" d="M170 8 L170 83 C170 112 125 145 88 125 C52 105 77 66 111 67 C132 67 151 78 170 83"/>',
    '<path class="rope-main" d="M170 8 L170 83 C170 112 125 145 88 125 C52 105 77 66 111 67 C132 67 151 78 170 83"/>',
    '<path class="rope-main" d="M170 8 L170 83 C170 112 125 145 88 125 C52 105 77 66 111 67 C132 67 151 78 170 83"/>',
    '<path class="rope-main" d="M170 8 C170 38 95 37 95 82 C95 125 145 142 170 104 C195 142 245 125 245 82 C245 37 170 38 170 8"/>'
  ];
  const overlays = [
    '<path class="rope-tail" d="M170 83 C190 93 208 109 224 126"/>',
    '<path class="rope-tail" d="M170 83 C197 93 211 116 224 140"/>',
    '<path class="rope-tail" d="M170 83 C197 93 211 116 224 140"/>',
    '<path class="rope-tail" d="M224 140 C203 127 184 113 170 98"/>',
    ''
  ];
  const current = stages[step];
  return `<div class="visual-tutorial" aria-label="Figure-eight knot visual tutorial">
    <div class="tutorial-main-row">
      <div class="tutorial-diagram">
      <svg viewBox="0 0 340 170" role="img" aria-label="Figure-eight knot tying stage ${step + 1}">
        <path class="standing-rope" d="M170 8 L170 83"/>
        ${paths[step]}
        ${overlays[step]}
        <circle cx="170" cy="8" r="5" class="rope-dot"/>
        <text x="184" y="18" class="diagram-label">STANDING PART</text>
        <text x="226" y="148" class="diagram-label">WORKING END</text>
        ${step === 3 ? '<path class="direction-arrow" d="M187 119 l-13 -8 m13 8 l-2 -15"/>' : ''}
        ${step === 4 ? '<text x="170" y="160" text-anchor="middle" class="diagram-label">FINISHED FIGURE EIGHT</text>' : ''}
      </svg>
      </div>
      <div class="tutorial-copy">
        <span class="visual-step-count">STEP ${String(step + 1).padStart(2, "0")} / 05</span>
        <h3>${current.title}</h3><p>${current.note}</p>
      </div>
    </div>
    <div class="tutorial-progress">${stages.map((_, i) => `<span class="${i <= step ? "done" : ""}"></span>`).join("")}</div>
    <div class="tutorial-controls">
      <button class="tutorial-nav" data-tutorial-step="prev" ${step === 0 ? "disabled" : ""}>← Back</button>
      <div class="tutorial-dots">${stages.map((_, i) => `<span class="${i === step ? "current" : ""}"></span>`).join("")}</div>
      <button class="tutorial-nav tutorial-next" data-tutorial-step="next" ${step === 4 ? "disabled" : ""}>${step === 4 ? "Finished" : "Next step →"}</button>
    </div>
  </div>`;
}
api.figureEightTutorial = figureEightTutorial;
})(window.KRS = window.KRS || {});
