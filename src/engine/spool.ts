import Database from 'better-sqlite3';
import { SpooledOutcome, SpooledOutcomeRow } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse } from '../utils/json-validator.js';

export interface SpooledOutcomeInput {
  id?: string;
  session_id?: string;
  leaf?: string;
  status?: string;
  result?: Record<string, unknown>;
  pack_hash?: string;
  token_id?: string;
  error?: string;
  created_at?: string;
}

export class SpoolEngine {
  /**
   * Ingests a batch of outcomes produced during high-frequency execution (e.g. 60Hz loop off-tick).
   */
  static ingestSpooledOutcomes(
    db: Database.Database,
    params: {
      project: string;
      items: SpooledOutcomeInput[];
    }
  ): { ingested: number; total_spooled: number } {
    const now = getCurrentIsoString();
    let count = 0;

    const stmt = db.prepare(`
      INSERT INTO spooled_outcomes (
        id, project, session_id, leaf, status, result_json, pack_hash, token_id, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const item of params.items) {
        const id = item.id || generateId();
        const status = item.status || 'success';
        const resultJson = item.result ? JSON.stringify(item.result) : null;
        stmt.run(
          id,
          params.project,
          item.session_id ?? null,
          item.leaf ?? null,
          status,
          resultJson,
          item.pack_hash ?? null,
          item.token_id ?? null,
          item.error ?? null,
          item.created_at || now
        );
        count++;
      }
    })();

    const totalRow = db
      .prepare('SELECT COUNT(*) as c FROM spooled_outcomes WHERE project = ?')
      .get(params.project) as { c: number } | undefined;

    return {
      ingested: count,
      total_spooled: totalRow ? totalRow.c : count,
    };
  }

  /**
   * Lists spooled outcomes for a project or specific session.
   */
  static listSpooledOutcomes(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string;
      limit?: number;
    }
  ): SpooledOutcome[] {
    let query = 'SELECT * FROM spooled_outcomes WHERE project = ?';
    const queryParams: any[] = [params.project];

    if (params.session_id) {
      query += ' AND session_id = ?';
      queryParams.push(params.session_id);
    }

    query += ' ORDER BY rowid DESC, created_at DESC LIMIT ?';
    queryParams.push(params.limit || 100);

    const rows = db.prepare(query).all(...queryParams) as SpooledOutcomeRow[];

    return rows.map((r) => ({
      id: r.id,
      project: r.project,
      session_id: r.session_id || undefined,
      leaf: r.leaf || undefined,
      status: r.status,
      result: safeJsonParse<Record<string, unknown>>(r.result_json || '{}', {}),
      pack_hash: r.pack_hash || undefined,
      token_id: r.token_id || undefined,
      error: r.error || undefined,
      created_at: r.created_at,
    }));
  }

  /**
   * Clears or prunes spooled outcomes.
   */
  static clearSpooledOutcomes(
    db: Database.Database,
    params: { project: string; session_id?: string }
  ): { deleted: number } {
    let query = 'DELETE FROM spooled_outcomes WHERE project = ?';
    const queryParams: any[] = [params.project];

    if (params.session_id) {
      query += ' AND session_id = ?';
      queryParams.push(params.session_id);
    }

    const res = db.prepare(query).run(...queryParams);
    return { deleted: res.changes };
  }
}
