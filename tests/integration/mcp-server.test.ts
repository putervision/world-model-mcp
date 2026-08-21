import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../../src/server.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

const PROJECT = 'test-mcp-server-all-tools';

describe('MCP Server Integration — Complete Tool, Prompt & Resource Suite', () => {
  let client: Client;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  beforeEach(() => {
    const db = getDb(PROJECT);
    db.prepare('DELETE FROM entities WHERE project = ?').run(PROJECT);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(PROJECT);
    db.prepare('DELETE FROM goal_links WHERE project = ?').run(PROJECT);
    db.prepare('DELETE FROM observations WHERE project = ?').run(PROJECT);
  });

  afterAll(async () => {
    await client?.close();
    await server?.close();
    closeAllDbs();
  });

  it('lists and tests all 15 consolidated MCP tools comprehensively', async () => {
    // Verify tool count
    const toolList = await client.listTools();
    expect(toolList.tools.length).toBe(15);

    // 1. update_entity (create)
    const createRes = await client.callTool({
      name: 'update_entity',
      arguments: {
        project: PROJECT,
        name: 'Grand Castle',
        type: 'landmark',
        position: { x: 10, y: 0, z: 20 },
        bounding_box: { width: 10, height: 15, depth: 10 },
        properties: { defense: 100 },
        tags: ['fortress', 'royal'],
      },
    });
    expect(createRes.isError).toBeFalsy();
    const castle = JSON.parse((createRes.content as any)[0].text);
    expect(castle.id).toBeDefined();

    // 1b. update_entity (update existing)
    const updateRes = await client.callTool({
      name: 'update_entity',
      arguments: {
        project: PROJECT,
        id: castle.id,
        name: 'Grand Castle Fortified',
        type: 'landmark',
        properties: { defense: 150 },
      },
    });
    expect(updateRes.isError).toBeFalsy();
    const updatedCastle = JSON.parse((updateRes.content as any)[0].text);
    expect(updatedCastle.name).toBe('Grand Castle Fortified');

    // Create a second entity (Gold Chest)
    const chestRes = await client.callTool({
      name: 'update_entity',
      arguments: {
        project: PROJECT,
        name: 'Royal Chest',
        type: 'container',
        position: { x: 12, y: 0, z: 22 },
        properties: { gold: 500 },
      },
    });
    const chest = JSON.parse((chestRes.content as any)[0].text);

    // 2. query_entities (search + location lookup)
    const queryRes = await client.callTool({
      name: 'query_entities',
      arguments: {
        project: PROJECT,
        query: 'Castle',
        near_position: { x: 0, y: 0, z: 0 },
        max_distance: 50,
      },
    });
    const queryList = JSON.parse((queryRes.content as any)[0].text);
    expect(queryList.length).toBeGreaterThan(0);

    const locRes = await client.callTool({
      name: 'query_entities',
      arguments: {
        project: PROJECT,
        entity_id: castle.id,
        include_history: true,
      },
    });
    const loc = JSON.parse((locRes.content as any)[0].text);
    expect(loc.position.x).toBe(10);
    expect(loc.history.length).toBeGreaterThan(0);

    // 3. set_relation
    const relRes = await client.callTool({
      name: 'set_relation',
      arguments: {
        project: PROJECT,
        source_id: castle.id,
        relation: 'contains',
        target_id: chest.id,
      },
    });
    const rel = JSON.parse((relRes.content as any)[0].text);
    expect(rel.relation).toBe('contains');

    // 4. get_spatial_map (json, geojson, summary)
    const mapJson = await client.callTool({
      name: 'get_spatial_map',
      arguments: { project: PROJECT, format: 'json' },
    });
    expect(JSON.parse((mapJson.content as any)[0].text).entities.length).toBe(2);

    const mapGeo = await client.callTool({
      name: 'get_spatial_map',
      arguments: { project: PROJECT, format: 'geojson' },
    });
    expect(JSON.parse((mapGeo.content as any)[0].text).type).toBe('FeatureCollection');

    const sumRes = await client.callTool({
      name: 'get_spatial_map',
      arguments: { project: PROJECT, format: 'summary' },
    });
    const sum = JSON.parse((sumRes.content as any)[0].text);
    expect(sum.total_entities).toBeGreaterThan(0);

    // 5. simulate_movement (simulation + navigation modes)
    const simRes = await client.callTool({
      name: 'simulate_movement',
      arguments: {
        project: PROJECT,
        entity_id: castle.id,
        delta_position: { x: 5, y: 0, z: 5 },
        check_collisions: false,
      },
    });
    const sim = JSON.parse((simRes.content as any)[0].text);
    expect(sim.projected_position.x).toBe(15);

    const navRes = await client.callTool({
      name: 'simulate_movement',
      arguments: {
        project: PROJECT,
        mode: 'navigate',
        start_entity_id: castle.id,
        target_entity_id: chest.id,
      },
    });
    const nav = JSON.parse((navRes.content as any)[0].text);
    expect(nav.path_found).toBe(true);

    // 6. ingest_observation (ingest + reconcile)
    const obsRes = await client.callTool({
      name: 'ingest_observation',
      arguments: {
        project: PROJECT,
        observer_pose: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { yaw: 0 },
        },
        detections: [
          {
            label: 'Patrol Guard',
            class_name: 'npc',
            confidence: 0.95,
            estimated_position: { x: 2, y: 0, z: 8 },
          },
        ],
      },
    });
    const obs = JSON.parse((obsRes.content as any)[0].text);
    expect(obs.observation.id).toBeDefined();

    const recRes = await client.callTool({
      name: 'ingest_observation',
      arguments: {
        project: PROJECT,
        reconcile: true,
        observer_pose: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { yaw: 0 },
        },
        detections: [
          {
            label: 'Patrol Guard',
            class_name: 'npc',
            confidence: 0.95,
            estimated_position: { x: 2, y: 0, z: 8 },
          },
        ],
      },
    });
    const rec = JSON.parse((recRes.content as any)[0].text);
    expect(rec.observation || rec.reconciliation).toBeDefined();

    // 7. get_expected_view
    const expRes = await client.callTool({
      name: 'get_expected_view',
      arguments: {
        project: PROJECT,
        observer_position: { x: 0, y: 0, z: 0 },
        observer_orientation: { yaw: 0 },
        fov_degrees: 90,
      },
    });
    const expView = JSON.parse((expRes.content as any)[0].text);
    expect(expView.visible_entities).toBeDefined();

    // 8. link_to_goal (link + get_context)
    const goalRes = await client.callTool({
      name: 'link_to_goal',
      arguments: {
        project: PROJECT,
        task_id: 'task-conquer-castle',
        entity_id: castle.id,
        relationship: 'target',
      },
    });
    const goalLink = JSON.parse((goalRes.content as any)[0].text);
    expect(goalLink.task_id).toBe('task-conquer-castle');

    const ctxRes = await client.callTool({
      name: 'link_to_goal',
      arguments: {
        project: PROJECT,
        action: 'get_context',
        task_id: 'task-conquer-castle',
        current_agent_position: { x: 0, y: 0, z: 0 },
        radius: 50,
      },
    });
    const ctx = JSON.parse((ctxRes.content as any)[0].text);
    expect(ctx.goal_targets.length).toBe(1);

    // 9. record_outcome
    const outRes = await client.callTool({
      name: 'record_outcome',
      arguments: {
        project: PROJECT,
        action_name: 'loot_chest',
        success: true,
        entity_id: chest.id,
        property_changes: { gold: 0, is_looted: true },
      },
    });
    const outcome = JSON.parse((outRes.content as any)[0].text);
    expect(outcome.success).toBe(true);

    // 10. manage_spatial_spec
    const specRes = await client.callTool({
      name: 'manage_spatial_spec',
      arguments: {
        project: PROJECT,
        action: 'set',
        name: 'castle-clearance',
        constraints: [
          {
            type: 'min_clearance',
            entity_id: castle.id,
            target_id: chest.id,
            value: 0.5,
          },
        ],
      },
    });
    expect(specRes.isError).toBeFalsy();

    const verifySpecRes = await client.callTool({
      name: 'manage_spatial_spec',
      arguments: {
        project: PROJECT,
        action: 'verify',
        name: 'castle-clearance',
      },
    });
    const specVerification = JSON.parse((verifySpecRes.content as any)[0].text);
    expect(specVerification.spec_name).toBe('castle-clearance');

    // 11. create_evidence_pack
    const evidenceRes = await client.callTool({
      name: 'create_evidence_pack',
      arguments: {
        project: PROJECT,
        task_id: 'task-conquer-castle',
        entity_ids: [castle.id, chest.id],
      },
    });
    const pack = JSON.parse((evidenceRes.content as any)[0].text);
    expect(pack.payload_hash).toHaveLength(64);

    // 12. use_spatial_blackboard
    const bbRes = await client.callTool({
      name: 'use_spatial_blackboard',
      arguments: {
        project: PROJECT,
        action: 'post',
        topic: 'scout:alerts',
        sender: 'scout_agent',
        payload: { alert: 'Castle defended' },
      },
    });
    const bbItem = JSON.parse((bbRes.content as any)[0].text);
    expect(bbItem.item.topic).toBe('scout:alerts');

    // 13. manage_snapshot (save, list, undo)
    const snapRes = await client.callTool({
      name: 'manage_snapshot',
      arguments: {
        project: PROJECT,
        action: 'save',
        name: 'castle_state_v1',
      },
    });
    expect(snapRes.isError).toBeFalsy();

    const undoRes = await client.callTool({
      name: 'manage_snapshot',
      arguments: {
        project: PROJECT,
        action: 'undo',
      },
    });
    expect(undoRes.isError).toBeFalsy();

    // 14. generate_game_inputs (inputs + projection)
    const inputsRes = await client.callTool({
      name: 'generate_game_inputs',
      arguments: {
        project: PROJECT,
        entity_id: castle.id,
        target_entity_id: chest.id,
        control_profile: { scheme: 'wasd' },
      },
    });
    expect(inputsRes.isError).toBeFalsy();

    const projRes = await client.callTool({
      name: 'generate_game_inputs',
      arguments: {
        project: PROJECT,
        action: 'project_screen',
        entity_id: chest.id,
        camera: {
          position: { x: 0, y: 10, z: 0 },
          orientation: { pitch: -45, yaw: 0, roll: 0 },
        },
      },
    });
    expect(projRes.isError).toBeFalsy();

    // 15. wait_for_spatial_state
    const waitRes = await client.callTool({
      name: 'wait_for_spatial_state',
      arguments: {
        project: PROJECT,
        entity_id: castle.id,
        condition: 'exists',
        timeout_ms: 1000,
      },
    });
    const waitStatus = JSON.parse((waitRes.content as any)[0].text);
    expect(waitStatus.satisfied).toBe(true);
  });

  it('lists and calls MCP Prompts', async () => {
    const prompts = await client.listPrompts();
    expect(prompts.prompts.length).toBe(4);

    const explorePrompt = await client.getPrompt({
      name: 'explore-surroundings',
      arguments: { project: PROJECT },
    });
    expect(explorePrompt.messages.length).toBeGreaterThan(0);

    const navPrompt = await client.getPrompt({
      name: 'plan-navigation',
      arguments: { project: PROJECT, start_entity_id: 'e1', target_entity_id: 'e2' },
    });
    expect(navPrompt.messages.length).toBeGreaterThan(0);

    const anomalyPrompt = await client.getPrompt({
      name: 'diagnose-spatial-anomalies',
      arguments: { project: PROJECT },
    });
    expect(anomalyPrompt.messages.length).toBeGreaterThan(0);

    const gameNavPrompt = await client.getPrompt({
      name: 'navigate-game-world',
      arguments: { project: PROJECT, agent_entity_id: 'e1', target_entity_id: 'e2' },
    });
    expect(gameNavPrompt.messages.length).toBeGreaterThan(0);
  });

  it('reads MCP Resource templates', async () => {
    const sumResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/summary',
    });
    expect((sumResource.contents[0] as any).text).toContain(PROJECT);

    const entitiesResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/entities',
    });
    expect((entitiesResource.contents[0] as any).text).toBeDefined();

    const mapResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/map',
    });
    expect((mapResource.contents[0] as any).text).toBeDefined();

    const goalsResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/goals',
    });
    expect((goalsResource.contents[0] as any).text).toBeDefined();

    const healthResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/health',
    });
    expect((healthResource.contents[0] as any).text).toContain('healthy');

    const specsResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/specs',
    });
    expect((specsResource.contents[0] as any).text).toBeDefined();

    const bbResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/blackboard',
    });
    expect((bbResource.contents[0] as any).text).toBeDefined();

    const evResource = await client.readResource({
      uri: 'world-model:///' + PROJECT + '/evidence',
    });
    expect((evResource.contents[0] as any).text).toBeDefined();
  });
});
