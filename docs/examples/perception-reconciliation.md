# Perception Reconciliation Example

Demonstrates ingesting vision perception detections and reconciling against the world model.

```typescript
import { getDb, VisionBridge } from "@putervision/world-model-mcp/lib";

const db = getDb("robotics-sim");

const report = VisionBridge.reconcileObservation(db, {
  project: "robotics-sim",
  observer_pose: {
    position: { x: 0, y: 1, z: 0 },
    orientation: { yaw: 35 },
  },
  detections: [
    {
      label: "Treasure Chest",
      estimated_position: { x: 12.1, y: 0, z: 7.9 },
      confidence: 0.95,
    },
  ],
});

console.log("Confirmed Entities:", report.confirmed);
console.log("Appeared Entities:", report.appeared);
console.log("Displaced Entities:", report.displaced);
```
