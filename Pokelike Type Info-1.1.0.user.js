// ==UserScript==
// @name         Pokelike Type Info
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Shows type weaknesses and resistances directly inside Pokemon cards
// @match        https://pokelike.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CHART = {
    Normal:   { Rock: 0.5, Ghost: 0, Steel: 0.5 },
    Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
    Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
    Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
    Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
    Ice:      { Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
    Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
    Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
    Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
    Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
    Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
    Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
    Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
    Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
    Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
    Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
    Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
    Fairy:    { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
  };

  const TYPE_COLORS = {
    Normal:   '#9a9a6e', Fire:     '#cc6010', Water:    '#4068d0',
    Electric: '#c8a800', Grass:    '#5a9a30', Ice:      '#60b8b4',
    Fighting: '#a01818', Poison:   '#882880', Ground:   '#c09030',
    Flying:   '#8868d8', Psychic:  '#d82860', Bug:      '#788000',
    Rock:     '#948018', Ghost:    '#503878', Dragon:   '#5020e0',
    Dark:     '#503828', Steel:    '#8888a8', Fairy:    '#c05888',
  };

  const ALL_TYPES = Object.keys(CHART);

  function calcDefenses(types) {
    const groups = { '4x': [], '2x': [], '0.5x': [], '0.25x': [], '0x': [] };
    ALL_TYPES.forEach(attackType => {
      let mult = 1;
      types.forEach(defType => { mult *= (CHART[attackType]?.[defType] ?? 1); });
      if      (mult === 4)    groups['4x'].push(attackType);
      else if (mult === 2)    groups['2x'].push(attackType);
      else if (mult === 0.5)  groups['0.5x'].push(attackType);
      else if (mult === 0.25) groups['0.25x'].push(attackType);
      else if (mult === 0)    groups['0x'].push(attackType);
    });
    return groups;
  }

  function badge(type, extraClass, mult) {
    const col = TYPE_COLORS[type] || '#555';
    const multLabel = mult ? `<span class="ti-mult-label">${mult}</span>` : '';
    return `<span class="ti-badge ${extraClass}" style="--tc:${col}">${type}${multLabel}</span>`;
  }

  function typeInfoHTML(types) {
    if (!types?.length) return '';
    const def = calcDefenses(types);

    const hasWeak   = def['4x'].length || def['2x'].length;
    const hasResist = def['0.5x'].length || def['0.25x'].length;
    const hasImmune = def['0x'].length;
    if (!hasWeak && !hasResist && !hasImmune) return '';

    let html = '<div class="ti-box">';

    if (hasWeak) {
      html += '<div class="ti-section">';
      html += '<div class="ti-section-head ti-head-weak"><span class="ti-head-icon">▲</span> Weak</div>';
      html += '<div class="ti-badges">';
      def['4x'].forEach(t => { html += badge(t, 'ti-4x',  '4×'); });
      def['2x'].forEach(t => { html += badge(t, 'ti-2x',  '2×'); });
      html += '</div></div>';
    }

    if (hasResist) {
      html += '<div class="ti-section">';
      html += '<div class="ti-section-head ti-head-resist"><span class="ti-head-icon">▼</span> Resist</div>';
      html += '<div class="ti-badges">';
      def['0.25x'].forEach(t => { html += badge(t, 'ti-025x', '¼'); });
      def['0.5x'].forEach(t =>  { html += badge(t, 'ti-05x',  '½'); });
      html += '</div></div>';
    }

    if (hasImmune) {
      html += '<div class="ti-section">';
      html += '<div class="ti-section-head ti-head-immune"><span class="ti-head-icon">◆</span> Immune</div>';
      html += '<div class="ti-badges">';
      def['0x'].forEach(t => { html += badge(t, 'ti-0x', '0'); });
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  function injectStyles() {
    if (document.getElementById('ti-styles')) return;
    const style = document.createElement('style');
    style.id = 'ti-styles';
    style.textContent = `
      .ti-box {
        margin-top: 10px;
        padding: 8px 10px;
        background: rgba(0,0,0,0.3);
        border-radius: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .ti-section {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .ti-section-head {
        font-family: ui-monospace, 'SF Mono', monospace;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ti-head-icon { font-size: 7px; }
      .ti-head-weak   { color: rgba(255, 90, 90, 0.9); }
      .ti-head-resist { color: rgba(80, 210, 130, 0.9); }
      .ti-head-immune { color: rgba(180, 150, 255, 0.9); }

      .ti-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .ti-badge {
        position: relative;
        font-size: 10px;
        font-weight: 700;
        border-radius: 6px;
        padding: 3px 7px;
        color: #fff;
        letter-spacing: 0.02em;
        background: var(--tc);
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 4px;
        line-height: 1;
      }

      .ti-mult-label {
        font-size: 9px;
        font-weight: 900;
        opacity: 0.85;
        margin-left: 1px;
      }

      /* Weak glow */
      .ti-4x  { box-shadow: 0 0 8px rgba(255,60,60,0.55), 0 0 0 1.5px rgba(255,60,60,0.5); }
      .ti-2x  { box-shadow: 0 0 4px rgba(255,100,100,0.3); }

      /* Resist slightly dimmed */
      .ti-05x  { opacity: 0.8; }
      .ti-025x { box-shadow: 0 0 6px rgba(60,220,120,0.4), 0 0 0 1.5px rgba(60,220,120,0.4); }

      /* Immune outline */
      .ti-0x {
        background: rgba(0,0,0,0.4) !important;
        box-shadow: 0 0 0 1.5px var(--tc);
        color: rgba(255,255,255,0.7);
      }
    `;
    document.head.appendChild(style);
  }

  function patchRenderPokemonCard() {
    const orig = window.renderPokemonCard;
    if (!orig || orig.__tiPatched) return;

    window.renderPokemonCard = function (pokemon, ...args) {
      const html  = orig(pokemon, ...args);
      const types = pokemon?.types || [];
      if (!types.length) return html;
      const info  = typeInfoHTML(types);
      if (!info) return html;
      return html.replace(/(<\/div>\s*)$/, info + '$1');
    };
    window.renderPokemonCard.__tiPatched = true;
  }

  injectStyles();

  if (window.renderPokemonCard) {
    patchRenderPokemonCard();
  } else {
    const iv = setInterval(() => {
      if (window.renderPokemonCard) { patchRenderPokemonCard(); clearInterval(iv); }
    }, 300);
  }

})();
