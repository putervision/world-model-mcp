import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "./utils/version.js";
import { registerAllTools } from "./tools/handlers.js";
import { registerAllPrompts } from "./tools/prompts.js";
import { getDb, getReadOnlyDb, getProjectSlug } from "./engine/db.js";
import { getWorldSummary } from "./engine/summary.js";
import { EntityStore } from "./engine/entity-store.js";
import { SpatialGraph } from "./engine/spatial-graph.js";
import { GoalBridge } from "./engine/goal-bridge.js";
import { exportWorldModel } from "./engine/export.js";

export const server = new McpServer({
  name: "io.github.putervision/world-model-mcp",
  version: VERSION,
});

function getVarString(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

// Register Resource Templates
server.registerResource(
  "world-summary",
  new ResourceTemplate("world-model:///{project}/summary", { list: undefined }),
  {
    title: "World Model Summary Template",
    description: "High-level environment overview, entity counts, bounds, and permanence health",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = getWorldSummary(db, { project });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-entities",
  new ResourceTemplate("world-model:///{project}/entities", { list: undefined }),
  {
    title: "World Model Active Entities Template",
    description: "List of active entities in the environment",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = EntityStore.listEntities(db, { project, limit: 100 });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-entity-details",
  new ResourceTemplate("world-model:///{project}/entity/{id}", { list: undefined }),
  {
    title: "Entity Details Template",
    description: "Entity position, bounding box, properties, and connected spatial relations",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const entityId = getVarString(variables.id) || '';
    const db = getReadOnlyDb(project);
    const entity = EntityStore.getEntity(db, { project, id: entityId });
    const relations = SpatialGraph.getRelations(db, { project, entity_id: entityId });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ entity, relations }, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-map",
  new ResourceTemplate("world-model:///{project}/map", { list: undefined }),
  {
    title: "Spatial Map Export Template",
    description: "Full spatial export of entities, relations, and regions",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = exportWorldModel(db, { project, format: "json" });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-goals",
  new ResourceTemplate("world-model:///{project}/goals", { list: undefined }),
  {
    title: "Goal Links Template",
    description: "Active state-memory goal links and entity associations",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const data = GoalBridge.getLinkedGoals(db, { project });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-health",
  new ResourceTemplate("world-model:///{project}/health", { list: undefined }),
  {
    title: "World Model Health Template",
    description: "Real-time health, SQLite status, and permanence metrics",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const summary = getWorldSummary(db, { project });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ version: VERSION, status: "healthy", ...summary }, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-specs",
  new ResourceTemplate("world-model:///{project}/specs", { list: undefined }),
  {
    title: "Spatial Specs Template",
    description: "Active Spatial SDD baseline contracts",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const { SpatialSpecEngine } = await import("./engine/spatial-spec.js");
    const data = SpatialSpecEngine.listSpatialSpecs(db, { project });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-blackboard",
  new ResourceTemplate("world-model:///{project}/blackboard", { list: undefined }),
  {
    title: "Spatial Blackboard Template",
    description: "Current active spatial blackboard messages",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const { SpatialBlackboard } = await import("./engine/blackboard.js");
    const data = SpatialBlackboard.read(db, { project, include_expired: false });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-evidence",
  new ResourceTemplate("world-model:///{project}/evidence", { list: undefined }),
  {
    title: "Evidence Packs Template",
    description: "Recent cryptographic spatial evidence packs",
    mimeType: "application/json",
  },
  async (uri: URL, variables) => {
    const project = getProjectSlug(getVarString(variables.project));
    const db = getReadOnlyDb(project);
    const { EvidenceEngine } = await import("./engine/evidence.js");
    const data = EvidenceEngine.listEvidencePacks(db, { project });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "world-health",
  "world:///health",
  {
    title: "World Model Server Health",
    description: "Server health status, version, and timestamp",
    mimeType: "application/json",
  },
  async (uri: URL) => {
    const project = getProjectSlug();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            status: "healthy",
            version: VERSION,
            project_slug: project,
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };
  }
);

// Register Tools & Prompts
registerAllTools(server);
registerAllPrompts(server);

