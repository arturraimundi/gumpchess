const symbols = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const initialBoard = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null], [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null], [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

const bots = {
  bot01: { name: 'BOT_01', level: 'FÁCIL', depth: 0, description: 'Ideal para começar. Escolhe lances livres.', avatar: 'icon/icon.jpg' },
  tactician: { name: 'TACTICIAN', level: 'DIFÍCIL', depth: 3, description: 'Procura táticas e calcula até 3 jogadas.', avatar: null },
  oracle: { name: 'ORACLE', level: 'MESTRE', depth: 5, description: 'Calcula até 5 jogadas. Encontre uma brecha.', avatar: null },
};

let boardState;
let selectedSquare;
let turn;
let history;
let captured;
let gameOver;
let currentBot;
let botTimer;
const boardElement = document.querySelector('#board');
const isWhite = piece => piece && piece === piece.toUpperCase();
const colorOf = piece => isWhite(piece) ? 'white' : 'black';
const cloneBoard = board => board.map(row => [...row]);
const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

function getBotOfTheDay() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((new Date() - start) / 86400000);
  return Object.keys(bots)[day % Object.keys(bots).length];
}

function renderBotOptions() {
  const options = document.querySelector('#bot-options');
  options.innerHTML = Object.entries(bots).map(([id, bot]) => `<button class="bot-option" type="button" role="option" data-bot-id="${id}" aria-selected="false"><span class="bot-option-name">${bot.name}</span><span class="bot-option-level">${bot.level}${bot.depth ? ` · ${bot.depth} PLY` : ''}</span></button>`).join('');
  options.querySelectorAll('[data-bot-id]').forEach(option => option.addEventListener('click', () => startWithBot(option.dataset.botId)));
}

function selectBot(botId) {
  currentBot = botId;
  const bot = bots[botId];
  document.querySelector('#bot-name').textContent = bot.name;
  document.querySelector('#bot-meta').textContent = `ADVERSÁRIO · PRETO · ${bot.level}`;
  document.querySelector('#bot-description').textContent = bot.description;
  document.querySelector('#daily-label').textContent = botId === getBotOfTheDay() ? 'BOT DO DIA' : 'OPONENTE';
  const avatar = document.querySelector('#bot-avatar');
  const avatarBox = avatar.parentElement;
  avatar.alt = `Avatar de ${bot.name}`;
  avatarBox.dataset.initial = bot.name.slice(0, 3);
  avatarBox.classList.toggle('placeholder', !bot.avatar);
  avatar.style.display = bot.avatar ? 'block' : 'none';
  if (bot.avatar) avatar.src = bot.avatar;
  document.querySelectorAll('[data-bot-id]').forEach(option => {
    const active = option.dataset.botId === botId;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', active);
  });
}

function startWithBot(botId) { selectBot(botId); newGame(); }

function findKing(board, white) {
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) if (board[row][col] === (white ? 'K' : 'k')) return [row, col];
  return null;
}

function pseudoMoves(board, row, col, attacksOnly = false) {
  const piece = board[row][col];
  if (!piece) return [];
  const white = isWhite(piece), type = piece.toLowerCase(), moves = [];
  const add = (targetRow, targetCol) => {
    if (!inBounds(targetRow, targetCol)) return false;
    const target = board[targetRow][targetCol];
    if (!target) { moves.push([targetRow, targetCol]); return true; }
    if (colorOf(target) !== colorOf(piece) && target.toLowerCase() !== 'k') moves.push([targetRow, targetCol]);
    return false;
  };
  if (type === 'p') {
    const direction = white ? -1 : 1, start = white ? 6 : 1;
    if (attacksOnly) [-1, 1].forEach(delta => { if (inBounds(row + direction, col + delta)) moves.push([row + direction, col + delta]); });
    else if (inBounds(row + direction, col) && !board[row + direction][col]) {
      moves.push([row + direction, col]);
      if (row === start && !board[row + direction * 2][col]) moves.push([row + direction * 2, col]);
    }
    [-1, 1].forEach(delta => { const targetRow = row + direction, targetCol = col + delta; if (inBounds(targetRow, targetCol) && board[targetRow][targetCol] && colorOf(board[targetRow][targetCol]) !== colorOf(piece) && board[targetRow][targetCol].toLowerCase() !== 'k') moves.push([targetRow, targetCol]); });
    return moves;
  }
  const steps = type === 'n' ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] : type === 'k' ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : null;
  if (steps) { steps.forEach(([rowDelta, colDelta]) => add(row + rowDelta, col + colDelta)); return moves; }
  const rays = type === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : type === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  rays.forEach(([rowDelta, colDelta]) => { let targetRow = row + rowDelta, targetCol = col + colDelta; while (inBounds(targetRow, targetCol)) { if (!add(targetRow, targetCol)) break; targetRow += rowDelta; targetCol += colDelta; } });
  return moves;
}

