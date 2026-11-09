// Tab switching
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.target);
    if (target) target.classList.add('active');
  });
});

// Modal data & handling
const modalData = {
  grip: {
    title: "The Pinch Grip",
    content: `
      <p>The pinch grip is the professional standard for holding a chef's knife. It gives you maximum control and reduces the risk of the knife slipping.</p>
      <ul>
        <li><strong>How to do it:</strong> Pinch the blade right in front of the bolster (where the metal meets the handle) between your thumb and index finger.</li>
        <li><strong>Wrap:</strong> Wrap your remaining three fingers securely around the handle.</li>
        <li><strong>Why:</strong> Holding only the handle makes the knife feel clumsy and heavy at the tip. Pinching the blade extends your hand into the knife as an extension of your arm.</li>
      </ul>
    `
  },
  claw: {
    title: "The Claw Hand (Guide Hand)",
    content: `
      <p>Your non-knife hand protects your fingers while holding the food.</p>
      <ul>
        <li><strong>How to do it:</strong> Curve your fingers inward like a cat's paw or a claw.</li>
        <li><strong>Contact:</strong> Rest the flat side of the knife blade gently against the knuckles of your guiding hand.</li>
        <li><strong>Fingertips:</strong> Tuck your fingertips back so the knife rests against your knuckles, making accidental nicks nearly impossible.</li>
      </ul>
    `
  },
  rock: {
    title: "The Rocking Motion",
    content: `
      <p>The standard slicing technique for herbs, vegetables, and boneless items.</p>
      <ul>
        <li><strong>Tip down:</strong> Keep the tip of the knife lightly touching or very close to the cutting board.</li>
        <li><strong>Motion:</strong> Push the knife forward and down in a smooth rocking motion.</li>
        <li><strong>Rhythm:</strong> Let the weight of the knife do most of the work. Avoid pressing down heavily or hacking.</li>
      </ul>
    `
  },
  sharpen: {
    title: "Board & Knife Care",
    content: `
      <p>Proper maintenance keeps your tools safe and efficient.</p>
      <ul>
        <li><strong>Cutting Boards:</strong> Use wood or thick plastic boards. Avoid glass, marble, or ceramic boards—they will dull your knife instantly.</li>
        <li><strong>Honing vs Sharpening:</strong> Use a honing steel frequently (before every big use) to realign the blade edge. Sharpening removes metal and is done less often.</li>
        <li><strong>Washing:</strong> Always hand wash and dry your knife immediately. Never put it in the dishwasher.</li>
      </ul>
    `
  },
  dice: {
    title: "How to Dice (Cube)",
    content: `
      <p>Dicing creates uniform cubes for even cooking and presentation.</p>
      <ul>
        <li><strong>Step 1:</strong> Cut your vegetable (e.g. onion or potato) in half.</li>
        <li><strong>Step 2:</strong> Make horizontal cuts into the flat face (without cutting all the way through the root).</li>
        <li><strong>Step 3:</strong> Make vertical slice cuts down across the vegetable.</li>
        <li><strong>Step 4:</strong> Slice across vertically to drop neat cubes (dice).</li>
      </ul>
    `
  },
  julienne: {
    title: "Julienne (Matchstick)",
    content: `
      <p>The julienne cut produces long, thin matchstick strips (approx. 1/8" thick).</p>
      <ul>
        <li><strong>Common uses:</strong> Carrots, bell peppers, cucumbers for salads and slaws.</li>
        <li><strong>Technique:</strong> Square off the sides of the vegetable into a rectangular block. Slice into 1/8-inch thick planks, stack them, and cut into 1/8-inch matchsticks.</li>
      </ul>
    `
  },
  brunoise: {
    title: "Brunoise",
    content: `
      <p>An advanced fine dice (1/8 inch cube) often used for fine sauces, garnishes, and stuffings.</p>
      <ul>
        <li><strong>Technique:</strong> Start with a julienne cut. Gather the matchsticks together and slice across them finely at 1/8-inch intervals to produce tiny, perfect cubes.</li>
      </ul>
    `
  },
  chiffonade: {
    title: "Chiffonade",
    content: `
      <p>Used for leafy greens, herbs (like basil, sage, or mint), and spinach.</p>
      <ul>
        <li><strong>Technique:</strong> Stack several leaves on top of each other. Roll them up tightly like a cigar.</li>
        <li><strong>Cut:</strong> Slice across the roll perpendicularly to create delicate, beautiful ribbon strips.</li>
      </ul>
    `
  }
};

