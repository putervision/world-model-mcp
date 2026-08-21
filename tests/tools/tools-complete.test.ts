import { describe, it, expect } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { toolDefinitions } from '../../src/tools/definitions.js';
import {
  registerAllTools,
  jsonSchemaToZod,
  jsonSchemaToZodObject,
} from '../../src/tools/handlers.js';
import { translateLegacyWorldCall, adaptLegacyParameters } from '../../src/tools/compat-shim.js';
import { registerAllPrompts } from '../../src/tools/prompts.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Tools, Handlers, Shim & Prompts Complete', () => {
  const project = 'test-tools-prompts-full';
  const db = getDb(project);

  it('has exactly 15 consolidated tool definitions', () => {
    expect(toolDefinitions).toHaveLength(15);
  });

  it('translates legacy tool names via compat shim', () => {
    expect(translateLegacyWorldCall('create_entity')).toBe('update_entity');
    expect(translateLegacyWorldCall('find_entities')).toBe('query_entities');
    expect(translateLegacyWorldCall('get_entity_location')).toBe('query_entities');
    expect(translateLegacyWorldCall('get_location')).toBe('query_entities');
    expect(translateLegacyWorldCall('add_relation')).toBe('set_relation');
    expect(translateLegacyWorldCall('get_world_map')).toBe('get_spatial_map');
    expect(translateLegacyWorldCall('get_world_summary')).toBe('get_spatial_map');
    expect(translateLegacyWorldCall('get_navigation_hints')).toBe('simulate_movement');
    expect(translateLegacyWorldCall('reconcile_observation')).toBe('ingest_observation');
    expect(translateLegacyWorldCall('get_relevant_context')).toBe('link_to_goal');
    expect(translateLegacyWorldCall('undo_mutation')).toBe('manage_snapshot');
    expect(translateLegacyWorldCall('project_to_screen')).toBe('generate_game_inputs');
    expect(translateLegacyWorldCall('unknown_tool')).toBe('unknown_tool');

    // Test parameter adapters
    const summaryAdapted = adaptLegacyParameters('get_world_summary', { project: 'test' });
    expect(summaryAdapted.tool).toBe('get_spatial_map');
    expect(summaryAdapted.args.format).toBe('summary');

    const navAdapted = adaptLegacyParameters('get_navigation_hints', {
      start_entity_id: 'e1',
      target_entity_id: 'e2',
    });
    expect(navAdapted.tool).toBe('simulate_movement');
    expect(navAdapted.args.mode).toBe('navigate');

    const undoAdapted = adaptLegacyParameters('undo_mutation', { entity_id: 'e1' });
    expect(undoAdapted.tool).toBe('manage_snapshot');
    expect(undoAdapted.args.action).toBe('undo');
  });

  it('registers prompts and executes explore-surroundings and navigate-game-world', async () => {
    const srv = new McpServer({ name: 'prompt-srv', version: '0.1.0' });
    registerAllPrompts(srv);

    const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
    await srv.connect(sTransport);
    const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(cTransport);

    const agent = EntityStore.addEntity(db, {
      project,
      name: 'Robot Observer',
      type: 'agent',
      position: { x: 12, y: 0, z: 34 },
    });

    const pRes = await client.getPrompt({
      name: 'explore-surroundings',
      arguments: { project, agent_entity_id: agent.id },
    });
    expect((pRes.messages[0].content as any).text).toContain('(12, 0, 34)');

    const gamePromptRes = await client.getPrompt({
      name: 'navigate-game-world',
      arguments: {
        project,
        agent_entity_id: agent.id,
        target_entity_id: 'target-item-1',
        control_scheme: 'wasd',
      },
    });
    expect((gamePromptRes.messages[0].content as any).text).toContain('Extract Scene');
    expect((gamePromptRes.messages[0].content as any).text).toContain('Generate Inputs');

    await client.close();
    await srv.close();
  });

  it('executes record_outcome with destroyed entity and handles tool errors', async () => {
    const srv = new McpServer({ name: 'tool-test-srv', version: '0.1.0' });
    registerAllTools(srv);

    const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
    await srv.connect(sTransport);
    const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(cTransport);

    const ent = EntityStore.addEntity(db, {
      project,
      name: 'Destructible Barrel',
      type: 'item',
      position: { x: 1, y: 1, z: 1 },
    });

    const destroyRes = await client.callTool({
      name: 'record_outcome',
      arguments: {
        project,
        action_name: 'smash_barrel',
        success: true,
        entity_id: ent.id,
        destroyed: true,
      },
    });
    expect(destroyRes.isError).toBeFalsy();

    // Call update_entity with invalid parameters to trigger tool handler error block
    const errRes = await client.callTool({
      name: 'update_entity',
      arguments: {
        project,
        name: '', // empty name triggers ValidationError
        type: 'item',
      },
    });
    expect(errRes.isError).toBe(true);

    await client.close();
    await srv.close();
  });

  it('tests query_entities location lookup, set_relation remove, link_to_goal get_context, and manage_snapshot', async () => {
    const srv = new McpServer({ name: 'tool-branch-srv', version: '0.1.0' });
    registerAllTools(srv);

    const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
    await srv.connect(sTransport);
    const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(cTransport);

    const testEnt = EntityStore.addEntity(db, {
      project,
      name: 'Locatable Tower',
      type: 'landmark',
      position: { x: 100, y: 50, z: 200 },
    });

    // query_entities with entity_id (consolidated get_location)
    const locRes = await client.callTool({
      name: 'query_entities',
      arguments: { project, entity_id: testEnt.id, include_history: true },
    });
    expect(locRes.isError).toBeFalsy();
    const locData = JSON.parse((locRes.content as any)[0].text);
    expect(locData.entity_id).toBe(testEnt.id);
    expect(locData.position.x).toBe(100);

    // query_entities on non-existent entity
    const locNotFound = await client.callTool({
      name: 'query_entities',
      arguments: { project, entity_id: 'missing-entity-id' },
    });
    expect((locNotFound.content as any)[0].text).toContain('not found');

    // set_relation remove
    const remRelRes = await client.callTool({
      name: 'set_relation',
      arguments: {
        project,
        action: 'remove',
        source_id: 'e1',
        relation: 'on',
        target_id: 'e2',
      },
    });
    expect(remRelRes.isError).toBeFalsy();

    // link_to_goal unlink
    const unlinkRes = await client.callTool({
      name: 'link_to_goal',
      arguments: {
        project,
        action: 'unlink',
        task_id: 'task-123',
        entity_id: 'e1',
      },
    });
    expect(unlinkRes.isError).toBeFalsy();

    // link_to_goal get_context (consolidated get_relevant_context)
    const ctxRes = await client.callTool({
      name: 'link_to_goal',
      arguments: {
        project,
        action: 'get_context',
        task_id: 'task-123',
        current_agent_position: { x: 0, y: 0, z: 0 },
      },
    });
    expect(ctxRes.isError).toBeFalsy();

    // get_spatial_map summary (consolidated get_world_summary)
    const sumRes = await client.callTool({
      name: 'get_spatial_map',
      arguments: { project, format: 'summary' },
    });
    expect(sumRes.isError).toBeFalsy();
    const sumData = JSON.parse((sumRes.content as any)[0].text);
    expect(sumData.total_entities).toBeDefined();

    // simulate_movement navigate mode (consolidated get_navigation_hints)
    const navRes = await client.callTool({
      name: 'simulate_movement',
      arguments: {
        project,
        mode: 'navigate',
        start_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 10, y: 0, z: 10 },
      },
    });
    expect(navRes.isError).toBeFalsy();

    // manage_snapshot save, diff, undo
    const snapSave = await client.callTool({
      name: 'manage_snapshot',
      arguments: { project, action: 'save', name: 'snap_v1' },
    });
    expect(snapSave.isError).toBeFalsy();

    const snapList = await client.callTool({
      name: 'manage_snapshot',
      arguments: { project, action: 'list' },
    });
    expect(snapList.isError).toBeFalsy();

    const snapUndo = await client.callTool({
      name: 'manage_snapshot',
      arguments: { project, action: 'undo' },
    });
    expect(snapUndo.isError).toBeFalsy();

    await client.close();
    await srv.close();
  });

  it('registers tool handlers and converts zod schemas', () => {
    const server = new McpServer({ name: 'test-server', version: '0.1.0' });
    expect(() => registerAllTools(server)).not.toThrow();

    const zodSchema = jsonSchemaToZod({
      type: 'object',
      properties: {
        str: { type: 'string', description: 'test string' },
        num: { type: 'number' },
        bool: { type: 'boolean' },
        arr: { type: 'array', items: { type: 'string' } },
        choice: { type: 'string', enum: ['a', 'b'] },
        obj: { type: 'object', properties: { sub: { type: 'string' } } },
      },
      required: ['str'],
    });
    expect(zodSchema).toBeDefined();

    const objSchema = jsonSchemaToZodObject({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect(objSchema).toBeDefined();

    const fallbackObj = jsonSchemaToZodObject('not an object');
    expect(fallbackObj).toBeDefined();
  });

  it('executes generate_game_inputs with screen projection and unprojection', async () => {
    const srv = new McpServer({ name: 'game-tools-srv', version: '0.1.0' });
    registerAllTools(srv);

    const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
    await srv.connect(sTransport);
    const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(cTransport);

    const drone = EntityStore.addEntity(db, {
      project,
      name: 'Player Drone',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
      orientation: { yaw: 0, pitch: 0, roll: 0 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    const targetBox = EntityStore.addEntity(db, {
      project,
      name: 'Target Chest',
      type: 'item',
      position: { x: 0, y: 0, z: 20 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    // 1. generate_game_inputs project_screen
    const projRes = await client.callTool({
      name: 'generate_game_inputs',
      arguments: {
        project,
        action: 'project_screen',
        entity_id: targetBox.id,
        camera: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { pitch: 0, yaw: 0, roll: 0 },
          fov_degrees: 60,
        },
        viewport: { width: 1920, height: 1080 },
      },
    });
    expect(projRes.isError).toBeFalsy();
    const projData = JSON.parse((projRes.content as any)[0].text);
    expect(projData.is_visible).toBe(true);
    expect(projData.screen_x).toBeCloseTo(960, 0);

    // 2. generate_game_inputs unproject_ray
    const unprojRes = await client.callTool({
      name: 'generate_game_inputs',
      arguments: {
        project,
        action: 'unproject_ray',
        screen_x: 960,
        screen_y: 540,
        camera: {
          position: { x: 0, y: 10, z: 0 },
          orientation: { pitch: -45, yaw: 0, roll: 0 },
          fov_degrees: 60,
        },
        ground_elevation: 0,
      },
    });
    expect(unprojRes.isError).toBeFalsy();
    const unprojData = JSON.parse((unprojRes.content as any)[0].text);
    expect(unprojData.ground_intercept).toBeDefined();

    // 3. generate_game_inputs input sequence
    const inputsRes = await client.callTool({
      name: 'generate_game_inputs',
      arguments: {
        project,
        entity_id: drone.id,
        target_entity_id: targetBox.id,
        control_profile: { scheme: 'wasd', move_speed: 5.0 },
      },
    });
    expect(inputsRes.isError).toBeFalsy();
    const inputsData = JSON.parse((inputsRes.content as any)[0].text);
    expect(inputsData.actions.length).toBeGreaterThan(0);
    expect(inputsData.playwright_commands.length).toBeGreaterThan(0);

    await client.close();
    await srv.close();
  });
});