function isAttacked(board, row, col, byWhite) {
  for (let sourceRow = 0; sourceRow < 8; sourceRow += 1) for (let sourceCol = 0; sourceCol < 8; sourceCol += 1) if (board[sourceRow][sourceCol] && isWhite(board[sourceRow][sourceCol]) === byWhite && pseudoMoves(board, sourceRow, sourceCol, true).some(([targetRow, targetCol]) => targetRow === row && targetCol === col)) return true;
  return false;
}
function inCheck(board, white) { const king = findKing(board, white); return king ? isAttacked(board, king[0], king[1], !white) : true; }
function applyMove(board, move) {
  const next = cloneBoard(board), piece = next[move.from[0]][move.from[1]];
  next[move.to[0]][move.to[1]] = piece; next[move.from[0]][move.from[1]] = null;
  if (piece.toLowerCase() === 'p' && (move.to[0] === 0 || move.to[0] === 7)) next[move.to[0]][move.to[1]] = isWhite(piece) ? 'Q' : 'q';
  return next;
}
function legalMoves(board, white) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) if (board[row][col] && isWhite(board[row][col]) === white) pseudoMoves(board, row, col).forEach(([targetRow, targetCol]) => {
    const move = { from: [row, col], to: [targetRow, targetCol], piece: board[row][col], captured: board[targetRow][targetCol] };
    if (!inCheck(applyMove(board, move), white)) moves.push(move);
  });
  return moves;
}

function movePriority(move) { return move.captured ? values[move.captured.toLowerCase()] : 0; }
function orderedMoves(moves) { return [...moves].sort((a, b) => movePriority(b) - movePriority(a)); }
function evaluate(board) {
  let score = 0;
  board.forEach((row, rowIndex) => row.forEach((piece, colIndex) => {
    if (!piece) return;
    const center = rowIndex >= 2 && rowIndex <= 5 && colIndex >= 2 && colIndex <= 5 ? 4 : 0;
    score += isWhite(piece) ? -values[piece.toLowerCase()] - center : values[piece.toLowerCase()] + center;
  }));
  return score;
}
function search(board, depth, blackToMove, alpha, beta) {
  const moves = legalMoves(board, !blackToMove);
  if (!moves.length) return inCheck(board, !blackToMove) ? (blackToMove ? -100000 - depth : 100000 + depth) : 0;
  if (depth === 0) return evaluate(board);
  if (blackToMove) {
    let best = -Infinity;
    for (const move of orderedMoves(moves)) { best = Math.max(best, search(applyMove(board, move), depth - 1, false, alpha, beta)); alpha = Math.max(alpha, best); if (beta <= alpha) break; }
    return best;
  }
  let best = Infinity;
  for (const move of orderedMoves(moves)) { best = Math.min(best, search(applyMove(board, move), depth - 1, true, alpha, beta)); beta = Math.min(beta, best); if (beta <= alpha) break; }
  return best;
}
function findBestMove(board, moves, depth) {
  let bestMove = moves[0], bestScore = -Infinity, alpha = -Infinity;
  for (const move of orderedMoves(moves)) { const score = search(applyMove(board, move), depth - 1, false, alpha, Infinity); if (score > bestScore) { bestScore = score; bestMove = move; } alpha = Math.max(alpha, bestScore); }
  return bestMove;
}

