import { describe, it, expect, beforeEach } from 'vitest';
import {
  NativeMcpServer,
  NativeResourceTemplate,
  ErrorCode,
  validateParams,
} from '../../src/transport/native-mcp.js';
import { createNativeServer } from '../../src/server.js';
import { VERSION } from '../../src/utils/version.js';

describe('NativeMcpServer Conformance Suite', () => {
  let server: NativeMcpServer;

  beforeEach(() => {
    server = new NativeMcpServer({
      name: 'io.github.putervision/world-model-mcp',
      version: VERSION,
    });

    // Register a test tool
    server.registerTool(
      'test_tool',
      {
        title: 'Test Tool',
        description: 'A test tool for parameter validation',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'read', 'delete'] },
            count: { type: 'number' },
            tags: { type: 'array' },
            metadata: { type: 'object' },
            flag: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      async (args: any, extra?: { signal?: AbortSignal }) => {
        if (args.action === 'slow') {
          // Allow testing cancellation
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            extra?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            });
          });
        }
        return { success: true, receivedAction: args.action };
      }
    );

    // Register a static resource
    server.registerResource(
      'health-check',
      'world:///health',
      { title: 'Health', mimeType: 'application/json' },
      async () => ({
        contents: [
          { uri: 'world:///health', mimeType: 'application/json', text: '{"status":"healthy"}' },
        ],
      })
    );

    // Register a templated resource
    server.registerResource(
      'world-summary',
      new NativeResourceTemplate('world-model:///{project}/summary'),
      { title: 'World Summary', mimeType: 'application/json' },
      async (uri, vars) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ project: vars.project }),
          },
        ],
      })
    );

    // Register a prompt
    server.registerPrompt(
      'test-prompt',
      {
        title: 'Test Prompt',
        description: 'A test prompt template',
        argsSchema: {
          properties: {
            topic: { type: 'string', description: 'The prompt topic' },
          },
          required: ['topic'],
        },
      },
      async (args) => ({
        description: 'Test prompt output',
        messages: [{ role: 'user', content: { type: 'text', text: `Topic is ${args.topic}` } }],
      })
    );
  });

  describe('1. Handshake & Protocol Version Negotiation', () => {
    it('handles initialize with requested protocolVersion 2024-11-05', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', clientInfo: { name: 'cursor', version: '1.0' } },
      });

      expect(resp).not.toBeNull();
      expect(resp?.error).toBeUndefined();
      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        },
        serverInfo: {
          name: 'io.github.putervision/world-model-mcp',
          version: VERSION,
        },
      });
    });

    it('handles initialize with backward-compatible 2024-10-07 version', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: { protocolVersion: '2024-10-07' },
      });

      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-10-07',
      });
    });

    it('falls back to default 2024-11-05 when unsupported version requested', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: { protocolVersion: '2023-01-01' },
      });

      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-11-05',
      });
    });

    it('returns null on notifications/initialized', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      });

      expect(resp).toBeNull();
    });

    it('handles ping request', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 'ping-1',
        method: 'ping',
      });

      expect(resp?.result).toEqual({});
    });
  });

  describe('2. Tools Conformance & -32602 Validation', () => {
    it('lists registered tools with valid inputSchema', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
      });

      expect(resp?.result).toHaveProperty('tools');
      const tools = (resp?.result as any).tools;
      expect(tools.length).toBeGreaterThanOrEqual(1);
      const testTool = tools.find((t: any) => t.name === 'test_tool');
      expect(testTool).toBeDefined();
      expect(testTool.inputSchema.required).toContain('action');
    });

    it('executes tool with valid arguments', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'create', count: 42, flag: true },
        },
      });

      expect(resp?.error).toBeUndefined();
      expect(resp?.result).toHaveProperty('content');
      const content = (resp?.result as any).content;
      expect(content[0].type).toBe('text');
      expect(JSON.parse(content[0].text)).toMatchObject({
        success: true,
        receivedAction: 'create',
      });
    });

    it('returns -32602 when missing required parameter', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { count: 10 }, // missing 'action'
        },
      });

      expect(resp?.result).toBeUndefined();
      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams); // -32602
      expect(resp?.error?.message).toContain('Missing required argument: "action"');
    });

    it('returns -32602 when property type is wrong', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'create', count: 'not-a-number' },
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(resp?.error?.message).toContain('expected number, got string');
    });

    it('returns -32602 when enum value is not allowed', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'unsupported_action' },
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidParams);
      expect(resp?.error?.message).toContain('expected one of [create, read, delete]');
    });

    it('returns -32601 on unknown tool name', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: {},
        },
      });

      expect(resp?.error?.code).toBe(ErrorCode.MethodNotFound);
      expect(resp?.error?.message).toContain('Unknown tool');
    });

    it('returns -32602 when mandatory project slug is missing on registered tools (E7)', async () => {
      const fullServer = createNativeServer();
      const oldProject = process.env.WORLD_MODEL_MCP_PROJECT;
      const oldPv = process.env.PV_PROJECT;
      delete process.env.WORLD_MODEL_MCP_PROJECT;
      delete process.env.PV_PROJECT;

      try {
        const resp = await fullServer.handleMessage({
          jsonrpc: '2.0',
          id: 16,
          method: 'tools/call',
          params: {
            name: 'query_entities',
            arguments: {},
          },
        });

        expect(resp?.result).toBeUndefined();
        expect(resp?.error?.code).toBe(ErrorCode.InvalidParams); // -32602
        expect(resp?.error?.message).toContain('Parameter "project" is required');
      } finally {
        if (oldProject !== undefined) process.env.WORLD_MODEL_MCP_PROJECT = oldProject;
        if (oldPv !== undefined) process.env.PV_PROJECT = oldPv;
      }
    });
  });

  describe('3. Resources Conformance', () => {
    it('lists static and templated resources', async () => {
      const listResp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 20,
        method: 'resources/list',
      });
      expect(listResp?.result).toHaveProperty('resources');
      const resources = (listResp?.result as any).resources;
      expect(resources.some((r: any) => r.uri === 'world:///health')).toBe(true);

      const tplResp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 21,
        method: 'resources/templates/list',
      });
      expect(tplResp?.result).toHaveProperty('resourceTemplates');
      const templates = (tplResp?.result as any).resourceTemplates;
      expect(templates.some((t: any) => t.uriTemplate === 'world-model:///{project}/summary')).toBe(
        true
      );
    });

    it('reads static resource', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 22,
        method: 'resources/read',
        params: { uri: 'world:///health' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      expect(contents[0].text).toContain('healthy');
    });

    it('reads templated resource with URI variable extraction', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 23,
        method: 'resources/read',
        params: { uri: 'world-model:///test-project/summary' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      const parsed = JSON.parse(contents[0].text);
      expect(parsed.project).toBe('test-project');
    });

    it('returns error when resource not found', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 24,
        method: 'resources/read',
        params: { uri: 'world-model:///unknown/not-found' },
      });

      expect(resp?.error?.code).toBe(ErrorCode.InvalidRequest);
      expect(resp?.error?.message).toContain('Resource not found');
    });

    it('reads pv://docs/ documentation resource (E13)', async () => {
      const fullServer = createNativeServer();
      const resp = await fullServer.handleMessage({
        jsonrpc: '2.0',
        id: 25,
        method: 'resources/read',
        params: { uri: 'pv://docs/update_entity' },
      });

      expect(resp?.result).toHaveProperty('contents');
      const contents = (resp?.result as any).contents;
      const parsed = JSON.parse(contents[0].text);
      expect(parsed.tool).toBe('update_entity');
      expect(parsed.inputSchema).toBeDefined();
    });
  });

  describe('4. Prompts Conformance', () => {
    it('lists registered prompts', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'prompts/list',
      });

      expect(resp?.result).toHaveProperty('prompts');
      const prompts = (resp?.result as any).prompts;
      expect(prompts.some((p: any) => p.name === 'test-prompt')).toBe(true);
    });

    it('retrieves prompt with arguments', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'prompts/get',
        params: { name: 'test-prompt', arguments: { topic: 'SpatialFrustum' } },
      });

      expect(resp?.result).toHaveProperty('messages');
      const messages = (resp?.result as any).messages;
      expect(messages[0].content.text).toBe('Topic is SpatialFrustum');
    });
  });

  describe('5. Request Cancellation', () => {
    it('aborts active request when notifications/cancelled received', async () => {
      // Launch a slow tool call
      const callPromise = server.handleMessage({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { action: 'slow' },
        },
      });

      // Send cancellation immediately
      await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 99 },
      });

      const resp = await callPromise;
      expect(resp?.error?.code).toBe(-32000);
      expect(resp?.error?.message).toBe('Request cancelled');
    });
  });

  describe('6. Error Envelope Handling', () => {
    it('returns -32600 on invalid envelope without method', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 101,
      } as any);

      expect(resp?.error?.code).toBe(ErrorCode.InvalidRequest);
    });

    it('returns -32601 on unsupported method', async () => {
      const resp = await server.handleMessage({
        jsonrpc: '2.0',
        id: 102,
        method: 'unknown/method',
      });

      expect(resp?.error?.code).toBe(ErrorCode.MethodNotFound);
    });
  });

  describe('7. Latency Benchmark', () => {
    it('handles initialize and tools/list in sub-15ms', async () => {
      const start = performance.now();

      await server.handleMessage({
        jsonrpc: '2.0',
        id: 'bench-init',
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      });

      await server.handleMessage({
        jsonrpc: '2.0',
        id: 'bench-tools',
        method: 'tools/list',
      });

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(15); // Target: <=15ms
    });
  });

  describe('8. Integrated World-Model Native Server', () => {
    let nativeServer: NativeMcpServer;

    beforeEach(() => {
      nativeServer = createNativeServer();
    });

    it('initializes and reports correct serverInfo', async () => {
      const resp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 200,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      });

      expect(resp?.result).toMatchObject({
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'io.github.putervision/world-model-mcp',
          version: VERSION,
        },
      });
    });

    it('lists all 15 consolidated tools', async () => {
      const resp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 201,
        method: 'tools/list',
      });

      const tools = (resp?.result as any)?.tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(15);
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('update_entity');
      expect(toolNames).toContain('query_entities');
      expect(toolNames).toContain('set_relation');
      expect(toolNames).toContain('get_spatial_map');
      expect(toolNames).toContain('simulate_movement');
      expect(toolNames).toContain('ingest_observation');
      expect(toolNames).toContain('get_expected_view');
      expect(toolNames).toContain('link_to_goal');
      expect(toolNames).toContain('record_outcome');
      expect(toolNames).toContain('manage_spatial_spec');
      expect(toolNames).toContain('create_evidence_pack');
      expect(toolNames).toContain('use_spatial_blackboard');
      expect(toolNames).toContain('manage_snapshot');
      expect(toolNames).toContain('generate_game_inputs');
      expect(toolNames).toContain('wait_for_spatial_state');
    });

    it('lists registered resources and templates', async () => {
      const listResp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 202,
        method: 'resources/list',
      });
      const resources = (listResp?.result as any)?.resources;
      expect(resources.some((r: any) => r.uri === 'world:///health')).toBe(true);

      const tplResp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 203,
        method: 'resources/templates/list',
      });
      const templates = (tplResp?.result as any)?.resourceTemplates;
      expect(templates.some((t: any) => t.uriTemplate === 'world-model:///{project}/summary')).toBe(
        true
      );
      expect(
        templates.some((t: any) => t.uriTemplate === 'world-model:///{project}/entities')
      ).toBe(true);
      expect(templates.some((t: any) => t.uriTemplate === 'world-model:///{project}/map')).toBe(
        true
      );
    });

    it('reads world health resource', async () => {
      const resp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 204,
        method: 'resources/read',
        params: { uri: 'world:///health' },
      });

      expect(resp?.error).toBeUndefined();
      const text = (resp?.result as any)?.contents?.[0]?.text;
      const parsed = JSON.parse(text);
      expect(parsed.status).toBe('healthy');
      expect(parsed.version).toBe(VERSION);
    });

    it('lists and gets registered prompts', async () => {
      const listResp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 205,
        method: 'prompts/list',
      });
      const prompts = (listResp?.result as any)?.prompts;
      expect(prompts.length).toBeGreaterThanOrEqual(4);
      expect(prompts.some((p: any) => p.name === 'explore-surroundings')).toBe(true);

      const getResp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 206,
        method: 'prompts/get',
        params: { name: 'explore-surroundings', arguments: { project: 'test-project' } },
      });
      expect(getResp?.error).toBeUndefined();
      expect((getResp?.result as any)?.messages?.[0]?.content?.text).toContain(
        'orienting in project "test-project"'
      );
    });

    it('calls a real tool (query_entities) via native server', async () => {
      const resp = await nativeServer.handleMessage({
        jsonrpc: '2.0',
        id: 207,
        method: 'tools/call',
        params: {
          name: 'query_entities',
          arguments: { project: 'native-test' },
        },
      });

      expect(resp?.error).toBeUndefined();
      const content = (resp?.result as any)?.content;
      expect(Array.isArray(content)).toBe(true);
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toBeDefined();
    });
  });
});
