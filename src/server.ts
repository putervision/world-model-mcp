import { NativeMcpServer, NativeResourceTemplate } from "./transport/native-mcp.js";
import { VERSION } from "./utils/version.js";
import { registerAllTools } from "./tools/handlers.js";
import { registerAllPrompts } from "./tools/prompts.js";
import { getDb, getReadOnlyDb, getProjectSlug } from "./engine/db.js";
import { getWorldSummary } from "./engine/summary.js";
import { EntityStore } from "./engine/entity-store.js";
import { SpatialGraph } from "./engine/spatial-graph.js";
import { GoalBridge } from "./engine/goal-bridge.js";
import { exportWorldModel } from "./engine/export.js";
import { toolDefinitions } from "./tools/definitions.js";

function getVarString(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export function registerAllResources(server: any): void {
// Register Resource Templates
server.registerResource(
  "world-summary",
  new NativeResourceTemplate("world-model:///{project}/summary", { list: undefined }),
  {
    title: "World Model Summary Template",
    description: "High-level environment overview, entity counts, bounds, and permanence health",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/entities", { list: undefined }),
  {
    title: "World Model Active Entities Template",
    description: "List of active entities in the environment",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/entity/{id}", { list: undefined }),
  {
    title: "Entity Details Template",
    description: "Entity position, bounding box, properties, and connected spatial relations",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/map", { list: undefined }),
  {
    title: "Spatial Map Export Template",
    description: "Full spatial export of entities, relations, and regions",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/goals", { list: undefined }),
  {
    title: "Goal Links Template",
    description: "Active state-memory goal links and entity associations",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/health", { list: undefined }),
  {
    title: "World Model Health Template",
    description: "Real-time health, SQLite status, and permanence metrics",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/specs", { list: undefined }),
  {
    title: "Spatial Specs Template",
    description: "Active Spatial SDD baseline contracts",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/blackboard", { list: undefined }),
  {
    title: "Spatial Blackboard Template",
    description: "Current active spatial blackboard messages",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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
  new NativeResourceTemplate("world-model:///{project}/evidence", { list: undefined }),
  {
    title: "Evidence Packs Template",
    description: "Recent cryptographic spatial evidence packs",
    mimeType: "application/json",
  },
  async (uri: URL, variables: any) => {
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

  // Register pv://docs/... documentation resources (E13)
  for (const tool of toolDefinitions) {
    server.registerResource(
      `docs-${tool.name}`,
      `pv://docs/${tool.name}`,
      {
        title: `${tool.name} Documentation`,
        description: `Complete parameter schema and documentation for ${tool.name}`,
        mimeType: "application/json",
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      })
    );
  }

  server.registerResource(
    "tool-docs-template",
    new NativeResourceTemplate("pv://docs/{toolName}", { list: undefined }),
    {
      title: "Tool Documentation Template",
      description: "Fetch detailed tool documentation and parameter schema via pv://docs/{toolName}",
      mimeType: "application/json",
    },
    async (uri: URL, variables: any) => {
      const toolName = Array.isArray(variables.toolName) ? variables.toolName[0] : variables.toolName;
      const tool = toolDefinitions.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Documentation not found for tool: "${toolName}"`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

export function createNativeServer(): NativeMcpServer {
  const native = new NativeMcpServer({
    name: "io.github.putervision/world-model-mcp",
    version: VERSION,
  });

  registerAllResources(native);
  registerAllTools(native);
  registerAllPrompts(native);

  return native;
}

export const server = createNativeServer();

