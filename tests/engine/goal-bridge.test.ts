import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { GoalBridge } from '../../src/engine/goal-bridge.js';

describe('Goal Bridge Comprehensive', () => {
  const project = 'test-goal-bridge-comp';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM goal_links WHERE project = ?').run(project);
  });

  it('links and unlinks goals by task_id and entity_id, and extracts context without agent position', () => {
    const gold = EntityStore.addEntity(db, {
      project,
      name: 'Gold Vein',
      type: 'item',
      position: { x: 20, y: 0, z: 20 },
    });

    GoalBridge.linkToGoal(db, {
      project,
      task_id: 'task-mine-gold',
      entity_id: gold.id,
      relationship: 'resource',
      notes: 'High yield',
    });

    const links = GoalBridge.getLinkedGoals(db, { project, entity_id: gold.id });
    expect(links.length).toBe(1);
    expect(links[0].relationship).toBe('resource');

    // Context without agent position
    const ctxNoPos = GoalBridge.getRelevantContext(db, {
      project,
      task_id: 'task-mine-gold',
    });
    expect(ctxNoPos.goal_targets.length).toBe(1);

    // Unlink all for task
    const unlinked = GoalBridge.unlinkFromGoal(db, { project, task_id: 'task-mine-gold' });
    expect(unlinked).toBe(true);
  });
});
