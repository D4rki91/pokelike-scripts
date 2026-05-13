// ==UserScript==
// @name         Pokelike Battle Speed
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Speed up or fully skip battle animations
// @match        https://pokelike.xyz/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // 'speed' | 'skip' | null
  const CONFIG = { mode: null, threshold: 100, replacement: 1 };

  // ─── Timeout Patch ───────────────────────────────────────────────────────────
  const _setTimeout = window.setTimeout.bind(window);
  window.setTimeout = function (fn, delay, ...args) {
    const d = (CONFIG.mode === 'speed' && delay >= CONFIG.threshold) ? CONFIG.replacement : delay;
    return _setTimeout(fn, d, ...args);
  };

  // ─── Skip Patch ──────────────────────────────────────────────────────────────
  window.addEventListener('load', () => {
    const origAnim = window.animateBattleVisually;
    window.animateBattleVisually = async function (detailedLog, pTeamInit, eTeamInit) {
      if (CONFIG.mode !== 'skip') return origAnim(detailedLog, pTeamInit, eTeamInit);
      if (detailedLog?.length && window.renderBattleField) {
        const last = detailedLog[detailedLog.length - 1];
        window.renderBattleField(last?.pTeam || pTeamInit, last?.eTeam || eTeamInit);
      }
      return Promise.resolve();
    };
  });

  // ─── Overlay ─────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.id = 'bs-overlay';
    el.innerHTML = `
      <span id="bs-icon">⚡</span>
      <div class="bs-row" id="bs-row-speed" data-mode="speed">
        <span class="bs-label">SPEED</span>
        <div class="bs-pill"><div class="bs-thumb"></div></div>
      </div>
      <div class="bs-divider"></div>
      <div class="bs-row" id="bs-row-skip" data-mode="skip">
        <span class="bs-label">SKIP</span>
        <div class="bs-pill"><div class="bs-thumb"></div></div>
      </div>
    `;
    document.body.appendChild(el);

    const style = document.createElement('style');
    style.textContent = `
      #bs-overlay {
        position: fixed;
        bottom: 18px; right: 18px; z-index: 999999;
        display: flex; align-items: center; gap: 8px;
        background: rgba(10,10,14,0.82);
        backdrop-filter: blur(12px);
        border: 0.5px solid rgba(255,255,255,0.1);
        border-radius: 999px;
        padding: 6px 10px 6px 9px;
        user-select: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
      #bs-icon { font-size: 12px; line-height: 1; }
      .bs-row {
        display: flex; align-items: center; gap: 5px;
        cursor: pointer; padding: 2px 0;
        transition: opacity 0.2s;
      }
      .bs-row.disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }
      .bs-label {
        font-family: ui-monospace, 'SF Mono', monospace;
        font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
        color: rgba(235,235,245,0.35);
        transition: color 0.2s;
      }
      .bs-row.on .bs-label { color: rgba(74,222,128,0.9); }
      .bs-divider { width: 0.5px; height: 14px; background: rgba(255,255,255,0.1); }
      .bs-pill {
        width: 28px; height: 16px; border-radius: 999px;
        background: rgba(255,255,255,0.08);
        position: relative; transition: background 0.25s; flex-shrink: 0;
      }
      .bs-row.on .bs-pill { background: rgba(74,222,128,0.8); }
      .bs-thumb {
        position: absolute; top: 2px; left: 2px;
        width: 12px; height: 12px; border-radius: 50%;
        background: rgba(255,255,255,0.5);
        transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), background 0.25s;
      }
      .bs-row.on .bs-thumb { transform: translateX(12px); background: #fff; }
    `;
    document.head.appendChild(style);

    function update() {
      ['speed', 'skip'].forEach(mode => {
        const row = document.getElementById(`bs-row-${mode}`);
        const isActive = CONFIG.mode === mode;
        const isDisabled = CONFIG.mode !== null && !isActive;
        row.classList.toggle('on', isActive);
        row.classList.toggle('disabled', isDisabled);
      });
    }

    document.querySelectorAll('.bs-row').forEach(row => {
      row.addEventListener('click', () => {
        const mode = row.dataset.mode;
        // nochmal klicken → ausschalten
        CONFIG.mode = CONFIG.mode === mode ? null : mode;
        update();
      });
    });

    update();
  });

  console.log('[BattleSpeed] v2.1 Loaded');
})();