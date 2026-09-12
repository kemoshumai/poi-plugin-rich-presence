const battlePaths = new Set([
  '/kcsapi/api_req_sortie/battle',
  '/kcsapi/api_req_sortie/airbattle',
  '/kcsapi/api_req_sortie/ld_airbattle',
  '/kcsapi/api_req_sortie/ld_shooting',
  '/kcsapi/api_req_sortie/night_to_day',
  '/kcsapi/api_req_battle_midnight/battle',
  '/kcsapi/api_req_battle_midnight/sp_midnight',
  '/kcsapi/api_req_combined_battle/battle',
  '/kcsapi/api_req_combined_battle/battle_water',
  '/kcsapi/api_req_combined_battle/airbattle',
  '/kcsapi/api_req_combined_battle/midnight_battle',
  '/kcsapi/api_req_combined_battle/ec_battle',
  '/kcsapi/api_req_combined_battle/ec_midnight_battle',
  '/kcsapi/api_req_combined_battle/ec_night_to_day',
  '/kcsapi/api_req_combined_battle/each_battle',
  '/kcsapi/api_req_combined_battle/each_battle_water',
  '/kcsapi/api_req_combined_battle/ld_airbattle',
  '/kcsapi/api_req_combined_battle/ld_shooting',
  '/kcsapi/api_req_combined_battle/sp_midnight',
])

const practicePrefix = '/kcsapi/api_req_practice/'

export const isPracticePath = (path: string): boolean => path.includes(practicePrefix)

export const isBattlePath = (path: string): boolean => battlePaths.has(path)

export const isBattleResultPath = (path: string): boolean =>
  path === '/kcsapi/api_req_sortie/battleresult' ||
  path === '/kcsapi/api_req_combined_battle/battleresult'
