# Spatial World Model Concepts

## 1. Object Permanence & Confidence Decay
Entities continue to exist in the world model even when outside the agent's field of view. The confidence score decays over time:
$$C(t) = C_0 \cdot e^{-\lambda \Delta t}$$
where $\lambda = 0.05/\text{hr}$.
- $C \ge 0.5$: `active`
- $0.2 \le C < 0.5$: `hidden`
- $C < 0.2$: `lost`

Re-observing the entity restores $C = 1.0$.

## 2. Expected View Frustum & Raycasting Occlusion
Calculates what objects are within the agent's horizontal FOV cone and verifies line-of-sight against solid obstacle bounding boxes.

## 3. Spatial Spec-Driven Development (Spatial SDD)
Verifies physical contracts (clearance, bounds, containment) before executing movements.
