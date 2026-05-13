// ==UserScript==
// @name         Pokelike Auto Route
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Click nodes on the live map to plan a route, then auto-play it
// @match        https://pokelike.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  let liveMap      = null;
  let nodeOrder    = [];
  let plannedRoute = [];
  let autoPlaying  = false;

  const NODE_INFO = {
    battle:     { emoji: '⚔️' },
    catch:      { emoji: '🔴' },
    item:       { emoji: '🎒' },
    boss:       { emoji: '👑' },
    pokecenter: { emoji: '🏥' },
    trainer:    { emoji: '🧑' },
    trade:      { emoji: '🔄' },
    shiny:      { emoji: '✨' },
    move_tutor: { emoji: '📖' },
    moveTutor:  { emoji: '📖' },
    question:   { emoji: '❓' },
    legendary:  { emoji: '🐉' },
    start:      { emoji: '★'  },
  };

  // ─── renderMap patchen ───────────────────────────────────────────────────────
  const _origRenderMap = window.renderMap;
  window.renderMap = function (map, container, onNodeClickOrig) {
    // Neue Map (neuer Run) → Route leeren
    if (map !== liveMap) {
      plannedRoute = [];
      autoPlaying  = false;
    }
    liveMap   = map;
    nodeOrder = Object.values(map.nodes)
      .sort((a, b) => a.layer !== b.layer ? a.layer - b.layer : a.col - b.col);

    const result = _origRenderMap(map, container, onNodeClickOrig);
    const svg = container.querySelector('svg');
    if (svg) setupInterception(container, svg);
    refreshVisuals();
    updateUI();
    return result;
  };

  // ─── Map-Screen Visibility beobachten ────────────────────────────────────────
  new MutationObserver(() => {
    const ms = document.getElementById('map-screen');
    const ui = document.getElementById('ar-ui');
    if (!ui) return;
    const mapVisible = ms && getComputedStyle(ms).display !== 'none';
    ui.style.display = mapVisible ? 'flex' : 'none';
    if (!mapVisible && autoPlaying) {
      // Wenn Map verschwindet während Auto-Play läuft → nicht abbrechen,
      // waitForMap wartet bis sie wiederkommt
    }
    // Wenn wir auf Titelscreen zurück sind → Route + State leeren
    const titleVisible = document.getElementById('title-screen') &&
      getComputedStyle(document.getElementById('title-screen')).display !== 'none';
    if (titleVisible) {
      plannedRoute = [];
      autoPlaying  = false;
      liveMap      = null;
      updateUI();
      setStatus('');
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });

  // ─── SVG Click Interception ──────────────────────────────────────────────────
  let _captureHandler = null;

  function setupInterception(container, svg) {
    if (_captureHandler) container.removeEventListener('click', _captureHandler, true);
    _captureHandler = function (e) {
      if (autoPlaying) return;
      const g = e.target.closest('g[transform]');
      if (!g) return;
      const gs = [...svg.querySelectorAll('g[transform]')]
        .filter(el => el.getAttribute('transform')?.startsWith('translate('));
      const idx = gs.indexOf(g);
      if (idx < 0 || idx >= nodeOrder.length) return;
      const node = nodeOrder[idx];
      if (!node || node.visited || node.type === 'start') return;
      if (!node.revealed) return;
      e.stopPropagation();
      e.preventDefault();
      toggleNode(node);
    };
    container.addEventListener('click', _captureHandler, true);
  }

  // ─── Route logic ─────────────────────────────────────────────────────────────
  function toggleNode(node) {
    const idx = plannedRoute.indexOf(node.id);
    if (idx !== -1) {
      // Deselect — auch alle späteren entfernen
      plannedRoute = plannedRoute.slice(0, idx);
    } else {
      // Max 1 pro Layer — vorherige Selection dieses Layers und alles danach entfernen
      const sameLayerIdx = plannedRoute.findIndex(id => liveMap.nodes[id]?.layer === node.layer);
      if (sameLayerIdx !== -1) {
        plannedRoute = plannedRoute.slice(0, sameLayerIdx);
      }
      plannedRoute.push(node.id);
    }
    refreshVisuals();
    updateUI();
  }

  // ─── SVG Visuals ─────────────────────────────────────────────────────────────
  function refreshVisuals() {
    if (!liveMap) return;
    const container = document.getElementById('map-container');
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    const gs = [...svg.querySelectorAll('g[transform]')]
      .filter(g => g.getAttribute('transform')?.startsWith('translate('));

    svg.querySelectorAll('.ar-marker').forEach(el => el.remove());

    gs.forEach((g, i) => {
      const node = nodeOrder[i];
      if (!node || node.visited || node.type === 'start') return;
      if (!plannedRoute.includes(node.id)) return;

      const pos    = plannedRoute.indexOf(node.id) + 1;
      const isNext = pos === 1;
      const color  = isNext ? '#00ff6a' : '#bf00ff';

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('r', '22');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', '3.5');
      ring.setAttribute('stroke-dasharray', isNext ? 'none' : '4,3');
      ring.setAttribute('opacity', '1');
      ring.setAttribute('pointer-events', 'none');
      ring.classList.add('ar-marker');

      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', '15');
      badge.setAttribute('y', '-14');
      badge.setAttribute('text-anchor', 'middle');
      badge.setAttribute('font-size', '11');
      badge.setAttribute('font-weight', '700');
      badge.setAttribute('fill', color);
      badge.setAttribute('pointer-events', 'none');
      badge.classList.add('ar-marker');
      badge.textContent = pos;

      g.appendChild(ring);
      g.appendChild(badge);
    });
  }

  // ─── Auto-Play ───────────────────────────────────────────────────────────────
  function waitForMap(timeout = 90000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        const ms = document.getElementById('map-screen');
        if (ms && getComputedStyle(ms).display !== 'none' && liveMap) {
          clearInterval(iv);
          setTimeout(resolve, 500);
        }
        if (Date.now() - start > timeout) { clearInterval(iv); reject('timeout'); }
      }, 200);
    });
  }

  async function playRoute() {
    if (autoPlaying) { autoPlaying = false; updateUI(); return; }
    if (!plannedRoute.length) return;

    autoPlaying = true;
    updateUI();
    setStatus('▶ Running…', 'active');

    for (const nodeId of [...plannedRoute]) {
      if (!autoPlaying) break;
      const node = liveMap?.nodes[nodeId];
      if (!node || node.visited) continue;
      if (!node.accessible) { setStatus(`⚠ ${nodeId} nicht erreichbar`, 'warn'); break; }

      setStatus(`→ ${NODE_INFO[node.type]?.emoji || '?'}  ${nodeId}`, 'active');
      try {
        await window.onNodeClick(node);
        await waitForMap();
        plannedRoute = plannedRoute.filter(id => !liveMap?.nodes[id]?.visited);
        refreshVisuals();
        updateUI();
      } catch (e) {
        setStatus(`✗ ${e}`, 'error');
        break;
      }
    }

    autoPlaying = false;
    plannedRoute = plannedRoute.filter(id => !liveMap?.nodes[id]?.visited);
    refreshVisuals();
    updateUI();
    setStatus(plannedRoute.length === 0 ? '✓ Route fertig' : '■ Gestoppt');
  }

  // ─── Floating UI ─────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('ar-ui')) return;

    const style = document.createElement('style');
    style.textContent = `
      #ar-ui {
        position: fixed; bottom: 18px; left: 18px; z-index: 999997;
        display: none; flex-direction: column; gap: 5px; align-items: flex-start;
      }
      #ar-status-bar {
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 600;
        background: rgba(10,10,14,0.82);
        backdrop-filter: blur(12px);
        border: 0.5px solid rgba(255,255,255,0.08);
        border-radius: 999px; padding: 4px 12px;
        transition: color 0.2s, border-color 0.2s;
        white-space: nowrap; display: none;
      }
      #ar-status-bar.active {
        color: rgba(74,222,128,0.9);
        border-color: rgba(74,222,128,0.25);
        display: block;
      }
      #ar-status-bar.warn  { color: rgba(251,191,36,0.85); border-color: rgba(251,191,36,0.25); display: block; }
      #ar-status-bar.error { color: rgba(239,68,68,0.85);  border-color: rgba(239,68,68,0.25);  display: block; }
      #ar-controls {
        display: flex; gap: 6px; align-items: center;
        background: rgba(10,10,14,0.82);
        backdrop-filter: blur(12px);
        border: 0.5px solid rgba(255,255,255,0.1);
        border-radius: 999px; padding: 5px 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
      #ar-icon {
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
        color: rgba(167,139,250,0.8); padding: 0 2px;
      }
      #ar-count {
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 700;
        color: rgba(167,139,250,0.6);
        min-width: 16px; text-align: center;
      }
      .ar-divider { width: 0.5px; height: 14px; background: rgba(255,255,255,0.1); }
      #ar-play {
        background: linear-gradient(135deg,#a78bfa,#8b5cf6);
        border: none; border-radius: 999px;
        color: #fff; font-size: 10px; font-weight: 700;
        padding: 5px 12px; cursor: pointer;
        letter-spacing: 0.04em; transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(167,139,250,0.3);
      }
      #ar-play:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(167,139,250,0.45); }
      #ar-play:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
      #ar-play.stop {
        background: linear-gradient(135deg,#ef4444,#dc2626);
        box-shadow: 0 2px 8px rgba(239,68,68,0.3);
      }
      #ar-clear {
        background: none; border: none;
        color: rgba(235,235,245,0.25); font-size: 12px;
        cursor: pointer; padding: 2px 4px;
        transition: color 0.15s; line-height: 1;
      }
      #ar-clear:hover { color: rgba(239,68,68,0.6); }
    `;
    document.head.appendChild(style);

    const ui = document.createElement('div');
    ui.id = 'ar-ui';
    ui.innerHTML = `
      <div id="ar-status-bar"></div>
      <div id="ar-controls">
        <span id="ar-icon">ROUTE</span>
        <span id="ar-count">0</span>
        <div class="ar-divider"></div>
        <button id="ar-play" disabled>▶ Play</button>
        <button id="ar-clear" title="Route leeren">✕</button>
      </div>
    `;
    document.body.appendChild(ui);

    document.getElementById('ar-play').addEventListener('click', playRoute);
    document.getElementById('ar-clear').addEventListener('click', () => {
      plannedRoute = [];
      refreshVisuals();
      updateUI();
      setStatus('');
    });
  }

  function setStatus(msg, type = '') {
    const el = document.getElementById('ar-status-bar');
    if (!el) return;
    el.textContent = msg;
    el.className = type;
  }

  function updateUI() {
    const ui = document.getElementById('ar-ui');
    if (!ui) return;
    const count = plannedRoute.length;
    const playBtn = document.getElementById('ar-play');
    const countEl = document.getElementById('ar-count');
    if (playBtn) {
      playBtn.disabled    = count === 0 && !autoPlaying;
      playBtn.textContent = autoPlaying ? '■ Stop' : '▶ Play';
      playBtn.className   = autoPlaying ? 'stop' : '';
    }
    if (countEl) countEl.textContent = count;
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  buildUI();

})();