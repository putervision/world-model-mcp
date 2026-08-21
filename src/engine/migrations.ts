import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_world_model_schema',
    up: (db: Database.Database) => {
      // 1. Schema metadata table
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // 2. Entities table
      db.exec(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT active,
          x REAL,
          y REAL,
          z REAL,
          pitch REAL,
          yaw REAL,
          roll REAL,
          bbox_width REAL,
          bbox_height REAL,
          bbox_depth REAL,
          confidence REAL NOT NULL DEFAULT 1.0,
          parent_id TEXT,
          region_id TEXT,
          properties_json TEXT,
          tags_json TEXT,
          last_seen_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_entities_project_type ON entities(project, type);
        CREATE INDEX IF NOT EXISTS idx_entities_project_status ON entities(project, status);
        CREATE INDEX IF NOT EXISTS idx_entities_project_region ON entities(project, region_id);
        CREATE INDEX IF NOT EXISTS idx_entities_project_parent ON entities(project, parent_id);
        CREATE INDEX IF NOT EXISTS idx_entities_project_last_seen ON entities(project, last_seen_at);
      `);

      // 3. FTS5 Virtual Table for Entities
      try {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
            name,
            type,
            tags_text,
            properties_text,
            content=entities,
            content_rowid=rowid
          );
        `);
      } catch (err: any) {
        logger.warn(`FTS5 setup skipped or not supported: ${err.message}`);
      }

      // 4. Spatial Relations table
      db.exec(`
        CREATE TABLE IF NOT EXISTS spatial_relations (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          relation TEXT NOT NULL,
          target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          offset_x REAL,
          offset_y REAL,
          offset_z REAL,
          distance REAL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project, source_id, relation, target_id)
        );

        CREATE INDEX IF NOT EXISTS idx_relations_source ON spatial_relations(project, source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON spatial_relations(project, target_id);
        CREATE INDEX IF NOT EXISTS idx_relations_rel ON spatial_relations(project, relation);
      `);

      // 5. Entity History (Event Sourcing) table
      db.exec(`
        CREATE TABLE IF NOT EXISTS entity_history (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          x REAL,
          y REAL,
          z REAL,
          confidence REAL,
          source TEXT,
          visual_state_id TEXT,
          task_id TEXT,
          details_json TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_history_project_entity ON entity_history(project, entity_id);
        CREATE INDEX IF NOT EXISTS idx_history_project_time ON entity_history(project, timestamp);
      `);

      // 6. Observations table
      db.exec(`
        CREATE TABLE IF NOT EXISTS observations (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          visual_state_id TEXT,
          observer_x REAL,
          observer_y REAL,
          observer_z REAL,
          observer_pitch REAL,
          observer_yaw REAL,
          observer_roll REAL,
          fov_horizontal REAL,
          fov_vertical REAL,
          raw_detections_json TEXT,
          reconcile_report_json TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_obs_project_time ON observations(project, timestamp);
        CREATE INDEX IF NOT EXISTS idx_obs_project_visual ON observations(project, visual_state_id);
      `);

      // 7. Goal Links table
      db.exec(`
        CREATE TABLE IF NOT EXISTS goal_links (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          task_id TEXT NOT NULL,
          entity_id TEXT,
          region_id TEXT,
          relationship TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_goal_links_task ON goal_links(project, task_id);
        CREATE INDEX IF NOT EXISTS idx_goal_links_entity ON goal_links(project, entity_id);
      `);

      // 8. Regions table
      db.exec(`
        CREATE TABLE IF NOT EXISTS regions (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          name TEXT NOT NULL,
          parent_region_id TEXT,
          min_x REAL,
          min_y REAL,
          min_z REAL,
          max_x REAL,
          max_y REAL,
          max_z REAL,
          properties_json TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_regions_project_name ON regions(project, name);
      `);

      // 9. Snapshots table
      db.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          data_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(project, name)
        );
      `);
    },
  },
  {
    version: 2,
    name: 'spatial_specs_blackboard_evidence',
    up: (db: Database.Database) => {
      // 1. Spatial Specs Table
      db.exec(`
        CREATE TABLE IF NOT EXISTS spatial_specs (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          bounds_json TEXT,
          constraints_json TEXT,
          sdd_requirement_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project, name)
        );
        CREATE INDEX IF NOT EXISTS idx_spatial_specs_project_name ON spatial_specs(project, name);
      `);

      // 2. Blackboard Items Table
      db.exec(`
        CREATE TABLE IF NOT EXISTS blackboard_items (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          topic TEXT NOT NULL,
          sender TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          claimed_by TEXT,
          claimed_until TEXT,
          expires_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_blackboard_project_topic ON blackboard_items(project, topic);
        CREATE INDEX IF NOT EXISTS idx_blackboard_expires ON blackboard_items(project, expires_at);
      `);

      // 3. Evidence Packs Table
      db.exec(`
        CREATE TABLE IF NOT EXISTS evidence_packs (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          task_id TEXT,
          entity_ids_json TEXT,
          observation_ids_json TEXT,
          before_snapshot_id TEXT,
          after_snapshot_id TEXT,
          payload_json TEXT NOT NULL,
          sha256_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_project_task ON evidence_packs(project, task_id);
      `);

      // 4. Cryptographic Hash columns on entity_history
      try {
        db.exec(`ALTER TABLE entity_history ADD COLUMN prev_hash TEXT;`);
      } catch {
        // column may already exist
      }
      try {
        db.exec(`ALTER TABLE entity_history ADD COLUMN hash TEXT;`);
      } catch {
        // column may already exist
      }
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  for (const mig of migrations) {
    if (mig.version > currentVersion) {
      logger.info(`Applying migration v${mig.version}: ${mig.name}`);
      db.transaction(() => {
        mig.up(db);
        db.prepare(
          "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(String(mig.version));
      })();
    }
  }
}
