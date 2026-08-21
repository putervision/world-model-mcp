import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getWorldSummary } from '../engine/summary.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { EntityStore } from '../engine/entity-store.js';

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt(
    'explore-surroundings',
    {
      title: 'Explore Surroundings',
      description: "Generate spatial context and environment awareness prompt for agent's location",
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
        agent_entity_id: z.string().optional().describe('Agent entity ID'),
      },
    },
    async (args) => {
      const project = getProjectSlug(args.project);
      const db = getDb(project);
      const summary = getWorldSummary(db, { project });

      let agentPosText = 'Unknown';
      if (args.agent_entity_id) {
        const agent = EntityStore.getEntity(db, { project, id: args.agent_entity_id });
        if (agent && agent.position) {
          agentPosText = `(${agent.position.x}, ${agent.position.y}, ${agent.position.z})`;
        }
      }

      return {
        description: 'Explore agent surroundings',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are orienting in project "${project}".\n\nAgent Position: ${agentPosText}\nTotal Entities Known: ${summary.total_entities}\nTotal Regions: ${summary.total_regions}\nPermanence Average Confidence: ${summary.permanence_health.average_confidence}\n\nPlease analyze the current world state, inspect nearby entities with query_entities, and outline next exploration steps.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'plan-navigation',
    {
      title: 'Plan Navigation',
      description: 'Generate navigation and movement plan between entities',
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
        start_entity_id: z.string().describe('Starting entity ID'),
        target_entity_id: z.string().describe('Destination entity ID'),
      },
    },
    async (args) => {
      const project = getProjectSlug(args.project);
      return {
        description: 'Plan spatial navigation',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Plan a navigation path in project "${project}" from entity "${args.start_entity_id}" to destination "${args.target_entity_id}".\n\nUse simulate_movement(mode: 'navigate') and simulate_movement(check_collisions: true) to verify the path is obstacle-free.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'diagnose-spatial-anomalies',
    {
      title: 'Diagnose Spatial Anomalies',
      description:
        'Analyze world model for physical overlaps, orphan relations, and permanence decay anomalies',
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
      },
    },
    async (args) => {
      const project = getProjectSlug(args.project);
      const db = getDb(project);
      const { SchemaAdvisor } = await import('../engine/advisor.js');
      const crossRef = SchemaAdvisor.validateCrossMemoryRefs(db, { project });
      const summary = getWorldSummary(db, { project });

      return {
        description: 'Diagnose spatial anomalies in world model',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Diagnose spatial anomalies for project "${project}":\n\n- Active Entities: ${summary.total_entities}\n- Permanence Health: ${(summary.permanence_health.average_confidence * 100).toFixed(1)}%\n- Decayed Entities: ${summary.permanence_health.decayed_entities_count}\n- Cross-Memory Valid: ${crossRef.valid}\n- Issues Found: ${crossRef.issues.length}\n${crossRef.issues.map((i) => `  * ${i}`).join('\n')}\n\nPlease inspect the identified anomalies, reconcile perceptions, and recommend corrections.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'navigate-game-world',
    {
      title: 'Navigate Game World (Playwright & Three.js/2D)',
      description:
        'Step-by-step perception-action loop recipe for autonomous game navigation with Playwright and Three.js/2D canvas',
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
        agent_entity_id: z.string().describe('Player or agent entity ID'),
        target_entity_id: z.string().describe('Target destination entity or item ID'),
        control_scheme: z
          .string()
          .optional()
          .describe('Control scheme (wasd, arrows, click_to_move)'),
      },
    },
    async (args) => {
      const project = getProjectSlug(args.project);
      const scheme = args.control_scheme || 'wasd';

      return {
        description: 'Execute autonomous game navigation with Playwright',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Execute autonomous game navigation in project "${project}":

1. **Extract Scene**: Use Playwright \`browser_evaluate\` with \`window.__WORLD_MODEL_BRIDGE.extractScene()\` to extract live Three.js meshes and camera pose. Pass detections to \`ingest_observation\`.
2. **Orient**: Call \`get_expected_view\` from the current observer pose to confirm target "${args.target_entity_id}" is visible.
3. **Plan Path**: Call \`simulate_movement(mode: 'navigate')\` from "${args.agent_entity_id}" to "${args.target_entity_id}", and verify with \`simulate_movement(check_collisions: true)\`.
4. **Generate Inputs**: Call \`generate_game_inputs(entity_id: "${args.agent_entity_id}", target_entity_id: "${args.target_entity_id}", control_profile: { scheme: "${scheme}" })\`.
5. **Execute**: Run the generated Playwright MCP commands (\`browser_evaluate\` keydown/keyup sequences or \`browser_click\`).
6. **Verify & Reconcile**: Re-evaluate \`extractScene()\` and call \`ingest_observation(reconcile: true)\` to confirm the agent arrived at the destination.
7. **Record Outcome**: Call \`record_outcome(action_name: "navigate", success: true)\` to log the completed movement.`,
            },
          },
        ],
      };
    }
  );
}