function render() {
  boardElement.innerHTML = '';
  const legal = selectedSquare ? legalMoves(boardState, true).filter(move => move.from[0] === selectedSquare[0] && move.from[1] === selectedSquare[1]) : [];
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) {
    const square = document.createElement('div'), piece = boardState[row][col];
    square.className = `square ${(row + col) % 2 ? 'dark' : 'light'}`; square.dataset.row = row; square.dataset.col = col; square.setAttribute('role', 'gridcell');
    if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) square.classList.add('selected');
    if (legal.some(move => move.to[0] === row && move.to[1] === col)) square.classList.add(piece ? 'capture' : 'legal');
    if (piece) { const element = document.createElement('span'); element.className = `piece ${isWhite(piece) ? 'white' : 'black'}`; element.textContent = symbols[piece]; square.append(element); }
    square.addEventListener('click', handleSquare); boardElement.append(square);
  }
}
function handleSquare(event) {
  if (gameOver || turn !== 'white') return;
  const row = +event.currentTarget.dataset.row, col = +event.currentTarget.dataset.col, piece = boardState[row][col];
  if (piece && isWhite(piece)) { selectedSquare = [row, col]; render(); return; }
  if (!selectedSquare) return;
  const move = legalMoves(boardState, true).find(item => item.from[0] === selectedSquare[0] && item.from[1] === selectedSquare[1] && item.to[0] === row && item.to[1] === col);
  if (move) makeMove(move); else { selectedSquare = null; render(); }
}
function addNotation(move) { document.querySelector('#move-list .notation-empty')?.remove(); const item = document.createElement('li'); item.innerHTML = `<span>${document.querySelectorAll('#move-list li').length + 1}</span>${move.piece.toLowerCase() === 'p' ? '' : move.piece.toUpperCase()}${move.captured ? 'x' : ''}${String.fromCharCode(97 + move.to[1])}${8 - move.to[0]}`; document.querySelector('#move-list').append(item); }
function getNotation() { return [...document.querySelectorAll('#move-list li')].map(item => item.innerHTML); }
function makeMove(move, record = true) {
  if (record) history.push({ board: cloneBoard(boardState), captured: [...captured], notation: getNotation() });
  if (move.captured) captured.push(move.captured);
  boardState = applyMove(boardState, move); selectedSquare = null; turn = turn === 'white' ? 'black' : 'white'; addNotation(move); render(); updatePanel(); checkGameState();
  if (turn === 'black' && !gameOver) { document.querySelector('#bot-thinking span').textContent = 'PENSANDO'; botTimer = setTimeout(botMove, 500); }
}
function botMove() {
  const moves = legalMoves(boardState, false); if (!moves.length) return;
  const bot = bots[currentBot]; const move = bot.depth === 0 ? moves[Math.floor(Math.random() * moves.length)] : findBestMove(boardState, moves, bot.depth);
  makeMove(move); document.querySelector('#bot-thinking span').textContent = 'AGUARDANDO';
}
function checkGameState() {
  const moves = legalMoves(boardState, turn === 'white'), checked = inCheck(boardState, turn === 'white');
  const status = document.querySelector('#game-status'), detail = document.querySelector('#status-detail');
  if (!moves.length) { gameOver = true; status.textContent = checked ? (turn === 'white' ? 'Xeque-mate' : 'Você venceu!') : 'Empate'; detail.textContent = checked ? (turn === 'white' ? `${bots[currentBot].name} fechou o jogo.` : 'O rei do bot não tem saída.') : 'Nenhum jogador pode avançar.'; return; }
  status.textContent = checked ? 'Xeque' : turn === 'white' ? 'Sua vez de jogar' : 'Bot está jogando';
  detail.textContent = checked ? (turn === 'white' ? 'Seu rei está ameaçado.' : 'O rei do bot está ameaçado.') : turn === 'white' ? 'Escolha uma peça branca para começar.' : `${bots[currentBot].name} está calculando o próximo lance.`;
}
function updatePanel() {
  document.querySelector('#move-counter').textContent = `MOV ${String(Math.ceil(document.querySelectorAll('#move-list li:not(.notation-empty)').length / 2) + 1).padStart(2, '0')}`;
  document.querySelector('#capture-count').textContent = captured.length;
  document.querySelector('#captured-pieces').innerHTML = captured.length ? captured.map(piece => `<span class="piece ${isWhite(piece) ? 'white' : 'black'}">${symbols[piece]}</span>`).join('') : '<span class="empty-capture">—</span>';
  document.querySelector('#turn-state').innerHTML = turn === 'white' ? '<span class="turn-dot"></span>SUA VEZ' : '<span class="turn-dot"></span>BOT';
}
function newGame() {
  clearTimeout(botTimer); boardState = cloneBoard(initialBoard); selectedSquare = null; turn = 'white'; history = []; captured = []; gameOver = false;
  document.querySelector('#move-list').innerHTML = '<li class="notation-empty">A partida ainda não começou</li>'; render(); updatePanel(); checkGameState();
}

document.querySelector('#daily-bot').addEventListener('click', () => startWithBot(getBotOfTheDay()));
document.querySelector('#new-game').addEventListener('click', newGame);
document.querySelector('#resign').addEventListener('click', () => { if (!gameOver) { gameOver = true; document.querySelector('#game-status').textContent = 'Partida encerrada'; document.querySelector('#status-detail').textContent = 'Você abandonou esta partida.'; } });
document.querySelector('#undo-move').addEventListener('click', () => {
  if (!history.length || gameOver) return;
  const previous = history[history.length - (turn === 'white' ? 1 : 2)]; if (!previous) return;
  history = history.slice(0, history.indexOf(previous)); boardState = cloneBoard(previous.board); captured = [...previous.captured];
  document.querySelector('#move-list').innerHTML = previous.notation.length ? previous.notation.map(html => `<li>${html}</li>`).join('') : '<li class="notation-empty">A partida ainda não começou</li>';
  turn = 'white'; render(); updatePanel(); checkGameState();
});

renderBotOptions(); selectBot(getBotOfTheDay()); newGame();
