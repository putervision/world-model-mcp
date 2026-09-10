# Spatial World Model Concepts: `@putervision/world-model-mcp`

`@putervision/world-model-mcp` maintains a persistent 3D/2D spatial internal world model, entity tracking, object permanence, movement simulation, and game input generation.

---

## 1. Object Permanence & Confidence Decay
Entities continue to exist in the world model even when outside the agent's field of view. The confidence score decays exponentially over time:
$$C(t) = C_0 \cdot e^{-\lambda \Delta t}$$
where default decay rate $\lambda = 0.05/\text{hr}$.
- $C \ge 0.5$: `active` (full confidence)
- $0.2 \le C < 0.5$: `hidden` (entity likely behind obstacle)
- $C < 0.2$: `lost` (entity candidate for re-identification or eviction)

Re-observing the entity restores confidence to $C = 1.0$.

---

## 2. Expected View Frustum & Raycasting Occlusion
Calculates visible entities from an observer pose (position, orientation) and FOV cone:
- Horizontal / Vertical frustum cone testing.
- Ray-AABB intersection testing against solid obstacle bounding boxes for line-of-sight occlusion culling.

---

## 3. Autonomous Game Input Generation (Browser & Desktop)
Translates 3D navigation waypoints and vectors into timed keyboard holds, mouse aiming, and jump sequences via `GameControlsEngine`:
- **Playwright MCP**: Emits tool calls (`browser_evaluate`, `browser_press_key`) for browser automation.
- **Linux Native Desktop (`xdotool_script`)**: Emits executable bash scripts (`xdotool keydown w; sleep 0.45; xdotool keyup w`) for native desktop games on Steam / Linux.
- **Windows Native Desktop (`powershell_script`)**: Emits PowerShell scripts using `[System.Windows.Forms.SendKeys]` for Windows desktop games.

---

## 4. Hybrid Perception & Telemetry Bridge
- **Active Game Engine Telemetry (`VisionBridge.ingestGameTelemetry`)**: Ingests direct telemetry objects (player HP, mana, coordinates, and entity AABB boxes) from `window.__PUTERVISION_GAME_STATE__` with zero perception latency.
- **Passive Vision Fallback (`VisionBridge.ingestObservation`)**: Ingests bounding boxes and labels detected from screenshots by `@putervision/vision-memory-mcp` with automatic spatial re-identification.

---

## 5. Spatial Spec-Driven Development (Spatial SDD)
Verifies physical spatial contracts (minimum clearance, maximum distance, region containment, and bounding box overlap) before committing movements.
