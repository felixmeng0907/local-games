(function () {
  'use strict';

  const BOARD_SIZE = 15;
  const EMPTY = -1;
  const BLACK = 0;
  const WHITE = 1;

  const COLORS = {
    bg: '#f7f2e9',
    board: '#e9c891',
    boardEdge: '#c89b64',
    line: '#a97c50',
    black: '#3b3a36',
    white: '#fdfbf5',
    ink: '#4a4038',
    muted: '#8a7f72',
    accent: '#a8c3a0',
    accentDark: '#8aa884',
    win: '#d98e3b'
  };

  const STAR_POINTS = [
    [3, 3], [3, 11], [11, 3], [11, 11], [7, 7]
  ];

  const $ = (id) => document.getElementById(id);
  const lobbyScreen = $('lobby');
  const gameScreen = $('game');
  const gomokuCard = $('gomoku-card');
  const backBtn = $('back-btn');
  const turnLabel = $('turn-label');
  const boardCanvas = $('board');
  const undoBtn = $('undo-btn');
  const restartBtn = $('restart-btn');
  const dialogOverlay = $('dialog-overlay');
  const dialogTitle = $('dialog-title');
  const dialogMessage = $('dialog-message');
  const dialogCancel = $('dialog-cancel');
  const dialogConfirm = $('dialog-confirm');

  const ctx = boardCanvas.getContext('2d');

  const state = {
    board: [],
    history: [],
    current: BLACK,
    over: false,
    winning: [],
    lastMove: null,
    pendingAction: null
  };

  let audioCtx = null;

  function showScreen(name) {
    lobbyScreen.classList.toggle('hidden', name !== 'lobby');
    gameScreen.classList.toggle('hidden', name !== 'game');
  }

  function resetGame() {
    state.board = new Array(BOARD_SIZE * BOARD_SIZE).fill(EMPTY);
    state.history = [];
    state.current = BLACK;
    state.over = false;
    state.winning = [];
    state.lastMove = null;
    updateTurnLabel();
    updateButtons();
    drawBoard();
  }

  function updateTurnLabel() {
    if (state.over) {
      if (state.winning.length === 0) {
        turnLabel.textContent = '平局';
        turnLabel.style.color = COLORS.muted;
      } else {
        const winner = state.current === BLACK ? '黑方' : '白方';
        turnLabel.textContent = '★ ' + winner + '获胜';
        turnLabel.style.color = COLORS.win;
      }
      return;
    }

    turnLabel.style.color = state.current === BLACK ? COLORS.ink : '#6b6258';
    turnLabel.textContent = state.current === BLACK ? '● 黑方回合' : '○ 白方回合';
  }

  function updateButtons() {
    undoBtn.disabled = state.over || state.history.length === 0;
  }

  function openDialog(title, message, confirmText, cancelText, onConfirm, onCancel) {
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogConfirm.textContent = confirmText;
    dialogConfirm.onclick = function () {
      closeDialog();
      if (onConfirm) onConfirm();
    };

    if (cancelText) {
      dialogCancel.textContent = cancelText;
      dialogCancel.classList.remove('hidden');
      dialogCancel.onclick = function () {
        closeDialog();
        if (onCancel) onCancel();
      };
    } else {
      dialogCancel.classList.add('hidden');
    }

    dialogOverlay.classList.remove('hidden');
  }

  function closeDialog() {
    dialogOverlay.classList.add('hidden');
  }

  function playTone(freq, duration, volume) {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration + 0.02);
  }

  function playPlace() {
    playTone(660, 0.08, 0.12);
  }

  function playWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, i) {
      setTimeout(function () {
        playTone(freq, 0.16, 0.14);
      }, i * 110);
    });
  }

  function findWinLine(row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let d = 0; d < directions.length; d++) {
      const [dr, dc] = directions[d];
      const cells = [[row, col]];

      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && state.board[r * BOARD_SIZE + c] === player) {
        cells.push([r, c]);
        r += dr;
        c += dc;
      }

      r = row - dr;
      c = col - dc;
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && state.board[r * BOARD_SIZE + c] === player) {
        cells.unshift([r, c]);
        r -= dr;
        c -= dc;
      }

      if (cells.length >= 5) return cells;
    }
    return [];
  }

  function placeStone(row, col) {
    if (state.over) return;
    const index = row * BOARD_SIZE + col;
    if (state.board[index] !== EMPTY) return;

    state.board[index] = state.current;
    state.history.push([row, col, state.current]);
    state.lastMove = [row, col];

    const line = findWinLine(row, col, state.current);
    if (line.length >= 5) {
      state.over = true;
      state.winning = line;
      playWin();
      updateTurnLabel();
      updateButtons();
      drawBoard();
      const winner = state.current === BLACK ? '黑方' : '白方';
      openDialog(winner + '获胜', '五子连珠，恭喜！', '再来一局', '返回大厅', resetGame, backToLobby);
      return;
    }

    if (state.history.length >= BOARD_SIZE * BOARD_SIZE) {
      state.over = true;
      state.winning = [];
      playWin();
      updateTurnLabel();
      updateButtons();
      drawBoard();
      openDialog('平局', '棋盘已满，本局平局。', '再来一局', '返回大厅', resetGame, backToLobby);
      return;
    }

    state.current = state.current === BLACK ? WHITE : BLACK;
    playPlace();
    updateTurnLabel();
    updateButtons();
    drawBoard();
  }

  function undo() {
    if (state.history.length === 0) return;
    const last = state.history.pop();
    state.board[last[0] * BOARD_SIZE + last[1]] = EMPTY;
    state.current = last[2];
    state.over = false;
    state.winning = [];
    state.lastMove = state.history.length ? state.history[state.history.length - 1].slice(0, 2) : null;
    updateTurnLabel();
    updateButtons();
    drawBoard();
  }

  function confirmRestart() {
    openDialog('重新开始', '当前棋局会清空，确定吗？', '重新开始', '取消', resetGame, null);
  }

  function backToLobby() {
    showScreen('lobby');
  }

  function cellSize() {
    const size = Math.min(boardCanvas.clientWidth, boardCanvas.clientHeight);
    if (!size) return 0;
    return (size - 48) / (BOARD_SIZE - 1);
  }

  function gridOrigin() {
    const cell = cellSize();
    const grid = cell * (BOARD_SIZE - 1);
    return {
      x: (boardCanvas.clientWidth - grid) / 2,
      y: (boardCanvas.clientHeight - grid) / 2,
      cell
    };
  }

  function resizeCanvas() {
    const rect = boardCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    boardCanvas.width = Math.round(rect.width * dpr);
    boardCanvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
  }

  function drawBoard() {
    const width = boardCanvas.clientWidth || boardCanvas.width;
    const height = boardCanvas.clientHeight || boardCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const cell = cellSize();
    if (cell <= 0) return;
    const origin = gridOrigin();
    const margin = 24;
    const side = cell * (BOARD_SIZE - 1) + margin * 2;

    ctx.fillStyle = COLORS.board;
    ctx.fillRect(origin.x - margin, origin.y - margin, side, side);
    ctx.strokeStyle = COLORS.boardEdge;
    ctx.lineWidth = 4;
    ctx.strokeRect(origin.x - margin, origin.y - margin, side, side);

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const offset = cell * i;
      ctx.beginPath();
      ctx.moveTo(origin.x + offset, origin.y);
      ctx.lineTo(origin.x + offset, origin.y + cell * (BOARD_SIZE - 1));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y + offset);
      ctx.lineTo(origin.x + cell * (BOARD_SIZE - 1), origin.y + offset);
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.line;
    STAR_POINTS.forEach(function ([r, c]) {
      ctx.beginPath();
      ctx.arc(origin.x + c * cell, origin.y + r * cell, cell * 0.11, 0, Math.PI * 2);
      ctx.fill();
    });

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const value = state.board[row * BOARD_SIZE + col];
        if (value === EMPTY) continue;
        const x = origin.x + col * cell;
        const y = origin.y + row * cell;
        const isWin = state.winning.some(function ([wr, wc]) {
          return wr === row && wc === col;
        });
        drawStone(x, y, cell, value, isWin);
      }
    }

    if (state.lastMove) {
      const [row, col] = state.lastMove;
      const value = state.board[row * BOARD_SIZE + col];
      if (value !== EMPTY) {
        const x = origin.x + col * cell;
        const y = origin.y + row * cell;
        ctx.fillStyle = value === BLACK ? COLORS.white : COLORS.black;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStone(x, y, cell, player, winning) {
    const radius = cell * 0.44;
    if (winning) {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.48)';
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.22, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.arc(x, y + cell * 0.06, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = player === WHITE ? COLORS.white : COLORS.black;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (player === WHITE) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x - cell * 0.12, y - cell * 0.12, cell * 0.10, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(x - cell * 0.10, y - cell * 0.10, cell * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function posToCell(clientX, clientY) {
    const rect = boardCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cell = cellSize();
    if (cell <= 0) return null;
    const origin = gridOrigin();
    const grid = cell * (BOARD_SIZE - 1);
    const boardRect = {
      left: origin.x - cell * 0.5,
      top: origin.y - cell * 0.5,
      right: origin.x + grid + cell * 0.5,
      bottom: origin.y + grid + cell * 0.5
    };

    if (x < boardRect.left || x > boardRect.right || y < boardRect.top || y > boardRect.bottom) {
      return null;
    }

    const col = Math.round((x - origin.x) / cell);
    const row = Math.round((y - origin.y) / cell);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;

    const nearestX = origin.x + col * cell;
    const nearestY = origin.y + row * cell;
    const distance = Math.hypot(x - nearestX, y - nearestY);
    if (distance > cell * 0.45) return null;

    return [row, col];
  }

  function onBoardPointerDown(event) {
    event.preventDefault();
    const cell = posToCell(event.clientX, event.clientY);
    if (cell) placeStone(cell[0], cell[1]);
  }

  gomokuCard.addEventListener('click', function () {
    resetGame();
    showScreen('game');
    resizeCanvas();
  });

  backBtn.addEventListener('click', backToLobby);
  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', confirmRestart);
  boardCanvas.addEventListener('pointerdown', onBoardPointerDown);
  window.addEventListener('resize', resizeCanvas);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  resetGame();
  showScreen('lobby');
})();
