(function () {
  'use strict';

  /* ============================ 共享工具 ============================ */
  const $ = (id) => document.getElementById(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  let audioCtx = null;
  function tone(freq, duration, volume) {
    try {
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
    } catch (e) {}
  }
  const playPlace = () => tone(660, 0.08, 0.12);
  const playTap = () => tone(440, 0.06, 0.08);
  const playWin = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.14), i * 110));
  const playLose = () => tone(220, 0.22, 0.12);

  function makeCanvas(cls) {
    const c = document.createElement('canvas');
    c.className = cls || 'board';
    return c;
  }

  // 为 canvas 绑定 DPR 自适应，返回 { ctx, resize, destroy }
  function canvasGame(canvas, drawFn) {
    const ctx = canvas.getContext('2d');
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFn();
    }
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
    return { ctx, resize, destroy: () => window.removeEventListener('resize', resize) };
  }

  function squareFromEvent(canvas, n, evt) {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const cell = Math.min(rect.width, rect.height) / n;
    const offsetX = (rect.width - cell * n) / 2;
    const offsetY = (rect.height - cell * n) / 2;
    const c = Math.floor((x - offsetX) / cell);
    const r = Math.floor((y - offsetY) / cell);
    if (r < 0 || r >= n || c < 0 || c >= n) return null;
    return { r, c };
  }

  /* ============================ 外壳 ============================ */
  const games = [];
  let currentGame = null;

  function showScreen(name) {
    $('lobby').classList.toggle('hidden', name !== 'lobby');
    $('game').classList.toggle('hidden', name !== 'game');
  }

  function renderLobby(filter) {
    const list = $('game-list');
    list.innerHTML = '';
    games
      .filter((g) => filter === 'all' || g.mode === filter)
      .forEach((g) => {
        const card = el('button', 'game-card');
        card.type = 'button';
        const top = el('div', 'game-card-top');
        top.appendChild(el('span', 'game-icon', g.icon));
        top.appendChild(el('span', 'game-tag ' + g.mode, g.mode === 'duo' ? '双人' : '单人'));
        card.appendChild(top);
        card.appendChild(el('span', 'game-name', g.name));
        card.appendChild(el('span', 'game-sub', g.sub));
        card.addEventListener('click', () => enterGame(g.id));
        list.appendChild(card);
      });
  }

  function enterGame(id) {
    const def = games.find((g) => g.id === id);
    if (!def) return;
    $('game-title').textContent = def.name;
    showScreen('game');
    const host = $('game-body');
    host.innerHTML = '';
    try {
      currentGame = def.build(host) || {};
    } catch (e) {
      currentGame = null;
      host.appendChild(el('div', 'status-line', '游戏加载失败'));
    }
  }

  function exitGame() {
    if (currentGame && typeof currentGame.destroy === 'function') {
      try { currentGame.destroy(); } catch (e) {}
    }
    currentGame = null;
    $('game-body').innerHTML = '';
    showScreen('lobby');
  }

  function dialog(title, message, opts) {
    opts = opts || {};
    $('dialog-title').textContent = title;
    $('dialog-message').textContent = message;
    const confirm = $('dialog-confirm');
    const cancel = $('dialog-cancel');
    confirm.textContent = opts.confirm || '确定';
    confirm.onclick = () => { closeDialog(); opts.onConfirm && opts.onConfirm(); };
    if (opts.cancel) {
      cancel.textContent = opts.cancel;
      cancel.classList.remove('hidden');
      cancel.onclick = () => { closeDialog(); opts.onCancel && opts.onCancel(); };
    } else {
      cancel.classList.add('hidden');
    }
    $('dialog-overlay').classList.remove('hidden');
  }

  function closeDialog() {
    $('dialog-overlay').classList.add('hidden');
  }

  $('back-btn').addEventListener('click', exitGame);
  $('dialog-overlay').addEventListener('click', (e) => {
    if (e.target === $('dialog-overlay')) closeDialog();
  });
  $('lobby-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    $('lobby-tabs').querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    renderLobby(btn.dataset.tab);
  });

  const Hub = {
    register(def) { games.push(def); },
    el, makeCanvas, canvasGame, squareFromEvent, dialog, closeDialog,
    playPlace, playTap, playWin, playLose, tone
  };

  /* ============================ 1. 五子棋 ============================ */
  Hub.register({
    id: 'gomoku', name: '五子棋', icon: '●', mode: 'duo', sub: '同屏双人 · 15×15',
    build(host) {
      const N = 15, EMPTY = -1, BLACK = 0, WHITE = 1;
      const C = { bg: '#e9c891', edge: '#c89b64', line: '#a97c50', black: '#3b3a36', white: '#fdfbf5', win: '#d98e3b' };
      const state = { board: [], history: [], cur: BLACK, over: false, winning: [], last: null };
      const status = el('div', 'status-line'); host.appendChild(status);
      const wrap = el('div', 'board-wrap');
      const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      const actions = el('div', 'actions');
      const undoBtn = el('button', 'btn', '悔棋');
      const restartBtn = el('button', 'btn primary', '重新开始');
      actions.append(undoBtn, restartBtn); host.appendChild(actions);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);
      function reset() {
        state.board = new Array(N * N).fill(EMPTY);
        state.history = []; state.cur = BLACK; state.over = false; state.winning = []; state.last = null;
        update(); draw();
      }
      function update() {
        if (state.over) {
          status.textContent = state.winning.length === 0 ? '平局' : ('★ ' + (state.cur === BLACK ? '黑方' : '白方') + '获胜');
          status.style.color = state.winning.length === 0 ? '#8a7f72' : C.win;
        } else {
          status.textContent = state.cur === BLACK ? '● 黑方回合' : '○ 白方回合';
          status.style.color = '#4a4038';
        }
        undoBtn.disabled = state.over || state.history.length === 0;
      }
      function winLine(r, c, p) {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dr, dc] of dirs) {
          const cells = [[r, c]];
          for (let s = 1; s < 5; s++) {
            const rr = r + dr * s, cc = c + dc * s;
            if (rr < 0 || rr >= N || cc < 0 || cc >= N || state.board[rr * N + cc] !== p) break;
            cells.push([rr, cc]);
          }
          for (let s = 1; s < 5; s++) {
            const rr = r - dr * s, cc = c - dc * s;
            if (rr < 0 || rr >= N || cc < 0 || cc >= N || state.board[rr * N + cc] !== p) break;
            cells.unshift([rr, cc]);
          }
          if (cells.length >= 5) return cells;
        }
        return [];
      }
      function place(r, c) {
        if (state.over) return;
        const idx = r * N + c;
        if (state.board[idx] !== EMPTY) return;
        state.board[idx] = state.cur;
        state.history.push([r, c, state.cur]);
        state.last = [r, c];
        const line = winLine(r, c, state.cur);
        if (line.length >= 5) {
          state.over = true; state.winning = line; playWin(); update(); draw();
          const w = state.cur === BLACK ? '黑方' : '白方';
          dialog(w + '获胜', '五子连珠，恭喜！', { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
          return;
        }
        if (state.history.length >= N * N) {
          state.over = true; state.winning = []; playWin(); update(); draw();
          dialog('平局', '棋盘已满，本局平局。', { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
          return;
        }
        state.cur = state.cur === BLACK ? WHITE : BLACK;
        playPlace(); update(); draw();
      }
      function undo() {
        if (!state.history.length) return;
        const last = state.history.pop();
        state.board[last[0] * N + last[1]] = EMPTY;
        state.cur = last[2]; state.over = false; state.winning = [];
        state.last = state.history.length ? state.history[state.history.length - 1].slice(0, 2) : null;
        update(); draw();
      }
      function cellSize() {
        const s = Math.min(canvas.clientWidth, canvas.clientHeight);
        return s ? (s - 48) / (N - 1) : 0;
      }
      function origin() {
        const cell = cellSize(), grid = cell * (N - 1);
        return { x: (canvas.clientWidth - grid) / 2, y: (canvas.clientHeight - grid) / 2, cell };
      }
      function draw() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const cell = cellSize(); if (cell <= 0) return;
        const o = origin(), margin = 24, side = cell * (N - 1) + margin * 2;
        ctx.fillStyle = C.bg; ctx.fillRect(o.x - margin, o.y - margin, side, side);
        ctx.strokeStyle = C.edge; ctx.lineWidth = 4; ctx.strokeRect(o.x - margin, o.y - margin, side, side);
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.2;
        for (let i = 0; i < N; i++) {
          ctx.beginPath(); ctx.moveTo(o.x + cell * i, o.y); ctx.lineTo(o.x + cell * i, o.y + cell * (N - 1)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(o.x, o.y + cell * i); ctx.lineTo(o.x + cell * (N - 1), o.y + cell * i); ctx.stroke();
        }
        ctx.fillStyle = C.line;
        [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([r, c]) => {
          ctx.beginPath(); ctx.arc(o.x + c * cell, o.y + r * cell, cell * 0.11, 0, Math.PI * 2); ctx.fill();
        });
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const v = state.board[r * N + c]; if (v === EMPTY) continue;
          const isWin = state.winning.some(([wr, wc]) => wr === r && wc === c);
          drawStone(o.x + c * cell, o.y + r * cell, cell, v, isWin);
        }
        if (state.last) {
          const [r, c] = state.last; const v = state.board[r * N + c];
          if (v !== EMPTY) {
            ctx.fillStyle = v === BLACK ? C.white : C.black;
            ctx.beginPath(); ctx.arc(o.x + c * cell, o.y + r * cell, cell * 0.10, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      function drawStone(x, y, cell, p, win) {
        const rad = cell * 0.44;
        if (win) { ctx.fillStyle = 'rgba(255,209,102,0.5)'; ctx.beginPath(); ctx.arc(x, y, rad * 1.22, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.arc(x, y + cell * 0.06, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p === WHITE ? C.white : C.black; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      }
      function pointer(evt) {
        evt.preventDefault();
        const cell = cellSize(); if (cell <= 0) return;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
        const o = origin(), grid = cell * (N - 1);
        const c = Math.round((x - o.x) / cell), r = Math.round((y - o.y) / cell);
        if (r < 0 || r >= N || c < 0 || c >= N) return;
        if (Math.hypot(x - (o.x + c * cell), y - (o.y + r * cell)) > cell * 0.45) return;
        place(r, c);
      }
      canvas.addEventListener('pointerdown', pointer);
      undoBtn.addEventListener('click', undo);
      restartBtn.addEventListener('click', () => dialog('重新开始', '当前棋局会清空，确定吗？', { confirm: '重新开始', cancel: '取消', onConfirm: reset }));
      reset();
      return { destroy() { destroy(); canvas.removeEventListener('pointerdown', pointer); } };
    }
  });

  /* ============================ 2. 井字棋 ============================ */
  Hub.register({
    id: 'tictactoe', name: '井字棋', icon: '＃', mode: 'duo', sub: '同屏双人 · 3×3',
    build(host) {
      const status = el('div', 'status-line'); host.appendChild(status);
      const panel = el('div', 'panel'); host.appendChild(panel);
      const grid = el('div', 'grid ttt'); panel.appendChild(grid);
      const cells = [];
      let board = Array(9).fill(null), turn = 'X', over = false, winCells = [];
      for (let i = 0; i < 9; i++) {
        const c = el('button', 'cell'); c.type = 'button'; grid.appendChild(c); cells.push(c);
        c.addEventListener('click', () => move(i));
      }
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); panel.appendChild(actions);
      restart.addEventListener('click', reset);
      function reset() { board = Array(9).fill(null); turn = 'X'; over = false; winCells = []; cells.forEach((c) => { c.textContent = ''; c.classList.remove('win'); }); update(); }
      function update() {
        if (over) {
          status.textContent = winCells.length ? ('★ ' + (turn === 'X' ? '先手' : '后手') + '获胜') : '平局';
          status.style.color = winCells.length ? '#d98e3b' : '#8a7f72';
        } else { status.textContent = (turn === 'X' ? 'Ｘ 先手回合' : 'Ｏ 后手回合'); status.style.color = '#4a4038'; }
      }
      function winLine() {
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (const l of lines) if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]) return l;
        return null;
      }
      function move(i) {
        if (over || board[i]) return;
        board[i] = turn; cells[i].textContent = turn;
        const w = winLine();
        if (w) { over = true; winCells = w; w.forEach((j) => cells[j].classList.add('win')); playWin(); update(); }
        else if (board.every(Boolean)) { over = true; playLose(); update(); }
        else { turn = turn === 'X' ? 'O' : 'X'; playTap(); update(); }
      }
      reset();
      return { destroy() {} };
    }
  });

  /* ============================ 3. 黑白棋 ============================ */
  Hub.register({
    id: 'othello', name: '黑白棋', icon: '◐', mode: 'duo', sub: '同屏双人 · 8×8 翻转',
    build(host) {
      const N = 8, EMPTY = -1, BLACK = 0, WHITE = 1;
      const state = { board: [], cur: BLACK, over: false };
      const status = el('div', 'status-line'); host.appendChild(status);
      const wrap = el('div', 'board-wrap'); const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); host.appendChild(actions); restart.addEventListener('click', reset);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);
      function reset() {
        state.board = Array.from({ length: N }, () => Array(N).fill(EMPTY));
        state.board[3][3] = WHITE; state.board[4][4] = WHITE; state.board[3][4] = BLACK; state.board[4][3] = BLACK;
        state.cur = BLACK; state.over = false; update(); draw();
      }
      function flips(r, c, p) {
        if (state.board[r][c] !== EMPTY) return [];
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        let out = [];
        for (const [dr, dc] of dirs) {
          const line = []; let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < N && cc >= 0 && cc < N && state.board[rr][cc] === 1 - p) { line.push([rr, cc]); rr += dr; cc += dc; }
          if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && state.board[rr][cc] === p) out = out.concat(line);
        }
        return out;
      }
      function movesFor(p) {
        const m = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (flips(r, c, p).length) m.push([r, c]);
        return m;
      }
      function place(r, c) {
        const f = flips(r, c, state.cur); if (!f.length) return;
        state.board[r][c] = state.cur; f.forEach(([rr, cc]) => state.board[rr][cc] = state.cur);
        state.cur = 1 - state.cur;
        if (!movesFor(state.cur).length) {
          state.cur = 1 - state.cur;
          if (!movesFor(state.cur).length) { state.over = true; playWin(); }
        } else playPlace();
        update(); draw();
        if (state.over) {
          let b = 0, w = 0; state.board.forEach(row => row.forEach(v => { if (v === BLACK) b++; if (v === WHITE) w++; }));
          dialog(b > w ? '黑方获胜' : (w > b ? '白方获胜' : '平局'), '黑 ' + b + '  :  白 ' + w, { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
        }
      }
      function update() {
        let b = 0, w = 0; state.board.forEach(row => row.forEach(v => { if (v === BLACK) b++; if (v === WHITE) w++; }));
        if (state.over) status.textContent = '终局 · 黑 ' + b + ' : 白 ' + w;
        else status.textContent = (state.cur === BLACK ? '● 黑方' : '○ 白方') + '回合 · 黑 ' + b + ' : 白 ' + w;
      }
      function draw() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const side = Math.min(w, h); const cell = side / N;
        const ox = (w - side) / 2, oy = (h - side) / 2;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#a8c3a0' : '#eaf1e6';
          ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
        }
        const valid = state.over ? [] : movesFor(state.cur);
        valid.forEach(([r, c]) => {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.arc(ox + c * cell + cell / 2, oy + r * cell + cell / 2, cell * 0.14, 0, Math.PI * 2); ctx.fill();
        });
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const v = state.board[r][c]; if (v === EMPTY) continue;
          const x = ox + c * cell + cell / 2, y = oy + r * cell + cell / 2;
          ctx.fillStyle = v === BLACK ? '#3b3a36' : '#fdfbf5';
          ctx.beginPath(); ctx.arc(x, y, cell * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      function pointer(evt) {
        evt.preventDefault();
        const sq = squareFromEvent(canvas, N, evt); if (sq) place(sq.r, sq.c);
      }
      canvas.addEventListener('pointerdown', pointer);
      reset();
      return { destroy() { destroy(); canvas.removeEventListener('pointerdown', pointer); } };
    }
  });

  /* ============================ 4. 中国跳棋 ============================ */
  Hub.register({
    id: 'chinesecheckers', name: '中国跳棋', icon: '✳', mode: 'duo', sub: '同屏双人 · 跳到对方营地',
    build(host) {
      const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
      const status = el('div', 'status-line'); host.appendChild(status);
      const note = el('div', 'controls-note', '点击自己的棋子选中，再点亮起的位置移动（可连跳，不吞子）。先把全部棋子走到对面营地者胜。');
      const wrap = el('div', 'board-wrap'); const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      host.appendChild(note);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); host.appendChild(actions); restart.addEventListener('click', reset);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);

      const key = (x, y, z) => x + ',' + y + ',' + z;
      const add = (c, d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      const boardSet = new Set();
      const START = { 0: [], 1: [] };
      const GOAL = { 0: [], 1: [] };

      function buildBoard() {
        boardSet.clear(); START[0].length = 0; START[1].length = 0; GOAL[0].length = 0; GOAL[1].length = 0;
        for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) {
          const z = -x - y;
          if (Math.abs(z) <= 4) boardSet.add(key(x, y, z));
        }
        const pts = [
          ['x', 5, 8, -4, 0], ['x', -8, -5, 0, 4],
          ['y', 5, 8, -4, 0], ['y', -8, -5, 0, 4],
          ['z', 5, 8, -4, 0], ['z', -8, -5, 0, 4]
        ];
        pts.forEach(([axis, a, b, lo, hi]) => {
          for (let v = a; v <= b; v++) {
            for (let o1 = lo; o1 <= hi; o1++) {
              const o2 = -v - o1;
              if (o2 < lo || o2 > hi) continue;
              let x, y, z;
              if (axis === 'x') { x = v; y = o1; z = o2; }
              else if (axis === 'y') { y = v; x = o1; z = o2; }
              else { z = v; x = o1; y = o2; }
              const k = key(x, y, z);
              boardSet.add(k);
              if (axis === 'x') {
                if (a === 5) { START[1].push(k); GOAL[0].push(k); }
                else { START[0].push(k); GOAL[1].push(k); }
              }
            }
          }
        });
      }

      let pieces = {}, cur = 0, sel = null, steps = [], jumps = [], over = false, layout = [];
      const toCell = (k) => k.split(',').map(Number);
      const isEmpty = (k) => pieces[k] === undefined;

      function reset() {
        pieces = {};
        buildBoard();
        START[0].forEach((k) => { pieces[k] = 0; });
        START[1].forEach((k) => { pieces[k] = 1; });
        cur = 0; sel = null; steps = []; jumps = []; over = false;
        update(); draw();
      }

      function stepsFor(cell) {
        return DIRS.map((d) => add(cell, d))
          .map((n) => key(n[0], n[1], n[2]))
          .filter((k) => boardSet.has(k) && isEmpty(k));
      }

      function jumpsFor(cell) {
        const results = [];
        function dfs(pos, path, visited) {
          let jumped = false;
          for (const d of DIRS) {
            const over = add(pos, d), land = add(over, d);
            const ok = key(over[0], over[1], over[2]), lk = key(land[0], land[1], land[2]);
            if (boardSet.has(ok) && !isEmpty(ok) && boardSet.has(lk) && isEmpty(lk) && !visited.has(lk)) {
              jumped = true;
              const nv = new Set(visited); nv.add(lk);
              dfs(land, path.concat([lk]), nv);
            }
          }
          if (!jumped && path.length) results.push(path);
        }
        dfs(cell, [], new Set([key(cell[0], cell[1], cell[2])]));
        return results;
      }

      function inGoal(p, k) {
        const x = toCell(k)[0];
        return p === 0 ? (x >= 5 && x <= 8) : (x <= -5 && x >= -8);
      }

      function won(p) {
        return Object.keys(pieces).filter((k) => pieces[k] === p).every((k) => inGoal(p, k));
      }

      function select(cell) {
        const k = key(cell[0], cell[1], cell[2]);
        if (pieces[k] === cur) {
          sel = cell; steps = stepsFor(cell); jumps = jumpsFor(cell);
        } else { sel = null; steps = []; jumps = []; }
        draw();
      }

      function moveTo(targetKey) {
        if (!sel) return;
        const sk = key(sel[0], sel[1], sel[2]);
        if (steps.indexOf(targetKey) >= 0) {
          delete pieces[sk]; pieces[targetKey] = cur;
        } else {
          const j = jumps.find((path) => path[path.length - 1] === targetKey);
          if (!j) return;
          delete pieces[sk]; pieces[targetKey] = cur;
        }
        sel = null; steps = []; jumps = [];
        if (won(cur)) {
          over = true; playWin(); update(); draw();
          dialog((cur === 0 ? '红方' : '蓝方') + '获胜', '全部棋子到达对面营地，恭喜！', { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
          return;
        }
        cur = 1 - cur; playTap(); update(); draw();
      }

      function update() {
        status.textContent = over ? '对局结束' : ((cur === 0 ? '● 红方' : '○ 蓝方') + '回合 · 把棋子走到对面营地');
      }

      function computeLayout() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        const raw = [];
        boardSet.forEach((k) => {
          const c = toCell(k);
          const px = Math.sqrt(3) * (c[0] + c[2] / 2);
          const py = 1.5 * c[2];
          raw.push({ k, c, px, py });
        });
        const xs = raw.map((o) => o.px), ys = raw.map((o) => o.py);
        const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        const bw = maxX - minX || 1, bh = maxY - minY || 1;
        const PAD = 24;
        const scale = Math.min((w - PAD * 2) / bw, (h - PAD * 2) / bh);
        const ox = (w - bw * scale) / 2 - minX * scale;
        const oy = (h - bh * scale) / 2 - minY * scale;
        layout = raw.map((o) => ({ k: o.k, x: o.px * scale + ox, y: o.py * scale + oy, r: scale * 0.42 }));
      }

      function draw() {
        computeLayout();
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const pos = {};
        layout.forEach((o) => { pos[o.k] = o; });
        layout.forEach((o) => {
          ctx.fillStyle = '#d8c49a';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#a97c50'; ctx.lineWidth = 1; ctx.stroke();
        });
        const selKey = sel ? key(sel[0], sel[1], sel[2]) : null;
        if (selKey && pos[selKey]) {
          ctx.strokeStyle = '#d98e3b'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(pos[selKey].x, pos[selKey].y, pos[selKey].r * 1.25, 0, Math.PI * 2); ctx.stroke();
        }
        steps.forEach((k) => { const o = pos[k]; if (o) { ctx.fillStyle = 'rgba(217,142,59,0.65)'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.55, 0, Math.PI * 2); ctx.fill(); } });
        jumps.forEach((path) => { const o = pos[path[path.length - 1]]; if (o) { ctx.strokeStyle = 'rgba(217,142,59,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.6, 0, Math.PI * 2); ctx.stroke(); } });
        layout.forEach((o) => {
          const p = pieces[o.k];
          if (p === undefined) return;
          ctx.fillStyle = p === 0 ? '#c9573f' : '#5b86c5';
          ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }

      function pointer(evt) {
        evt.preventDefault();
        computeLayout();
        const rect = canvas.getBoundingClientRect();
        const cx = evt.clientX - rect.left, cy = evt.clientY - rect.top;
        let best = null, bd = Infinity;
        layout.forEach((o) => { const d = Math.hypot(o.x - cx, o.y - cy); if (d < bd) { bd = d; best = o; } });
        if (!best || bd > best.r * 1.35) return;
        const k = best.k;
        if (sel && (steps.indexOf(k) >= 0 || jumps.some((p) => p[p.length - 1] === k))) moveTo(k);
        else if (pieces[k] === cur) select(toCell(k));
        else { sel = null; steps = []; jumps = []; draw(); }
      }

      canvas.addEventListener('pointerdown', pointer);
      reset();
      return { destroy() { destroy(); canvas.removeEventListener('pointerdown', pointer); } };
    }
  });

  /* ============================ 5. 记忆翻牌 ============================ */
  Hub.register({
    id: 'memory', name: '记忆翻牌', icon: '🃏', mode: 'duo', sub: '双人轮流 · 比谁配对多',
    build(host) {
      const EMOJI = ['●', '■', '▲', '◆', '★', '♥', '♠', '♦'];
      const status = el('div', 'status-line'); host.appendChild(status);
      const hud = el('div', 'hud'); host.appendChild(hud);
      const p1 = el('div', 'hud-box', ''); const p2 = el('div', 'hud-box', '');
      hud.append(p1, p2);
      const panel = el('div', 'panel'); host.appendChild(panel);
      const grid = el('div', 'grid mem'); panel.appendChild(grid);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); panel.appendChild(actions); restart.addEventListener('click', reset);
      let cards = [], flipped = [], score = [0, 0], cur = 0, locked = false;
      function reset() {
        const deck = EMOJI.concat(EMOJI).sort(() => Math.random() - 0.5);
        cards = deck.map((s, i) => ({ s, i, matched: false }));
        flipped = []; score = [0, 0]; cur = 0; locked = false;
        grid.innerHTML = '';
        cards.forEach((card, idx) => {
          const c = el('button', 'cell'); c.type = 'button';
          c.addEventListener('click', () => flip(idx)); grid.appendChild(c); card.node = c;
        });
        render(); update();
      }
      function update() {
        p1.innerHTML = '红方<b>' + score[0] + '</b>';
        p2.innerHTML = '蓝方<b>' + score[1] + '</b>';
        status.textContent = (cur === 0 ? '● 红方' : '○ 蓝方') + '回合';
      }
      function render() {
        cards.forEach((card) => {
          const open = card.matched || flipped.includes(card.i);
          card.node.textContent = open ? card.s : '';
          card.node.classList.toggle('flipped', open);
          card.node.classList.toggle('matched', card.matched);
        });
      }
      function flip(i) {
        if (locked || cards[i].matched || flipped.includes(i)) return;
        flipped.push(i); playTap(); render();
        if (flipped.length === 2) {
          locked = true;
          const [a, b] = flipped;
          if (cards[a].s === cards[b].s) {
            setTimeout(() => {
              cards[a].matched = cards[b].matched = true; score[cur]++; flipped = [];
              if (cards.every((c) => c.matched)) { playWin(); update(); render(); dialog(score[0] > score[1] ? '红方获胜' : (score[1] > score[0] ? '蓝方获胜' : '平局'), '红 ' + score[0] + ' : 蓝 ' + score[1], { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame }); return; }
              locked = false; update(); render();
            }, 320);
          } else {
            setTimeout(() => {
              flipped = []; cur = 1 - cur; locked = false; update(); render();
            }, 750);
          }
        }
      }
      reset();
      return { destroy() {} };
    }
  });

  /* ============================ 6. 猜数字 ============================ */
  Hub.register({
    id: 'guess', name: '猜数字', icon: '❓', mode: 'solo', sub: '单人 · 猜4位数字（几A几B）',
    build(host) {
      const status = el('div', 'status-line'); host.appendChild(status);
      const rules = el('div', 'controls-note', '电脑想好 4 位不重复数字（1-9）。你输入 4 个数字后点「确定」：A＝数字和位置都对，B＝数字对但位置错。10 次内猜中即胜。');
      host.appendChild(rules);
      const panel = el('div', 'panel'); host.appendChild(panel);
      const row = el('div', 'guess-row'); panel.appendChild(row);
      const hist = el('div', 'guess-history'); panel.appendChild(hist);
      const pad = el('div', 'num-pad'); panel.appendChild(pad);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); panel.appendChild(actions); restart.addEventListener('click', reset);
      let secret = [], input = [], attempts = 0, over = false;
      function newSecret() {
        const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5).slice(0, 4);
        return digits;
      }
      function reset() {
        secret = newSecret(); input = []; attempts = 0; over = false; hist.innerHTML = '';
        row.textContent = ''; update();
      }
      function update() {
        if (over) status.textContent = '🎉 猜中了！';
        else status.textContent = '输入 4 位不重复数字 · 第 ' + (attempts + 1) + '/10 次';
        row.textContent = input.join(' ') || '（点击下方数字输入）';
      }
      function submit() {
        if (over || input.length !== 4 || new Set(input).size !== 4) { playLose(); return; }
        let a = 0, b = 0;
        input.forEach((d, i) => { if (d === secret[i]) a++; else if (secret.includes(d)) b++; });
        attempts++;
        const line = el('div', 'guess-line');
        line.appendChild(el('span', '', input.join('')));
        line.appendChild(el('span', 'fb', a + 'A' + b + 'B'));
        hist.appendChild(line);
        if (a === 4) { over = true; playWin(); update(); dialog('猜中了', '答案就是 ' + secret.join('') + '，用了 ' + attempts + ' 次。', { confirm: '再来一局', onConfirm: reset }); return; }
        if (attempts >= 10) { over = true; playLose(); update(); dialog('没猜中', '答案是 ' + secret.join('') + '。', { confirm: '再来一局', onConfirm: reset }); return; }
        input = []; playTap(); update();
      }
      for (let d = 0; d <= 9; d++) {
        const k = el('button', 'btn small key', String(d)); k.type = 'button';
        k.addEventListener('click', () => {
          if (over || input.length >= 4 || input.includes(d)) return;
          input.push(d); playTap(); update();
        });
        pad.appendChild(k);
      }
      const clear = el('button', 'btn small key', '⌫'); clear.type = 'button';
      clear.addEventListener('click', () => { if (!over) { input.pop(); playTap(); update(); } });
      const ok = el('button', 'btn small key primary', '确定'); ok.type = 'button';
      ok.addEventListener('click', submit);
      pad.append(clear, ok);
      reset();
      return { destroy() {} };
    }
  });

  /* ============================ 7. 2048 ============================ */
  Hub.register({
    id: 'n2048', name: '2048', icon: '２', mode: 'solo', sub: '单人 · 滑动合并',
    build(host) {
      const hud = el('div', 'hud'); host.appendChild(hud);
      const scoreBox = el('div', 'hud-box', ''); hud.appendChild(scoreBox);
      const status = el('div', 'status-line'); host.appendChild(status);
      const panel = el('div', 'panel'); host.appendChild(panel);
      const grid = el('div', 'grid n2048'); panel.appendChild(grid);
      const cells = [];
      for (let i = 0; i < 16; i++) { const c = el('div', 'cell'); grid.appendChild(c); cells.push(c); }
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); panel.appendChild(actions); restart.addEventListener('click', reset);
      let board = [], score = 0, over = false, won = false;
      let sx = 0, sy = 0;
      function reset() { board = Array(16).fill(0); score = 0; over = false; won = false; spawn(); spawn(); render(); }
      function spawn() {
        const empty = board.map((v, i) => v === 0 ? i : -1).filter((i) => i >= 0);
        if (!empty.length) return;
        const i = empty[Math.floor(Math.random() * empty.length)];
        board[i] = Math.random() < 0.9 ? 2 : 4;
      }
      function slide(arr) {
        let a = arr.filter(Boolean), gained = 0;
        for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
        while (a.length < 4) a.push(0);
        return { arr: a, gained };
      }
      function move(dir) {
        if (over) return;
        let changed = false, gained = 0;
        for (let i = 0; i < 4; i++) {
          let line = [], src = [];
          for (let j = 0; j < 4; j++) {
            const idx = dir === 'left' ? i * 4 + j : dir === 'right' ? i * 4 + (3 - j) : dir === 'up' ? j * 4 + i : (3 - j) * 4 + i;
            line.push(board[idx]); src.push(idx);
          }
          const res = slide(line); gained += res.gained;
          src.forEach((idx, j) => { if (board[idx] !== res.arr[j]) changed = true; board[idx] = res.arr[j]; });
        }
        if (!changed) return;
        score += gained; spawn();
        if (board.includes(2048) && !won) { won = true; playWin(); dialog('达成 2048', '继续挑战更高分！', { confirm: '继续', onConfirm: closeDialog }); }
        if (!movesLeft()) { over = true; playLose(); dialog('游戏结束', '没有可移动的格子了，得分 ' + score + '。', { confirm: '再来一局', onConfirm: reset }); }
        render();
      }
      function movesLeft() {
        if (board.includes(0)) return true;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const v = board[r * 4 + c];
          if (c < 3 && board[r * 4 + c + 1] === v) return true;
          if (r < 3 && board[(r + 1) * 4 + c] === v) return true;
        }
        return false;
      }
      function render() {
        scoreBox.innerHTML = '得分<b>' + score + '</b>';
        status.textContent = over ? '游戏结束' : (won ? '已达成 2048，继续…' : '滑动合并到 2048');
        board.forEach((v, i) => {
          cells[i].textContent = v || '';
          cells[i].className = 'cell' + (v ? ' t' + v : '');
        });
      }
      function swiper() {
        grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        grid.addEventListener('touchend', (e) => {
          const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        }, { passive: true });
      }
      function key(e) {
        const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
        if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
      }
      swiper();
      window.addEventListener('keydown', key);
      reset();
      return { destroy() { window.removeEventListener('keydown', key); } };
    }
  });

  /* ============================ 9. 贪吃蛇 ============================ */
  Hub.register({
    id: 'snake', name: '贪吃蛇', icon: '🐍', mode: 'solo', sub: '单人 · 环面地图',
    build(host) {
      const COLS = 16, ROWS = 12;
      const hud = el('div', 'hud'); host.appendChild(hud);
      const scoreBox = el('div', 'hud-box', ''); hud.appendChild(scoreBox);
      const status = el('div', 'status-line'); host.appendChild(status);
      const wrap = el('div', 'board-wrap'); const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      const actions = el('div', 'actions');
      const restart = el('button', 'btn primary', '重新开始'); actions.appendChild(restart); host.appendChild(actions);
      const note = el('div', 'controls-note', '在棋盘上滑动，或用键盘方向键控制'); host.appendChild(note);
      restart.addEventListener('click', reset);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);
      let snake = [], dir = [1, 0], nextDir = [1, 0], food = [0, 0], score = 0, over = false, timer = null;
      let tx = 0, ty = 0;
      function reset() {
        snake = [[Math.floor(COLS / 2), Math.floor(ROWS / 2)]];
        dir = [1, 0]; nextDir = [1, 0]; score = 0; over = false;
        placeFood(); clearInterval(timer);
        timer = setInterval(tick, 150);
        update(); draw();
      }
      function placeFood() {
        do {
          food = [Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS)];
        } while (snake.some(([x, y]) => x === food[0] && y === food[1]));
      }
      function tick() {
        if (over) return;
        dir = nextDir;
        let [hx, hy] = snake[0];
        let nx = hx + dir[0], ny = hy + dir[1];
        nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS;
        const tail = snake[snake.length - 1];
        const willGrow = nx === food[0] && ny === food[1];
        const body = willGrow ? snake : snake.slice(0, -1);
        if (body.some(([x, y]) => x === nx && y === ny)) { over = true; playLose(); clearInterval(timer); update(); draw(); dialog('游戏结束', '撞到自己了，得分 ' + score + '。', { confirm: '再来一局', onConfirm: reset }); return; }
        snake.unshift([nx, ny]);
        if (willGrow) { score++; playPlace(); placeFood(); } else snake.pop();
        update(); draw();
      }
      function update() {
        scoreBox.innerHTML = '得分<b>' + score + '</b>';
        status.textContent = over ? '游戏结束' : '长度 ' + snake.length;
      }
      function draw() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const cell = Math.min(w / COLS, h / ROWS);
        const bw = cell * COLS, bh = cell * ROWS;
        const ox = (w - bw) / 2, oy = (h - bh) / 2;
        ctx.fillStyle = '#eaf1e6'; ctx.fillRect(ox, oy, bw, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + bh); ctx.stroke(); }
        for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + bw, oy + y * cell); ctx.stroke(); }
        ctx.fillStyle = '#d98e3b'; ctx.beginPath(); ctx.arc(ox + food[0] * cell + cell / 2, oy + food[1] * cell + cell / 2, cell * 0.32, 0, Math.PI * 2); ctx.fill();
        snake.forEach(([x, y], i) => {
          ctx.fillStyle = i === 0 ? '#3f7a52' : '#5ea06a';
          ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
        });
      }
      function swipe(e) {
        const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
        let d;
        if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? [1, 0] : [-1, 0]; else d = dy > 0 ? [0, 1] : [0, -1];
        if (d[0] !== -dir[0] || d[1] !== -dir[1]) nextDir = d;
      }
      canvas.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
      canvas.addEventListener('touchend', swipe, { passive: true });
      function key(e) {
        const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (map[e.key]) { e.preventDefault(); const d = map[e.key]; if (d[0] !== -dir[0] || d[1] !== -dir[1]) nextDir = d; }
      }
      window.addEventListener('keydown', key);
      reset();
      return { destroy() { clearInterval(timer); window.removeEventListener('keydown', key); } };
    }
  });

  /* ============================ 10. 反应对战 ============================ */
  Hub.register({
    id: 'reaction', name: '反应对战', icon: '⚡', mode: 'duo', sub: '同屏双人 · 看谁手快',
    build(host) {
      const WIN = 5;
      const status = el('div', 'status-line'); host.appendChild(status);
      const hud = el('div', 'hud'); host.appendChild(hud);
      const p1 = el('div', 'hud-box', ''); const p2 = el('div', 'hud-box', ''); hud.append(p1, p2);
      const arena = el('div', 'reaction'); host.appendChild(arena);
      const zone = el('div', 'reaction-arena'); arena.appendChild(zone);
      const z1 = el('div', 'reaction-zone p1', '红方\n点这里'); const z2 = el('div', 'reaction-zone p2', '蓝方\n点这里');
      zone.append(z1, z2);
      const target = el('div', 'reaction-target', '●'); zone.appendChild(target);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); host.appendChild(actions); restart.addEventListener('click', reset);
      let score = [0, 0], state = 'ready', timeout = null, flashTimer = null;
      function reset() {
        score = [0, 0]; state = 'ready'; clearTimeout(timeout); clearTimeout(flashTimer);
        target.style.display = 'none'; render(); arm();
      }
      function arm() {
        state = 'ready';
        status.textContent = '准备…看到圆点就点自己的区域';
        target.style.display = 'none';
        timeout = setTimeout(() => {
          state = 'go';
          status.textContent = '⚡ 快抢！';
          target.style.display = 'grid';
          flashTimer = setTimeout(() => { if (state === 'go') miss(); }, 1200);
        }, 800 + Math.random() * 1600);
      }
      function hit(p) {
        if (state === 'ready') {
          score[p] = Math.max(0, score[p] - 1);
          clearTimeout(timeout); render(); status.textContent = (p === 0 ? '红方' : '蓝方') + '抢跑 -1，重新来';
          setTimeout(arm, 700); return;
        }
        if (state !== 'go') return;
        state = 'over';
        clearTimeout(flashTimer);
        score[p]++; playTap(); render();
        target.style.display = 'none';
        if (score[p] >= WIN) { playWin(); status.textContent = (p === 0 ? '红方' : '蓝方') + '获胜！'; dialog((p === 0 ? '红方' : '蓝方') + '获胜', '红 ' + score[0] + ' : 蓝 ' + score[1], { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame }); }
        else { status.textContent = (p === 0 ? '红方' : '蓝方') + ' +1 分！'; setTimeout(arm, 700); }
      }
      function miss() {
        state = 'over'; target.style.display = 'none';
        status.textContent = '都慢了，重新来'; setTimeout(arm, 700);
      }
      function render() {
        p1.innerHTML = '红方<b>' + score[0] + '</b>';
        p2.innerHTML = '蓝方<b>' + score[1] + '</b>';
      }
      z1.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(0); });
      z2.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(1); });
      reset();
      return { destroy() { clearTimeout(timeout); clearTimeout(flashTimer); } };
    }
  });

  /* ============================ 11. 中国象棋 ============================ */
  Hub.register({
    id: 'xiangqi', name: '中国象棋', icon: '帅', mode: 'duo', sub: '同屏双人 · 9×10',
    build(host) {
      const R = 10, C = 9;
      const CH = { k: ['帅', '将'], a: ['仕', '士'], e: ['相', '象'], h: ['马', '马'], r: ['车', '车'], c: ['炮', '炮'], p: ['兵', '卒'] };
      const status = el('div', 'status-line'); host.appendChild(status);
      const wrap = el('div', 'board-wrap'); const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); host.appendChild(actions); restart.addEventListener('click', reset);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);

      let board = [], turn = 'r', sel = null, selMoves = [], over = false, lastMove = null, checkPos = null;
      const P = (type, color) => ({ type, color });
      const other = (s) => (s === 'r' ? 'b' : 'r');
      const inB = (r, c) => r >= 0 && r < R && c >= 0 && c < C;
      const inPalace = (r, c, s) => c >= 3 && c <= 5 && (s === 'r' ? r >= 7 : r <= 2);

      function reset() {
        board = Array.from({ length: R }, () => Array(C).fill(null));
        const back = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'];
        for (let c = 0; c < C; c++) { board[0][c] = P(back[c], 'b'); board[9][c] = P(back[c], 'r'); }
        board[2][1] = P('c', 'b'); board[2][7] = P('c', 'b');
        board[7][1] = P('c', 'r'); board[7][7] = P('c', 'r');
        for (let c = 0; c < C; c += 2) { board[3][c] = P('p', 'b'); board[6][c] = P('p', 'r'); }
        turn = 'r'; sel = null; selMoves = []; over = false; lastMove = null; checkPos = null;
        update(); draw();
      }

      function clone(b) { return b.map((row) => row.slice()); }

      function genPseudo(b, r, c) {
        const p = b[r][c]; if (!p) return [];
        const s = p.color, dir = s === 'r' ? -1 : 1, moves = [];
        const cross = s === 'r' ? r <= 4 : r >= 5;
        const push = (rr, cc) => { if (inB(rr, cc) && (!b[rr][cc] || b[rr][cc].color !== s)) moves.push([rr, cc]); };
        if (p.type === 'k') {
          [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => { if (inPalace(r + dr, c + dc, s)) push(r + dr, c + dc); });
        } else if (p.type === 'a') {
          [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => { if (inPalace(r + dr, c + dc, s)) push(r + dr, c + dc); });
        } else if (p.type === 'e') {
          [[-2, -2], [-2, 2], [2, -2], [2, 2]].forEach(([dr, dc]) => {
            const rr = r + dr, cc = c + dc;
            if (!inB(rr, cc)) return;
            if (b[r + dr / 2][c + dc / 2]) return;
            if (s === 'r' ? rr <= 4 : rr >= 5) return;
            push(rr, cc);
          });
        } else if (p.type === 'h') {
          [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]].forEach(([dr, dc]) => {
            const rr = r + dr, cc = c + dc;
            if (!inB(rr, cc)) return;
            const lr = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
            const lc = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
            if (b[lr][lc]) return;
            push(rr, cc);
          });
        } else if (p.type === 'r' || p.type === 'c') {
          [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
            let rr = r + dr, cc = c + dc, screen = false;
            while (inB(rr, cc)) {
              if (p.type === 'r') {
                if (!b[rr][cc]) moves.push([rr, cc]);
                else { if (b[rr][cc].color !== s) moves.push([rr, cc]); break; }
              } else {
                if (!screen) {
                  if (!b[rr][cc]) moves.push([rr, cc]); else screen = true;
                } else if (b[rr][cc]) { if (b[rr][cc].color !== s) moves.push([rr, cc]); break; }
              }
              rr += dr; cc += dc;
            }
          });
        } else if (p.type === 'p') {
          push(r + dir, c);
          if (cross) { push(r, c - 1); push(r, c + 1); }
        }
        return moves;
      }

      function findGeneral(b, s) {
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (b[r][c] && b[r][c].type === 'k' && b[r][c].color === s) return [r, c];
        return null;
      }

      function isAttacked(b, r, c, by) {
        for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
          const p = b[rr][cc]; if (!p || p.color !== by) continue;
          if (p.type === 'k' && cc === c) {
            let blocked = false;
            for (let m = Math.min(rr, r) + 1; m < Math.max(rr, r); m++) if (b[m][cc]) blocked = true;
            if (!blocked) return true;
          }
          if (genPseudo(b, rr, cc).some(([mr, mc]) => mr === r && mc === c)) return true;
        }
        return false;
      }

      function inCheck(b, s) { const g = findGeneral(b, s); return g ? isAttacked(b, g[0], g[1], other(s)) : false; }

      function genLegal(b, s) {
        const out = [];
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const p = b[r][c]; if (!p || p.color !== s) continue;
          genPseudo(b, r, c).forEach(([tr, tc]) => {
            const nb = clone(b); nb[tr][tc] = p; nb[r][c] = null;
            if (!inCheck(nb, s)) out.push({ from: [r, c], to: [tr, tc] });
          });
        }
        return out;
      }

      function select(r, c) {
        const p = board[r][c];
        if (p && p.color === turn) {
          sel = [r, c];
          selMoves = genLegal(board, turn).filter((m) => m.from[0] === r && m.from[1] === c).map((m) => m.to);
        } else { sel = null; selMoves = []; }
        draw();
      }

      function moveTo(tr, tc) {
        if (!sel) return;
        const [fr, fc] = sel;
        if (!selMoves.some(([r, c]) => r === tr && c === tc)) return;
        const p = board[fr][fc];
        board[tr][tc] = p; board[fr][fc] = null; lastMove = [fr, fc, tr, tc];
        sel = null; selMoves = [];
        turn = other(turn);
        const legal = genLegal(board, turn);
        const chk = inCheck(board, turn);
        checkPos = chk ? findGeneral(board, turn) : null;
        if (!legal.length) {
          over = true; playWin(); update(); draw();
          dialog(chk ? (other(turn) === 'r' ? '红方获胜' : '黑方获胜') : '平局', chk ? '将死！' : '困毙（无棋可走）。', { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
          return;
        }
        playTap(); update(); draw();
      }

      function update() {
        if (over) { status.textContent = '对局结束'; return; }
        status.textContent = (turn === 'r' ? '红方' : '黑方') + '回合' + (checkPos ? ' · 将军！' : '');
        status.style.color = checkPos ? '#d98e3b' : '#4a4038';
      }

      function layout(w, h) {
        const PAD = 26, gx = (w - PAD * 2) / 8, gy = (h - PAD * 2) / 9;
        const X = (c) => PAD + c * gx, Y = (r) => PAD + r * gy;
        return { gx, gy, X, Y };
      }

      function draw() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const { gx, gy, X, Y } = layout(w, h);
        ctx.strokeStyle = '#a97c50'; ctx.lineWidth = 1.6;
        for (let c = 0; c < C; c++) { ctx.beginPath(); ctx.moveTo(X(c), Y(0)); ctx.lineTo(X(c), Y(9)); ctx.stroke(); }
        for (let r = 0; r < R; r++) {
          if (r === 0) { ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(8), Y(0)); ctx.stroke(); }
          else if (r === 9) { ctx.beginPath(); ctx.moveTo(X(0), Y(9)); ctx.lineTo(X(8), Y(9)); ctx.stroke(); }
          else if (r < 5) { ctx.beginPath(); ctx.moveTo(X(0), Y(r)); ctx.lineTo(X(4), Y(r)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(4), Y(r)); ctx.lineTo(X(8), Y(r)); ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(X(0), Y(r)); ctx.lineTo(X(8), Y(r)); ctx.stroke(); }
        }
        // 宫斜线
        ctx.lineWidth = 1.2;
        [[0, 3], [7, 3]].forEach(([rr, cc]) => {
          ctx.beginPath(); ctx.moveTo(X(cc), Y(rr)); ctx.lineTo(X(cc + 2), Y(rr + 2)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(X(cc + 2), Y(rr)); ctx.lineTo(X(cc), Y(rr + 2)); ctx.stroke();
        });
        ctx.fillStyle = '#a97c50'; ctx.font = '600 ' + Math.round(gy * 0.45) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('楚 河', X(1.5), Y(4.5));
        ctx.fillText('汉 界', X(6.5), Y(4.5));
        // 移动提示
        if (sel) { ctx.fillStyle = 'rgba(217,142,59,0.25)'; ctx.fillRect(X(sel[1]) - gx * 0.42, Y(sel[0]) - gy * 0.42, gx * 0.84, gy * 0.84); }
        selMoves.forEach(([r, c]) => { ctx.fillStyle = 'rgba(217,142,59,0.7)'; ctx.beginPath(); ctx.arc(X(c), Y(r), Math.min(gx, gy) * 0.16, 0, Math.PI * 2); ctx.fill(); });
        if (checkPos) { ctx.fillStyle = 'rgba(217,142,59,0.35)'; ctx.beginPath(); ctx.arc(X(checkPos[1]), Y(checkPos[0]), Math.min(gx, gy) * 0.42, 0, Math.PI * 2); ctx.fill(); }
        // 棋子
        const r0 = Math.min(gx, gy) * 0.42;
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const p = board[r][c]; if (!p) continue;
          const x = X(c), y = Y(r);
          ctx.fillStyle = '#f4e7c8'; ctx.strokeStyle = p.color === 'r' ? '#b94b3d' : '#3b3a36'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = p.color === 'r' ? '#b94b3d' : '#3b3a36';
          ctx.font = '700 ' + Math.round(r0 * 1.15) + 'px "PingFang SC","Noto Sans CJK SC",sans-serif';
          ctx.fillText(CH[p.type][p.color === 'r' ? 0 : 1], x, y + 1);
        }
      }

      function pointer(evt) {
        evt.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const { gx, gy, X, Y } = layout(rect.width, rect.height);
        const px = evt.clientX - rect.left, py = evt.clientY - rect.top;
        let best = null, bd = Infinity;
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const d = Math.hypot(X(c) - px, Y(r) - py);
          if (d < bd) { bd = d; best = [r, c]; }
        }
        if (!best || bd > Math.min(gx, gy) * 0.5) return;
        const [r, c] = best;
        if (sel && selMoves.some(([tr, tc]) => tr === r && tc === c)) moveTo(r, c);
        else if (board[r][c] && board[r][c].color === turn) select(r, c);
        else { sel = null; selMoves = []; draw(); }
      }

      canvas.addEventListener('pointerdown', pointer);
      reset();
      return { destroy() { destroy(); canvas.removeEventListener('pointerdown', pointer); } };
    }
  });

  /* ============================ 12. 国际象棋 ============================ */
  Hub.register({
    id: 'chess', name: '国际象棋', icon: '♞', mode: 'duo', sub: '同屏双人 · 8×8',
    build(host) {
      const N = 8;
      const LETTER = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
      const status = el('div', 'status-line'); host.appendChild(status);
      const wrap = el('div', 'board-wrap'); const canvas = makeCanvas(); wrap.appendChild(canvas); host.appendChild(wrap);
      const actions = el('div', 'actions'); const restart = el('button', 'btn primary', '重新开始');
      actions.appendChild(restart); host.appendChild(actions); restart.addEventListener('click', reset);
      const { ctx, resize, destroy } = canvasGame(canvas, draw);

      let board = [], turn = 'w', sel = null, selMoves = [], over = false, lastMove = null, checkPos = null;
      const P = (type, color) => ({ type, color });
      const other = (s) => (s === 'w' ? 'b' : 'w');
      const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

      function reset() {
        board = Array.from({ length: N }, () => Array(N).fill(null));
        const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        for (let c = 0; c < N; c++) { board[0][c] = P(back[c], 'b'); board[7][c] = P(back[c], 'w'); board[1][c] = P('p', 'b'); board[6][c] = P('p', 'w'); }
        turn = 'w'; sel = null; selMoves = []; over = false; lastMove = null; checkPos = null;
        update(); draw();
      }

      function clone(b) { return b.map((row) => row.slice()); }

      function slide(b, r, c, dirs, s, moves) {
        dirs.forEach(([dr, dc]) => {
          let rr = r + dr, cc = c + dc;
          while (inB(rr, cc)) {
            if (!b[rr][cc]) moves.push([rr, cc]);
            else { if (b[rr][cc].color !== s) moves.push([rr, cc]); break; }
            rr += dr; cc += dc;
          }
        });
      }

      function genPseudo(b, r, c) {
        const p = b[r][c]; if (!p) return [];
        const s = p.color, moves = [];
        const push = (rr, cc) => { if (inB(rr, cc) && (!b[rr][cc] || b[rr][cc].color !== s)) moves.push([rr, cc]); };
        if (p.type === 'p') {
          const dir = s === 'w' ? -1 : 1, start = s === 'w' ? 6 : 1;
          if (inB(r + dir, c) && !b[r + dir][c]) moves.push([r + dir, c]);
          if (r === start && !b[r + dir][c] && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
          [[dir, -1], [dir, 1]].forEach(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (inB(rr, cc) && b[rr][cc] && b[rr][cc].color !== s) moves.push([rr, cc]); });
        } else if (p.type === 'n') {
          [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]].forEach(([dr, dc]) => push(r + dr, c + dc));
        } else if (p.type === 'b') {
          slide(b, r, c, [[-1, -1], [-1, 1], [1, -1], [1, 1]], s, moves);
        } else if (p.type === 'r') {
          slide(b, r, c, [[-1, 0], [1, 0], [0, -1], [0, 1]], s, moves);
        } else if (p.type === 'q') {
          slide(b, r, c, [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]], s, moves);
        } else if (p.type === 'k') {
          [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => push(r + dr, c + dc));
        }
        return moves;
      }

      function findKing(b, s) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c] && b[r][c].type === 'k' && b[r][c].color === s) return [r, c];
        return null;
      }

      function isAttacked(b, r, c, by) {
        for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
          const p = b[rr][cc]; if (!p || p.color !== by) continue;
          if (genPseudo(b, rr, cc).some(([mr, mc]) => mr === r && mc === c)) return true;
        }
        return false;
      }

      function inCheck(b, s) { const k = findKing(b, s); return k ? isAttacked(b, k[0], k[1], other(s)) : false; }

      function genLegal(b, s) {
        const out = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const p = b[r][c]; if (!p || p.color !== s) continue;
          genPseudo(b, r, c).forEach(([tr, tc]) => {
            const nb = clone(b); nb[tr][tc] = p; nb[r][c] = null;
            if (!inCheck(nb, s)) out.push({ from: [r, c], to: [tr, tc] });
          });
        }
        return out;
      }

      function select(r, c) {
        const p = board[r][c];
        if (p && p.color === turn) {
          sel = [r, c];
          selMoves = genLegal(board, turn).filter((m) => m.from[0] === r && m.from[1] === c).map((m) => m.to);
        } else { sel = null; selMoves = []; }
        draw();
      }

      function moveTo(tr, tc) {
        if (!sel) return;
        const [fr, fc] = sel;
        if (!selMoves.some(([r, c]) => r === tr && c === tc)) return;
        const p = board[fr][fc];
        board[tr][tc] = p; board[fr][fc] = null;
        if (p.type === 'p' && (tr === 0 || tr === 7)) { p.type = 'q'; }
        lastMove = [fr, fc, tr, tc];
        sel = null; selMoves = [];
        turn = other(turn);
        const legal = genLegal(board, turn);
        const chk = inCheck(board, turn);
        checkPos = chk ? findKing(board, turn) : null;
        if (!legal.length) {
          over = true; playWin(); update(); draw();
          dialog(chk ? (other(turn) === 'w' ? '白方获胜' : '黑方获胜') : '平局', chk ? '将杀！' : '逼和（无棋可走）。', { confirm: '再来一局', cancel: '返回大厅', onConfirm: reset, onCancel: exitGame });
          return;
        }
        playTap(); update(); draw();
      }

      function update() {
        if (over) { status.textContent = '对局结束'; return; }
        status.textContent = (turn === 'w' ? '白方' : '黑方') + '回合' + (checkPos ? ' · 将军！' : '');
        status.style.color = checkPos ? '#d98e3b' : '#4a4038';
      }

      function draw() {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        ctx.clearRect(0, 0, w, h);
        const side = Math.min(w, h), cell = side / N, ox = (w - side) / 2, oy = (h - side) / 2;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#a8c3a0' : '#eef3ea';
          ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
        }
        if (lastMove) {
          ctx.fillStyle = 'rgba(217,142,59,0.28)';
          ctx.fillRect(ox + lastMove[1] * cell, oy + lastMove[0] * cell, cell, cell);
          ctx.fillRect(ox + lastMove[3] * cell, oy + lastMove[2] * cell, cell, cell);
        }
        if (sel) { ctx.fillStyle = 'rgba(217,142,59,0.35)'; ctx.fillRect(ox + sel[1] * cell, oy + sel[0] * cell, cell, cell); }
        selMoves.forEach(([r, c]) => {
          if (board[r][c]) { ctx.strokeStyle = 'rgba(217,142,59,0.9)'; ctx.lineWidth = 4; ctx.strokeRect(ox + c * cell + 3, oy + r * cell + 3, cell - 6, cell - 6); }
          else { ctx.fillStyle = 'rgba(217,142,59,0.7)'; ctx.beginPath(); ctx.arc(ox + c * cell + cell / 2, oy + r * cell + cell / 2, cell * 0.14, 0, Math.PI * 2); ctx.fill(); }
        });
        if (checkPos) { ctx.fillStyle = 'rgba(217,142,59,0.45)'; ctx.fillRect(ox + checkPos[1] * cell, oy + checkPos[0] * cell, cell, cell); }
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const p = board[r][c]; if (!p) continue;
          const x = ox + c * cell + cell / 2, y = oy + r * cell + cell / 2, rr = cell * 0.42;
          ctx.fillStyle = p.color === 'w' ? '#fdfbf5' : '#3b3a36';
          ctx.strokeStyle = p.color === 'w' ? '#3b3a36' : '#fdfbf5'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = p.color === 'w' ? '#3b3a36' : '#fdfbf5';
          ctx.font = '700 ' + Math.round(cell * 0.52) + 'px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(LETTER[p.type], x, y + cell * 0.02);
        }
      }

      function pointer(evt) {
        evt.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const side = Math.min(rect.width, rect.height), cell = side / N;
        const ox = (rect.width - side) / 2, oy = (rect.height - side) / 2;
        const px = evt.clientX - rect.left, py = evt.clientY - rect.top;
        const c = Math.floor((px - ox) / cell), r = Math.floor((py - oy) / cell);
        if (!inB(r, c)) return;
        if (sel && selMoves.some(([tr, tc]) => tr === r && tc === c)) moveTo(r, c);
        else if (board[r][c] && board[r][c].color === turn) select(r, c);
        else { sel = null; selMoves = []; draw(); }
      }

      canvas.addEventListener('pointerdown', pointer);
      reset();
      return { destroy() { destroy(); canvas.removeEventListener('pointerdown', pointer); } };
    }
  });

  /* ============================ 启动 ============================ */
  renderLobby('all');
  showScreen('lobby');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
