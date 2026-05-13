# pokelike-scripts

Tampermonkey userscripts for [pokelike.xyz](https://pokelike.xyz) — a Pokemon Roguelike browser game.

> Requires [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/). Does not work with Greasemonkey 4+.

---

## Scripts

### ⚡ Pokelike Battle Speed
Speeds up or fully skips battle animations for faster runs.

**Modes (toggle independently):**
- **SPEED** — reduces round delays from 300ms to ~1ms
- **SKIP** — skips battle animations entirely, only calculates the result

A small overlay appears bottom-right. Click to toggle between modes. Only one mode can be active at a time.

---

### 🗺️ Pokelike Auto Route
Plan your map route by clicking nodes directly on the game map, then let the script auto-play it.

**How to use:**
1. Start a run and open the map
2. Click any node to add it to your route (one per layer)
3. Click again to deselect (removes all subsequent nodes too)
4. Hit **▶ Play** to auto-play the planned route

**Visuals:**
- 🟢 Green ring = next node to be played
- 🟣 Purple ring = planned later in the route
- Number badge = position in route

The overlay hides automatically when the map is not visible and resets on game over or new run.

---

## Installation

Click the **Raw** button on any script file → Tampermonkey will prompt to install automatically.

---

## Notes

- All scripts are client-side only — no server communication
- Save data is stored in your browser's localStorage
- Use at your own risk
