import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { PermanenceEngine } from '../../src/engine/permanence.js';
import { SimulationEngine } from '../../src/engine/simulation.js';
import { loadProjectConfig, ProjectConfigSchema } from '../../src/engine/config.js';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';
import {
  NativeMcpServer,
  NativeClient,
  NativeInMemoryTransport,
  NativeResourceTemplate,
} from '../../src/transport/native-mcp.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('World-Model MCP Branch Coverage Booster Suite', () => {
  let db: Database.Database;
  const project = 'branch-booster-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. NativeClient & Native Transport Branches', () => {
    it('exercises full NativeClient lifecycle and error branches', async () => {
      const server = new NativeMcpServer({ name: 'world-server', version: '1.0.0' });

      server.registerTool(
        'query_test',
        {
          title: 'Query',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        },
        async (args: any) => ({ content: [{ type: 'text', text: `Result: ${args.q}` }] })
      );

      server.registerTool('raw_str', { title: 'Raw' }, async () => 'hello raw');

      server.registerPrompt(
        'nav_prompt',
        { title: 'Nav', argsSchema: { properties: { mode: { description: 'mode' } } } },
        async (args: any) => ({
          messages: [{ role: 'user', content: { type: 'text', text: `Mode: ${args.mode}` } }],
        })
      );

      server.registerResource(
        'info',
        'world://info',
        { title: 'Info', mimeType: 'text/plain' },
        async () => ({ contents: [{ uri: 'world://info', text: 'ok' }] })
      );

      server.registerResource(
        'templated_entity',
        new NativeResourceTemplate('entity://{id}'),
        { title: 'Entity' },
        async (uri, vars) => ({ contents: [{ uri: uri.toString(), text: `E:${vars.id}` }] })
      );

      const [cTransport, sTransport] = NativeInMemoryTransport.createLinkedPair();
      await server.connect(sTransport);

      const client = new NativeClient(
        { name: 'world-client', version: '1.0.0' },
        { capabilities: { prompts: {}, resources: {} } }
      );
      await client.connect(cTransport);

      const tools = await client.listTools();
      expect(tools.tools.some((t: any) => t.name === 'query_test')).toBe(true);

      const res = await client.callTool({ name: 'query_test', arguments: { q: 'bot' } });
      expect(res.content[0].text).toBe('Result: bot');

      const rawRes = await client.callTool({ name: 'raw_str' });
      expect(rawRes.content[0].text).toBe('hello raw');

      const badTool = await client.callTool({ name: 'missing_tool' });
      expect(badTool.isError).toBe(true);

      const prompts = await client.listPrompts();
      expect(prompts.prompts.some((p: any) => p.name === 'nav_prompt')).toBe(true);

      const pRes = await client.getPrompt({ name: 'nav_prompt', arguments: { mode: 'fast' } });
      expect(pRes.messages[0].content.text).toBe('Mode: fast');

      const resources = await client.listResources();
      expect(resources.resources.some((r: any) => r.name === 'info')).toBe(true);

      const rRes = await client.readResource({ uri: 'world://info' });
      expect(rRes.contents[0].text).toBe('ok');

      const tmplRes = await client.readResource({ uri: 'entity://e123' });
      expect(tmplRes.contents[0].text).toBe('E:e123');

      const ping = await client.request('ping');
      expect(ping).toEqual({});

      expect(server._registeredPrompts['nav_prompt']).toBeDefined();

      await client.close();
      await server.close();
    });
  });

  describe('2. Canonical JSON Serialization Branches', () => {
    it('covers all branch conditions in canonicalJsonStringify', () => {
      expect(canonicalJsonStringify(undefined)).toBe('');
      expect(canonicalJsonStringify(null)).toBe('null');
      expect(canonicalJsonStringify(true)).toBe('true');
      expect(canonicalJsonStringify(false)).toBe('false');
      expect(canonicalJsonStringify(100)).toBe('100');
      expect(canonicalJsonStringify(-0)).toBe('0');
      expect(canonicalJsonStringify(1.23456789)).toBe('1.234568');

      expect(() => canonicalJsonStringify(NaN)).toThrow('Invalid non-finite number');
      expect(() => canonicalJsonStringify(Infinity)).toThrow('Invalid non-finite number');
      expect(() => canonicalJsonStringify(-Infinity)).toThrow('Invalid non-finite number');

      expect(canonicalJsonStringify([])).toBe('[]');
      expect(canonicalJsonStringify([1, undefined, 2])).toBe('[1,null,2]');

      const obj = { b: 'beta', a: 'alpha', ign: undefined, sub: { y: 2, x: 1 } };
      expect(canonicalJsonStringify(obj)).toBe('{"a":"alpha","b":"beta","sub":{"x":1,"y":2}}');

      expect(canonicalJsonStringify(Symbol('x'))).toBe(undefined as any);
    });
  });

  describe('3. Engine Config Branches', () => {
    const tmpDir = path.join(process.cwd(), '.test-config-branch-db');
    const origSlug = process.env.PUTERVISION_PROJECT_SLUG;

    beforeEach(() => {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      if (origSlug !== undefined) process.env.PUTERVISION_PROJECT_SLUG = origSlug;
      else delete process.env.PUTERVISION_PROJECT_SLUG;
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('tests ProjectConfigSchema safeParse branches', () => {
      expect(ProjectConfigSchema.safeParse(null).success).toBe(false);
      expect(ProjectConfigSchema.safeParse('not-an-obj').success).toBe(false);
      expect(ProjectConfigSchema.safeParse([]).success).toBe(false);
      expect(ProjectConfigSchema.safeParse({ projectName: 'custom' }).success).toBe(true);
    });

    it('tests loadProjectConfig with invalid file, bad schema, and env slug', () => {
      const configPath = path.join(tmpDir, '.world-model-mcp.json');

      // Invalid JSON
      fs.writeFileSync(configPath, 'invalid json content');
      let cfg = loadProjectConfig(tmpDir);
      expect(cfg).toBeDefined();

      // Invalid schema (array)
      fs.writeFileSync(configPath, '["not", "object"]');
      cfg = loadProjectConfig(tmpDir);
      expect(cfg).toBeDefined();

      // Env slug fallback
      process.env.PUTERVISION_PROJECT_SLUG = 'env-slug-test';
      fs.writeFileSync(configPath, JSON.stringify({}));
      // Wait for TTL or use unique path
      const uniqueDir = path.join(tmpDir, 'unique-' + Date.now());
      fs.mkdirSync(uniqueDir, { recursive: true });
      fs.writeFileSync(path.join(uniqueDir, '.world-model-mcp.json'), JSON.stringify({}));
      const envCfg = loadProjectConfig(uniqueDir);
      expect(envCfg.projectName).toBe('env-slug-test');

      // Cache hit branch
      const cachedCfg = loadProjectConfig(uniqueDir);
      expect(cachedCfg).toBe(envCfg);
    });
  });

  describe('4. PermanenceEngine Decay Branches', () => {
    it('applies decay leading to hidden, lost, and destroyed stats', () => {
      // Create entities with low confidence
      const activeBot = EntityStore.addEntity(db, {
        project,
        name: 'DecayingBot1',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
        confidence: 0.25,
      });

      const almostLostBot = EntityStore.addEntity(db, {
        project,
        name: 'DecayingBot2',
        type: 'agent',
        position: { x: 1, y: 0, z: 0 },
        confidence: 0.08,
      });

      // Update last_seen_at to 2 hours ago
      const oldTime = new Date(Date.now() - 7200000).toISOString();
      db.prepare('UPDATE entities SET last_seen_at = ? WHERE project = ?').run(oldTime, project);

      // Apply decay
      const decayRes = PermanenceEngine.applyPermanenceDecay(db, {
        project,
        decay_rate: 0.1,
        unseen_for_ms: 1000,
        min_confidence_threshold: 0.2,
      });

      expect(decayRes.decayed_count).toBe(2);
      expect(decayRes.lost_count).toBe(1); // 0.08 - 0.1 <= 0.05 -> lost

      // Verify reObserveEntity
      PermanenceEngine.reObserveEntity(db, {
        project,
        entity_id: activeBot.id,
        visual_state_id: 'vs_boost',
      });
      const reObserved = EntityStore.getEntity(db, { project, id: activeBot.id });
      expect(reObserved?.confidence).toBe(1.0);
      expect(reObserved?.status).toBe('active');

      // Add destroyed entity
      EntityStore.addEntity(db, {
        project,
        name: 'DeadDrone',
        type: 'agent',
        status: 'destroyed',
      });

      const stats = PermanenceEngine.getDecayStats(db, { project });
      expect(stats.total_tracked).toBeGreaterThan(0);
      expect(stats.destroyed_count).toBe(1);
      expect(stats.lost_count).toBe(1);

      // Test getDecayStats with 0 rows
      const emptyStats = PermanenceEngine.getDecayStats(db, {
        project: 'nonexistent-empty-project',
      });
      expect(emptyStats.total_tracked).toBe(0);
      expect(emptyStats.avg_confidence).toBe(1.0);
    });
  });

  describe('5. SimulationEngine Collision and Waypoint Branches', () => {
    it('throws on missing entity or missing parameters', () => {
      expect(() =>
        SimulationEngine.simulateMovement(db, {
          project,
          entity_id: 'missing-id',
        })
      ).toThrow(ValidationError);

      expect(() =>
        SimulationEngine.simulateMovement(db, {
          project,
        })
      ).toThrow(ValidationError);
    });

    it('simulates movement with velocity, duration, and collision checking disabled', () => {
      const res = SimulationEngine.simulateMovement(db, {
        project,
        start_position: { x: 0, y: 0, z: 0 },
        velocity: { x: 10, y: 0, z: 0 },
        duration_seconds: 2,
        check_collisions: false,
      });

      expect(res.projected_position.x).toBe(20);
      expect(res.distance_traversed).toBe(20);
      expect(res.is_valid).toBe(true);
      expect(res.collisions_detected).toHaveLength(0);
    });

    it('detects collision with obstacle along trajectory', () => {
      // Place obstacle at x: 5
      EntityStore.addEntity(db, {
        project,
        name: 'ConcreteWall',
        type: 'obstacle',
        position: { x: 5, y: 0, z: 0 },
        bounding_box: { width: 2, height: 2, depth: 2 },
      });

      const res = SimulationEngine.simulateMovement(db, {
        project,
        start_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 10, y: 0, z: 0 },
        check_collisions: true,
      });

      expect(res.is_valid).toBe(false);
      expect(res.collisions_detected.length).toBeGreaterThan(0);
      expect(res.collisions_detected[0].obstacle_name).toBe('ConcreteWall');
    });
  });
});
