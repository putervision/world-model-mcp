# Multi-Agent Blackboard Example

Demonstrates parallel subagents coordinating intentions and claiming spatial resources.

```typescript
import { getDb, SpatialBlackboard } from "@putervision/world-model-mcp/lib";

const db = getDb("warehouse-sim");

// Agent 1 claims charging dock
const claim = SpatialBlackboard.claim(db, {
  project: "warehouse-sim",
  resource_id: "dock_alpha",
  agent_id: "robot_01",
  duration_seconds: 120,
});

// Agent 2 attempts to claim dock
const claimAttempt = SpatialBlackboard.claim(db, {
  project: "warehouse-sim",
  resource_id: "dock_alpha",
  agent_id: "robot_02",
});

console.log("Agent 2 Claim Success:", claimAttempt.success); // false
```
