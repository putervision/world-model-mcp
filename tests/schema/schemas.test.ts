import { describe, it, expect } from 'vitest';
import {
  z,
  ENTITY_TYPES,
  Vector3DSchema,
  Orientation3DSchema,
  BoundingBoxSizeSchema,
} from '../../src/schema/schemas.js';
import { toEntityId, toRelationId, toRegionId } from '../../src/schema/types.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Validation Schemas & Branded Types Comprehensive', () => {
  it('converts branded IDs', () => {
    const eid = toEntityId('entity_123');
    const rid = toRelationId('rel_456');
    const regid = toRegionId('reg_789');
    expect(eid).toBe('entity_123');
    expect(rid).toBe('rel_456');
    expect(regid).toBe('reg_789');
  });

  it('validates string, enum, and description schemas', () => {
    const str = z.string().describe('A label').default('fallback');
    expect(str.parse('hello')).toBe('hello');
    expect(str.parse(undefined)).toBe('fallback');
    expect(() => str.parse(123)).toThrow(ValidationError);
    expect(str.toJsonSchema().description).toBe('A label');

    const optStr = z.string().optional();
    expect(optStr.parse(undefined)).toBeUndefined();
    expect(optStr.toJsonSchema().type).toBe('string');

    const en = z.enum(ENTITY_TYPES).describe('Entity type enum');
    expect(en.parse('landmark')).toBe('landmark');
    expect(() => en.parse('invalid_enum')).toThrow(ValidationError);
    expect(en.toJsonSchema().enum).toContain('landmark');
  });

  it('validates number, boolean, array, record, object, and any schemas', () => {
    const num = z.number().default(10).describe('count');
    expect(num.parse(5)).toBe(5);
    expect(num.parse(undefined)).toBe(10);
    expect(() => num.parse('not a number')).toThrow(ValidationError);
    expect(num.toJsonSchema().type).toBe('number');

    const bool = z.boolean().default(false);
    expect(bool.parse(true)).toBe(true);
    expect(bool.parse(undefined)).toBe(false);
    expect(() => bool.parse(123)).toThrow(ValidationError);
    expect(bool.toJsonSchema().type).toBe('boolean');

    const arr = z.array(z.string()).describe('string list');
    expect(arr.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => arr.parse('not an array')).toThrow(ValidationError);
    expect(arr.toJsonSchema().type).toBe('array');

    const rec = z.record(z.number()).describe('number dict');
    expect(rec.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => rec.parse('not a dict')).toThrow(ValidationError);
    expect(rec.toJsonSchema().type).toBe('object');

    const anySchema = z.any();
    expect(anySchema.parse(null)).toBeNull();
    expect(anySchema.parse({ foo: 'bar' })).toEqual({ foo: 'bar' });
    expect(anySchema.toJsonSchema()).toEqual({});
  });

  it('validates ObjectSchema error branches and toJsonSchema', () => {
    const obj = z
      .object({
        id: z.string(),
        val: z.number().optional(),
      })
      .describe('Test Object');

    expect(() => obj.parse(null)).toThrow(ValidationError);
    expect(() => obj.parse('not an object')).toThrow(ValidationError);
    expect(() => obj.parse([])).toThrow(ValidationError);

    const parsed = obj.parse({ id: 'item1' });
    expect(parsed.id).toBe('item1');
    expect(parsed.val).toBeUndefined();

    const jsonSchema = obj.toJsonSchema();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.required).toContain('id');
    expect(jsonSchema.description).toBe('Test Object');
  });

  it('tests safeParse success and failure formatting', () => {
    const s = z.string();
    const ok = s.safeParse('valid string');
    expect(ok.success).toBe(true);

    const fail = s.safeParse(12345);
    expect(fail.success).toBe(false);
    if (!fail.success) {
      expect(fail.error?.format()).toContain('must be a string');
    }
  });

  it('tests ArraySchema and RecordSchema defaults and non-object handling', () => {
    const arrDef = z.array(z.string()).default(['init']);
    expect(arrDef.parse(undefined)).toEqual(['init']);

    const arrOpt = z.array(z.string()).optional();
    expect(arrOpt.parse(undefined)).toBeUndefined();

    const recDef = z.record(z.number()).default({ def: 1 });
    expect(recDef.parse(undefined)).toEqual({ def: 1 });

    const recOpt = z.record(z.number()).optional();
    expect(recOpt.parse(undefined)).toBeUndefined();
  });

  it('validates subschemas for Vector3D, Orientation, and BoundingBox', () => {
    const v = Vector3DSchema.parse({ x: 1, y: 2, z: 3 });
    expect(v).toEqual({ x: 1, y: 2, z: 3 });

    const o = Orientation3DSchema.parse({ pitch: 10, yaw: 90 });
    expect(o.yaw).toBe(90);

    const b = BoundingBoxSizeSchema.parse({ width: 2, height: 4, depth: 6 });
    expect(b).toEqual({ width: 2, height: 4, depth: 6 });
  });
});