const modal = document.getElementById('info-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function openModal(key) {
  const data = modalData[key];
  if (!data) return;
  modalTitle.textContent = data.title;
  modalBody.innerHTML = data.content;
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

// Quiz Logic
const quizData = [
  {
    question: "Where should you pinch a chef's knife for the best grip and control?",
    options: [
      "At the very end of the handle",
      "Right in front of the bolster on the blade",
      "By wrapping your fingers over the top of the blade spine",
      "By holding the blade edge directly"
    ],
    correct: 1
  },
  {
    question: "How should your non-knife hand protect your fingers while cutting?",
    options: [
      "Pointing straight out toward the blade",
      "Flat on top of the vegetable",
      "Forming a 'claw' with fingertips tucked back and knuckles guiding the blade",
      "Holding the vegetable with your thumb pressed on top"
    ],
    correct: 2
  },
  {
    question: "Which of these cutting surfaces will dull and ruin your knife edge the fastest?",
    options: [
      "End-grain wooden board",
      "Hard plastic board",
      "Glass or marble cutting board",
      "Bamboo board"
    ],
    correct: 2
  },
  {
    question: "What is the term for cutting vegetables into thin matchstick-sized strips (1/8\" x 1/8\" x 2\")?",
    options: [
      "Brunoise",
      "Julienne",
      "Chiffonade",
      "Dice"
    ],
    correct: 1
  },
  {
    question: "What is the correct technique for cutting leafy herbs like basil into ribbons?",
    options: [
      "Chop them randomly with a heavy cleaver",
      "Tear them apart with your bare hands",
      "Stack leaves, roll tightly like a cigar, and slice across",
      "Puree them in a blender"
    ],
    correct: 2
  }
];

let currentQuestion = 0;
let score = 0;

const questionText = document.getElementById('question-text');
const optionsList = document.getElementById('options-list');
const quizResult = document.getElementById('quiz-result');
const questionBox = document.getElementById('question-box');
const resultScore = document.getElementById('result-score');

function loadQuestion() {
  if (currentQuestion >= quizData.length) {
    questionBox.classList.add('hidden');
    quizResult.classList.remove('hidden');
    resultScore.textContent = `You scored ${score} out of ${quizData.length}!`;
    return;
  }

  const q = quizData[currentQuestion];
  questionText.textContent = `Question ${currentQuestion + 1} of ${quizData.length}: ${q.question}`;
  optionsList.innerHTML = '';

  q.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => selectOption(index, btn));
    optionsList.appendChild(btn);
  });
}

function selectOption(selectedIndex, btnElement) {
  const q = quizData[currentQuestion];
  const allBtns = optionsList.querySelectorAll('.option-btn');
  
  allBtns.forEach(b => b.disabled = true);

  if (selectedIndex === q.correct) {
    btnElement.classList.add('correct');
    score++;
  } else {
    btnElement.classList.add('incorrect');
    allBtns[q.correct].classList.add('correct');
  }

  setTimeout(() => {
    currentQuestion++;
    loadQuestion();
  }, 1200);
}

function restartQuiz() {
  currentQuestion = 0;
  score = 0;
  quizResult.classList.add('hidden');
  questionBox.classList.remove('hidden');
  loadQuestion();
}

// Initialize Quiz
loadQuestion();
