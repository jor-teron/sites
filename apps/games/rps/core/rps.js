/* Rock Paper Scissors RPS1 — logic. */
window.RPS = window.RPS || {};

RPS.CHOICES = [
  { id: 'rock', emoji: '✊', name: 'Rock' },
  { id: 'paper', emoji: '✋', name: 'Paper' },
  { id: 'scissors', emoji: '✌️', name: 'Scissors' }
];

RPS.beats = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper'
};

RPS.play = function (player) {
  var cpu = RPS.CHOICES[Math.floor(Math.random() * 3)].id;
  var result;
  if (player === cpu) result = 'draw';
  else if (RPS.beats[player] === cpu) result = 'win';
  else result = 'lose';
  return { player: player, cpu: cpu, result: result };
};
