# Spatial Navigation Example

Step-by-step example of creating 3D entities, testing line-of-sight visibility with occlusion, and simulating collision-free movement.

```typescript
import { getDb, EntityStore, FrustumEngine, SimulationEngine } from "@putervision/world-model-mcp/lib";

const db = getDb("robotics-sim");

// 1. Create Agent and Target Entity
const agent = EntityStore.addEntity(db, {
  project: "robotics-sim",
  name: "Explorer Drone",
  type: "agent",
  position: { x: 0, y: 1, z: 0 },
});

const chest = EntityStore.addEntity(db, {
  project: "robotics-sim",
  name: "Treasure Chest",
  type: "container",
  position: { x: 12, y: 0, z: 8 },
});

// 2. Check Expected View with Occlusion
const view = FrustumEngine.getExpectedView(db, {
  project: "robotics-sim",
  observer_position: { x: 0, y: 1, z: 0 },
  observer_orientation: { yaw: 35 },
  fov_degrees: 90,
});

console.log("Visible Entities:", view.visible_entities.map(e => e.entity.name));

// 3. Simulate Movement toward Chest
const sim = SimulationEngine.simulateMovement(db, {
  project: "robotics-sim",
  entity_id: agent.id,
  target_position: { x: 10, y: 1, z: 7 },
  check_collisions: true,
});

console.log("Movement valid without collision:", sim.can_reach_target);
```
