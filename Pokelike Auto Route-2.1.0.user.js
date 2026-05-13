// ==UserScript==
// @name         Pokelike Auto Route
// @namespace    http://tampermonkey.net/
// @version      2.3.1
// @description  Click nodes on the live map to plan a route, then auto-play it
// @match        https://pokelike.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  let liveMap      = null;
  let nodeOrder    = [];
  let svgGroups    = [];
  let plannedRoute = [];
  let autoPlaying  = false;
  let paused       = false;
  let pauseResolve = null;
  let enabled      = localStorage.getItem('ar_enabled') !== '0';

  const SPRITES = {
    battle:     'sprites/grass.png',
    catch:      'sprites/catchPokemon.png',
    item:       'sprites/itemIcon.png',
    boss:       'sprites/misteryTrainer.png',
    pokecenter: 'sprites/Poke%20Center.png',
    trainer:    'sprites/aceTrainer.png',
    trade:      'sprites/catchPokemon.png',
    shiny:      'sprites/catchPokemon.png',
    moveTutor:  'sprites/moveTutor.png',
    question:   'sprites/questionMark.png',
    legendary:  'sprites/misteryTrainer.png',
    start:      'sprites/grass.png',
  };

  // ─── renderMap patchen ───────────────────────────────────────────────────────
  const _origRenderMap = window.renderMap;
  window.renderMap = function (map, container, onNodeClickOrig) {
    if (map !== liveMap) {
      plannedRoute = [];
      autoPlaying  = false;
      paused       = false;
    }
    liveMap   = map;
    nodeOrder = Object.values(map.nodes)
      .sort((a, b) => a.layer !== b.layer ? a.layer - b.layer : a.col - b.col);

    const result = _origRenderMap(map, container, onNodeClickOrig);
    const svg = container.querySelector('svg');
    if (svg) {
      svgGroups = [...svg.querySelectorAll('g[transform]')]
        .filter(g => g.getAttribute('transform')?.startsWith('translate('));
      if (enabled) setupInterception(container, svg);
    }
    refreshVisuals();
    updateUI();
    return result;
  };

  // ─── Map/Title Screen beobachten ─────────────────────────────────────────────
  new MutationObserver(() => {
    const ms = document.getElementById('map-screen');
    const ui = document.getElementById('ar-ui');
    if (!ui) return;
    const mapVisible = ms && getComputedStyle(ms).display !== 'none';
    ui.style.display = mapVisible ? 'flex' : 'none';

    const titleScreen  = document.getElementById('title-screen');
    const titleVisible = titleScreen && getComputedStyle(titleScreen).display !== 'none';
    if (titleVisible) {
      plannedRoute = [];
      autoPlaying  = false;
      paused       = false;
      liveMap      = null;
      updateUI();
      setStatus('');
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });

  // ─── SVG Click Interception ──────────────────────────────────────────────────
  let _captureHandler   = null;
  let _captureContainer = null;

  function setupInterception(container, svg) {
    if (_captureHandler && _captureContainer) {
      _captureContainer.removeEventListener('click', _captureHandler, true);
    }
    _captureContainer = container;
    _captureHandler = function (e) {
      if (!enabled || autoPlaying) return;
      const g = e.target.closest('g[transform]');
      if (!g) return;
      const idx = svgGroups.indexOf(g);
      if (idx < 0 || idx >= nodeOrder.length) return;
      const node = nodeOrder[idx];
      if (!node || node.visited || node.type === 'start') return;
      if (!node.revealed) return;

      // Für Layer-Swaps: gleichen Layer aus der Simulation ausschließen
      // damit der neue Node korrekt gegen die Route davor geprüft wird
      const sameLayerPlanned = plannedRoute.find(id => liveMap.nodes[id]?.layer === node.layer);
      const skipLayer = sameLayerPlanned ? node.layer : null;

      if (!isReachableGivenPlan(node.id, skipLayer)) return;

      e.stopPropagation();
      e.preventDefault();
      toggleNode(node);
    };
    container.addEventListener('click', _captureHandler, true);
  }

  function removeInterception() {
    if (_captureHandler && _captureContainer) {
      _captureContainer.removeEventListener('click', _captureHandler, true);
      _captureHandler = null;
    }
  }

  // ─── Route logic ─────────────────────────────────────────────────────────────

  // Prüft ob nodeId erreichbar ist gegeben:
  // - alle bereits visited Nodes im echten Game-State
  // - alle geplanten Nodes VOR dem Ziel-Layer
  // skipLayer: wenn gesetzt, wird dieser Layer in der Simulation übersprungen
  //            (für Layer-Swaps — wir ersetzen den alten Node, nicht addieren)
  function isReachableGivenPlan(nodeId, skipLayer = null) {
    const mapClone    = JSON.parse(JSON.stringify(liveMap));
    const targetLayer = liveMap.nodes[nodeId]?.layer ?? 999;

    // Schritt 1: Bereits besuchte Nodes in Layer-Reihenfolge simulieren
    Object.values(liveMap.nodes)
      .filter(n => n.visited)
      .sort((a, b) => a.layer - b.layer)
      .forEach(n => window.advanceFromNode(mapClone, n.id));

    // Schritt 2: Geplante Nodes simulieren die VOR dem Ziel-Layer liegen
    for (const plannedId of plannedRoute) {
      const plannedNode = liveMap.nodes[plannedId];
      if (!plannedNode) continue;
      if (plannedNode.layer >= targetLayer) break; // nichts nach Ziel-Layer simulieren
      if (skipLayer !== null && plannedNode.layer === skipLayer) continue; // swap-Layer überspringen
      window.advanceFromNode(mapClone, plannedId);
    }

    return mapClone.nodes[nodeId]?.accessible === true;
  }

  function toggleNode(node) {
    const idx = plannedRoute.indexOf(node.id);
    if (idx !== -1) {
      // Deselect — alles ab diesem Index entfernen
      plannedRoute = plannedRoute.slice(0, idx);
    } else {
      // Layer-Swap: alten Node dieses Layers und alles danach entfernen
      const sameLayerIdx = plannedRoute.findIndex(id => liveMap.nodes[id]?.layer === node.layer);
      if (sameLayerIdx !== -1) plannedRoute = plannedRoute.slice(0, sameLayerIdx);
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

    svg.querySelectorAll('.ar-marker').forEach(el => el.remove());
    if (!enabled) return;

    svgGroups.forEach((g, i) => {
      const node = nodeOrder[i];
      if (!node || node.visited || node.type === 'start') return;
      if (!plannedRoute.includes(node.id)) return;

      const pos    = plannedRoute.indexOf(node.id) + 1;
      const isNext = pos === 1;
      const color  = isNext ? '#00ff6a' : '#bf00ff';
      const sprite = SPRITES[node.type] || 'sprites/questionMark.png';

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('r', '22');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', '3.5');
      ring.setAttribute('stroke-dasharray', isNext ? 'none' : '4,3');
      ring.setAttribute('opacity', '1');
      ring.setAttribute('pointer-events', 'none');
      ring.classList.add('ar-marker');

      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', sprite);
      img.setAttribute('x', '10');
      img.setAttribute('y', '-28');
      img.setAttribute('width', '16');
      img.setAttribute('height', '16');
      img.setAttribute('image-rendering', 'pixelated');
      img.setAttribute('opacity', '0.95');
      img.setAttribute('pointer-events', 'none');
      img.classList.add('ar-marker');

      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', '27');
      badge.setAttribute('y', '-16');
      badge.setAttribute('text-anchor', 'middle');
      badge.setAttribute('font-size', '10');
      badge.setAttribute('font-weight', '700');
      badge.setAttribute('fill', color);
      badge.setAttribute('pointer-events', 'none');
      badge.classList.add('ar-marker');
      badge.textContent = pos;

      g.appendChild(ring);
      g.appendChild(img);
      g.appendChild(badge);
    });
  }

  // ─── waitForMapOrInteraction ──────────────────────────────────────────────────
  function waitForMapOrInteraction(timeout = 300000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        const ms = document.getElementById('map-screen');
        if (ms && getComputedStyle(ms).display !== 'none' && liveMap) {
          clearInterval(iv);
          setTimeout(() => resolve('map'), 500);
          return;
        }
        if (Date.now() - start > timeout) { clearInterval(iv); reject('timeout'); }
      }, 300);
    });
  }

  // ─── Pause helper ─────────────────────────────────────────────────────────────
  function waitIfPaused() {
    if (!paused) return Promise.resolve();
    return new Promise(resolve => { pauseResolve = resolve; });
  }

  // ─── Auto-Play ───────────────────────────────────────────────────────────────
  async function playRoute() {
    if (!plannedRoute.length) return;

    autoPlaying = true;
    paused      = false;
    updateUI();
    setStatus('▶ Running…', 'active');

    for (const nodeId of [...plannedRoute]) {
      if (!autoPlaying) break;

      await waitIfPaused();
      if (!autoPlaying) break;

      const node = liveMap?.nodes[nodeId];
      if (!node || node.visited) continue;
      if (!node.accessible) {
        setStatus('⚠ nicht erreichbar', 'warn');
        break;
      }

      const nodeIdx = nodeOrder.findIndex(n => n.id === nodeId);
      const svgG    = svgGroups[nodeIdx];
      if (!svgG) { setStatus('⚠ SVG-Node nicht gefunden', 'warn'); break; }

      setStatus(`→ ${nodeId}`, 'active');

      try {
        svgG.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await waitForMapOrInteraction();

        await waitIfPaused();
        if (!autoPlaying) break;

        plannedRoute = plannedRoute.filter(id => !liveMap?.nodes[id]?.visited);
        refreshVisuals();
        updateUI();
      } catch (e) {
        setStatus(`✗ ${e}`, 'error');
        break;
      }
    }

    autoPlaying  = false;
    paused       = false;
    pauseResolve = null;
    plannedRoute = plannedRoute.filter(id => !liveMap?.nodes[id]?.visited);
    refreshVisuals();
    updateUI();
    setStatus(plannedRoute.length === 0 ? '✓ Route fertig' : '■ Gestoppt');
  }

  function pauseRoute() {
    paused = true;
    setStatus('⏸ Pausiert', 'warn');
    updateUI();
  }

  function resumeRoute() {
    paused = false;
    setStatus('▶ Running…', 'active');
    updateUI();
    if (pauseResolve) { pauseResolve(); pauseResolve = null; }
  }

  function stopRoute() {
    autoPlaying  = false;
    paused       = false;
    if (pauseResolve) { pauseResolve(); pauseResolve = null; }
    plannedRoute = plannedRoute.filter(id => !liveMap?.nodes[id]?.visited);
    refreshVisuals();
    updateUI();
    setStatus('■ Gestoppt');
  }

  // ─── Enabled Toggle ──────────────────────────────────────────────────────────
  function setEnabled(val) {
    enabled = val;
    localStorage.setItem('ar_enabled', val ? '1' : '0');
    const btn = document.getElementById('ar-manual');
    if (btn) {
      btn.style.color = enabled
        ? 'rgba(235,235,245,0.25)'
        : 'rgba(251,191,36,0.9)';
      btn.title = enabled
        ? 'Manuell — Auto Route deaktivieren'
        : 'Manuell AKTIV — klicken um Auto Route zu aktivieren';
    }
    if (enabled) {
      const container = document.getElementById('map-container');
      const svg = container?.querySelector('svg');
      if (container && svg) setupInterception(container, svg);
    } else {
      removeInterception();
      if (autoPlaying) stopRoute();
      plannedRoute = [];
    }
    refreshVisuals();
    updateUI();
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────
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
        white-space: nowrap; display: none;
      }
      #ar-status-bar.active { color: rgba(74,222,128,0.9);   border-color: rgba(74,222,128,0.25);  display: block; }
      #ar-status-bar.warn   { color: rgba(251,191,36,0.85);  border-color: rgba(251,191,36,0.25);  display: block; }
      #ar-status-bar.error  { color: rgba(239,68,68,0.85);   border-color: rgba(239,68,68,0.25);   display: block; }
      #ar-controls {
        display: flex; align-items: center; gap: 6px;
        background: rgba(10,10,14,0.82);
        backdrop-filter: blur(12px);
        border: 0.5px solid rgba(255,255,255,0.1);
        border-radius: 999px; padding: 5px 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
      #ar-label {
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
        color: rgba(167,139,250,0.8);
      }
      #ar-count {
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 700;
        color: rgba(167,139,250,0.5);
        min-width: 14px; text-align: center;
      }
      .ar-divider { width: 0.5px; height: 14px; background: rgba(255,255,255,0.1); }
      #ar-play-pause {
        background: linear-gradient(135deg,#a78bfa,#8b5cf6);
        border: none; border-radius: 999px; color: #fff;
        font-size: 10px; font-weight: 700; padding: 5px 12px;
        cursor: pointer; letter-spacing: 0.04em; transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(167,139,250,0.3);
      }
      #ar-play-pause:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(167,139,250,0.45); }
      #ar-play-pause:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
      #ar-play-pause.pause  { background: linear-gradient(135deg,#f59e0b,#d97706); box-shadow: 0 2px 8px rgba(245,158,11,0.3); }
      #ar-play-pause.resume { background: linear-gradient(135deg,#4ade80,#22c55e); box-shadow: 0 2px 8px rgba(74,222,128,0.3); }
      #ar-stop {
        background: none; border: none; color: rgba(239,68,68,0.5);
        font-size: 11px; cursor: pointer; padding: 2px 3px;
        transition: color 0.15s; line-height: 1; display: none;
      }
      #ar-stop:hover { color: rgba(239,68,68,0.9); }
      #ar-stop.visible { display: block; }
      #ar-manual {
        background: none; border: none;
        font-family: ui-monospace,'SF Mono',monospace;
        font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
        cursor: pointer; padding: 2px 4px; transition: color 0.2s; line-height: 1;
      }
      #ar-clear {
        background: none; border: none; color: rgba(235,235,245,0.2);
        font-size: 12px; cursor: pointer; padding: 2px 3px;
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
        <span id="ar-label">ROUTE</span>
        <span id="ar-count">0</span>
        <div class="ar-divider"></div>
        <button id="ar-play-pause" disabled>▶ Play</button>
        <button id="ar-stop" title="Stoppen">■</button>
        <div class="ar-divider"></div>
        <button id="ar-manual" title="Manuell — Auto Route deaktivieren">MAN</button>
        <button id="ar-clear" title="Route leeren">✕</button>
      </div>
    `;
    document.body.appendChild(ui);

    document.getElementById('ar-play-pause').addEventListener('click', () => {
      if (!autoPlaying)   playRoute();
      else if (paused)    resumeRoute();
      else                pauseRoute();
    });
    document.getElementById('ar-stop').addEventListener('click', stopRoute);
    document.getElementById('ar-manual').addEventListener('click', () => setEnabled(!enabled));
    document.getElementById('ar-clear').addEventListener('click', () => {
      plannedRoute = [];
      refreshVisuals();
      updateUI();
      setStatus('');
    });

    setEnabled(enabled);
  }

  function setStatus(msg, type = '') {
    const el = document.getElementById('ar-status-bar');
    if (!el) return;
    el.textContent = msg;
    el.className   = type;
  }

  function updateUI() {
    if (!document.getElementById('ar-ui')) return;
    const count   = plannedRoute.length;
    const playBtn = document.getElementById('ar-play-pause');
    const stopBtn = document.getElementById('ar-stop');
    const countEl = document.getElementById('ar-count');

    if (countEl) countEl.textContent = count;

    if (playBtn) {
      if (!autoPlaying) {
        playBtn.disabled    = count === 0 || !enabled;
        playBtn.textContent = '▶ Play';
        playBtn.className   = '';
      } else if (paused) {
        playBtn.disabled    = false;
        playBtn.textContent = '▶ Resume';
        playBtn.className   = 'resume';
      } else {
        playBtn.disabled    = false;
        playBtn.textContent = '⏸ Pause';
        playBtn.className   = 'pause';
      }
    }

    if (stopBtn) stopBtn.className = autoPlaying ? 'visible' : '';
  }

  buildUI();

})();
