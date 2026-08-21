export const LEGACY_WORLD_TOOL_MAP: Record<string, string> = {
  create_entity: 'update_entity',
  find_entities: 'query_entities',
  get_entity_location: 'query_entities',
  get_location: 'query_entities',
  add_relation: 'set_relation',
  get_world_map: 'get_spatial_map',
  get_world_summary: 'get_spatial_map',
  get_navigation_hints: 'simulate_movement',
  reconcile_observation: 'ingest_observation',
  get_relevant_context: 'link_to_goal',
  undo_mutation: 'manage_snapshot',
  project_to_screen: 'generate_game_inputs',
};

export function translateLegacyWorldCall(toolName: string): string {
  return LEGACY_WORLD_TOOL_MAP[toolName] || toolName;
}

export function adaptLegacyParameters(
  legacyToolName: string,
  args: Record<string, any>
): { tool: string; args: Record<string, any> } {
  const tool = translateLegacyWorldCall(legacyToolName);
  const adaptedArgs = { ...args };

  switch (legacyToolName) {
    case 'get_location':
    case 'get_entity_location':
      // entity_id is already in args
      break;

    case 'get_world_summary':
      adaptedArgs.format = 'summary';
      break;

    case 'get_navigation_hints':
      adaptedArgs.mode = 'navigate';
      break;

    case 'reconcile_observation':
      adaptedArgs.reconcile = true;
      break;

    case 'get_relevant_context':
      adaptedArgs.action = 'get_context';
      break;

    case 'undo_mutation':
      adaptedArgs.action = 'undo';
      break;

    case 'project_to_screen':
      if (adaptedArgs.direction === 'screen_to_world') {
        adaptedArgs.action = 'unproject_ray';
      } else {
        adaptedArgs.action = 'project_screen';
      }
      break;
  }

  return { tool, args: adaptedArgs };
}
