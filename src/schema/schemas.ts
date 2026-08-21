import { ValidationError } from '../utils/errors.js';

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    errors: { message: string }[];
    format: () => string;
  };
}

export abstract class Schema<T> {
  isOptional = false;
  defaultValue?: T;
  descriptionText?: string;

  protected clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  abstract parse(val: unknown, path?: string): T;
  abstract toJsonSchema(): any;

  describe(desc: string): this {
    const copy = this.clone();
    copy.descriptionText = desc;
    return copy;
  }

  optional(): this {
    const copy = this.clone();
    copy.isOptional = true;
    return copy;
  }

  default(val: T): this {
    const copy = this.clone();
    copy.defaultValue = val;
    return copy;
  }

  safeParse(val: unknown): ParseResult<T> {
    try {
      const data = this.parse(val);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          errors: [{ message: err.message || 'Validation error' }],
          format: () => err.message || 'Validation error',
        },
      };
    }
  }
}

export class StringSchema extends Schema<string> {
  constructor(private enumVals?: readonly string[]) {
    super();
  }

  parse(val: unknown, p = 'value'): string {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as string;
      throw new ValidationError(`${p} is required`);
    }
    if (typeof val !== 'string') {
      throw new ValidationError(`${p} must be a string`);
    }
    if (this.enumVals && !this.enumVals.includes(val)) {
      throw new ValidationError(`${p} must be one of: ${this.enumVals.join(', ')}`);
    }
    return val;
  }

  toJsonSchema() {
    const schema: any = { type: 'string' };
    if (this.enumVals) schema.enum = [...this.enumVals];
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class NumberSchema extends Schema<number> {
  parse(val: unknown, p = 'value'): number {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as number;
      throw new ValidationError(`${p} is required`);
    }
    if (typeof val !== 'number' || isNaN(val)) {
      throw new ValidationError(`${p} must be a number`);
    }
    return val;
  }

  toJsonSchema() {
    const schema: any = { type: 'number' };
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class BooleanSchema extends Schema<boolean> {
  parse(val: unknown, p = 'value'): boolean {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as boolean;
      throw new ValidationError(`${p} is required`);
    }
    if (typeof val !== 'boolean') {
      throw new ValidationError(`${p} must be a boolean`);
    }
    return val;
  }

  toJsonSchema() {
    const schema: any = { type: 'boolean' };
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class ArraySchema<T> extends Schema<T[]> {
  constructor(private itemSchema: Schema<T>) {
    super();
  }

  parse(val: unknown, p = 'value'): T[] {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as T[];
      throw new ValidationError(`${p} is required`);
    }
    if (!Array.isArray(val)) {
      throw new ValidationError(`${p} must be an array`);
    }
    return val.map((item, idx) => this.itemSchema.parse(item, `${p}[${idx}]`));
  }

  toJsonSchema() {
    const schema: any = {
      type: 'array',
      items: this.itemSchema.toJsonSchema(),
    };
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class RecordSchema<T> extends Schema<Record<string, T>> {
  constructor(private valSchema: Schema<T>) {
    super();
  }

  parse(val: unknown, p = 'value'): Record<string, T> {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as Record<string, T>;
      throw new ValidationError(`${p} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new ValidationError(`${p} must be an object`);
    }
    const result: Record<string, T> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      result[k] = this.valSchema.parse(v, `${p}.${k}`);
    }
    return result;
  }

  toJsonSchema() {
    const schema: any = {
      type: 'object',
      additionalProperties: this.valSchema.toJsonSchema(),
    };
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class ObjectSchema<T extends Record<string, any>> extends Schema<T> {
  constructor(private shape: { [K in keyof T]: Schema<T[K]> }) {
    super();
  }

  parse(val: unknown, p = 'value'): T {
    if (val === undefined || val === null) {
      if (this.defaultValue !== undefined) return this.defaultValue;
      if (this.isOptional) return undefined as unknown as T;
      throw new ValidationError(`${p} is required`);
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new ValidationError(`${p} must be an object`);
    }
    const raw = val as Record<string, unknown>;
    const res: any = { ...raw };
    for (const [k, schema] of Object.entries(this.shape) as [string, Schema<any>][]) {
      res[k] = schema.parse(raw[k], `${p}.${k}`);
    }
    return res as T;
  }

  toJsonSchema() {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [k, s] of Object.entries(this.shape) as [string, Schema<any>][]) {
      properties[k] = s.toJsonSchema();
      if (!s.isOptional) {
        required.push(k);
      }
    }

    const schema: any = {
      type: 'object',
      properties,
    };
    if (required.length > 0) schema.required = required;
    if (this.descriptionText) schema.description = this.descriptionText;
    return schema;
  }
}

export class AnySchema extends Schema<any> {
  parse(val: unknown): any {
    return val;
  }

  toJsonSchema() {
    return {};
  }
}

// Zod Mirror Builder
export const z = {
  string: () => new StringSchema(),
  enum: <T extends readonly string[]>(values: T) => new StringSchema(values),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  array: <T>(item: Schema<T>) => new ArraySchema(item),
  record: <T>(val: Schema<T>) => new RecordSchema(val),
  object: <T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }) =>
    new ObjectSchema(shape),
  any: () => new AnySchema(),
};

// Enums
export const ENTITY_TYPES = [
  'object',
  'agent',
  'landmark',
  'region',
  'waypoint',
  'container',
  'surface',
  'npc',
  'item',
  'obstacle',
  'custom',
] as const;

export const ENTITY_STATUSES = ['active', 'hidden', 'lost', 'destroyed'] as const;

export const RELATION_TYPES = [
  'on',
  'inside',
  'next_to',
  'above',
  'below',
  'near',
  'contains',
  'occluded_by',
  'connected_to',
  'facing',
  'holding',
  'part_of',
  'custom',
] as const;

export const GOAL_RELATIONSHIPS = [
  'target',
  'obstacle',
  'resource',
  'destination',
  'waypoint',
  'context',
] as const;

// Common Sub-schemas
export const Vector3DSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  z: z.number().default(0),
});

export const Orientation3DSchema = z.object({
  pitch: z.number().optional(),
  yaw: z.number().optional(),
  roll: z.number().optional(),
});

export const BoundingBoxSizeSchema = z.object({
  width: z.number().default(1),
  height: z.number().default(1),
  depth: z.number().default(1),
});

export const SPATIAL_CONSTRAINT_TYPES = [
  'min_clearance',
  'max_distance',
  'inside_region',
  'contains_entity',
  'no_overlap',
  'custom',
] as const;

export const TRAJECTORY_FORMATS = ['json', 'joint', 'spatial_vlm'] as const;

export const SpatialConstraintSchema = z.object({
  type: z.enum(SPATIAL_CONSTRAINT_TYPES),
  entity_id: z.string().optional(),
  target_id: z.string().optional(),
  region_id: z.string().optional(),
  value: z.number().optional(),
  description: z.string().optional(),
});

export const SpatialBoundsSchema = z.object({
  min: Vector3DSchema,
  max: Vector3DSchema,
});

export const CameraStateSchema = z.object({
  position: Vector3DSchema,
  orientation: Orientation3DSchema.optional(),
  fov_degrees: z.number().default(60),
  near: z.number().default(0.1),
  far: z.number().default(1000),
  projection_type: z.enum(['perspective', 'orthographic'] as const).default('perspective'),
});

export const ViewportSizeSchema = z.object({
  width: z.number().default(1920),
  height: z.number().default(1080),
});

export const GAME_CONTROL_SCHEMES = ['wasd', 'arrows', 'click_to_move', 'custom'] as const;

export const GameControlProfileSchema = z.object({
  scheme: z.enum(GAME_CONTROL_SCHEMES).default('wasd'),
  move_speed: z.number().default(5.0),
  turn_speed: z.number().default(90.0),
  forward_key: z.string().default('KeyW'),
  backward_key: z.string().default('KeyS'),
  strafe_left_key: z.string().default('KeyA'),
  strafe_right_key: z.string().default('KeyD'),
  jump_key: z.string().default('Space'),
  turn_left_key: z.string().default('ArrowLeft'),
  turn_right_key: z.string().default('ArrowRight'),
  use_mouse_look: z.boolean().default(false),
  mouse_sensitivity: z.number().default(1.0),
});

export const TilemapConfigSchema = z.object({
  tile_width: z.number().default(32),
  tile_height: z.number().default(32),
  orientation: z.enum(['orthogonal', 'isometric'] as const).default('orthogonal'),
  origin_x: z.number().default(0),
  origin_y: z.number().default(0),
});
