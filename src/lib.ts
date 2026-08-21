/**
 * @putervision/world-model-mcp Library Barrel Exports
 * Exposes core spatial engines, stores, schemas, types, and utility functions
 * for programmatic usage without running an MCP server or CLI.
 */

// Engines
export { EntityStore } from "./engine/entity-store.js";
export { SpatialGraph } from "./engine/spatial-graph.js";
export { PermanenceEngine } from "./engine/permanence.js";
export { SimulationEngine } from "./engine/simulation.js";
export { NavigationEngine } from "./engine/navigation.js";
export { VisionBridge } from "./engine/vision-bridge.js";
export { FrustumEngine } from "./engine/frustum.js";
export { GoalBridge } from "./engine/goal-bridge.js";
export { getWorldSummary } from "./engine/summary.js";
export { SnapshotEngine } from "./engine/snapshots.js";
export { exportWorldModel, exportTrajectories } from "./engine/export.js";
export { validateWorldModel } from "./engine/validate.js";
export { logEntityEvent, getEntityHistory, verifyEventAuditChain } from "./engine/events.js";
export { SpatialSpecEngine } from "./engine/spatial-spec.js";
export { EvidenceEngine } from "./engine/evidence.js";
export { SpatialBlackboard } from "./engine/blackboard.js";
export { TimeTravelEngine } from "./engine/time-travel.js";
export { waitForSpatialState } from "./engine/polling.js";
export { SchemaAdvisor } from "./engine/advisor.js";
export { GameControlsEngine } from "./engine/game-controls.js";
export { getBridgeScript } from "./browser/threejs-bridge.js";

// Database & Scaffolding
export { getDb, getReadOnlyDb, closeDb, closeAllDbs, getProjectSlug, registerProject, resolveProjectRoot } from "./engine/db.js";

// Schema & Types
export * from "./schema/types.js";
export * from "./schema/schemas.js";

// Row Mappers
export { parseEntityRow, parseRelationRow, parseRegionRow } from "./engine/row-mappers.js";

// Utilities
export { VERSION } from "./utils/version.js";
export { logger } from "./utils/logger.js";
export { validatePath } from "./utils/path-validator.js";
export * from "./utils/math.js";
export * from "./utils/projection.js";

