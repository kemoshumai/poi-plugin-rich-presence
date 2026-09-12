import { describe, expect, it } from 'vitest'

import { initialPresenceState, reduceResponse } from './presence'
import { isBattlePath, isPracticePath } from './paths'

describe('presence response path classification', () => {
  it('does not classify map navigation as a battle', () => {
    expect(isBattlePath('/kcsapi/api_req_map/next')).toBe(false)
    expect(isBattlePath('/kcsapi/api_req_map/select_eventmap_rank')).toBe(false)
  })

  it('includes normal, air, combined, and midnight battles', () => {
    expect(isBattlePath('/kcsapi/api_req_sortie/battle')).toBe(true)
    expect(isBattlePath('/kcsapi/api_req_sortie/airbattle')).toBe(true)
    expect(isBattlePath('/kcsapi/api_req_battle_midnight/sp_midnight')).toBe(true)
    expect(isBattlePath('/kcsapi/api_req_combined_battle/battle')).toBe(true)
    expect(isBattlePath('/kcsapi/api_req_combined_battle/ec_battle')).toBe(true)
    for (const path of [
      '/kcsapi/api_req_combined_battle/each_battle',
      '/kcsapi/api_req_combined_battle/each_battle_water',
      '/kcsapi/api_req_combined_battle/ld_airbattle',
      '/kcsapi/api_req_combined_battle/ld_shooting',
      '/kcsapi/api_req_combined_battle/sp_midnight',
    ]) {
      expect(isBattlePath(path)).toBe(true)
    }
  })

  it('does not classify return, result, or other non-battle combined APIs', () => {
    expect(isBattlePath('/kcsapi/api_req_combined_battle/goback_port')).toBe(false)
    expect(isBattlePath('/kcsapi/api_req_sortie/goback_port')).toBe(false)
    expect(isBattlePath('/kcsapi/api_req_combined_battle/battleresult')).toBe(false)
    expect(isBattlePath('/kcsapi/api_req_combined_battle/airbattle_result')).toBe(false)
  })

  it('explicitly clears battle state on normal and combined return APIs', () => {
    const battling = { ...initialPresenceState, sortie: true, battle: true, map: '海域 1-1' }
    expect(reduceResponse(battling, '/kcsapi/api_req_sortie/goback_port', {})).toMatchObject({ battle: false, sortie: true })
    expect(reduceResponse(battling, '/kcsapi/api_req_combined_battle/goback_port', {})).toMatchObject({ battle: false, sortie: true })
  })

  it('recognizes the actual practice API prefix', () => {
    expect(isPracticePath('/kcsapi/api_req_practice/battle')).toBe(true)
    expect(isPracticePath('/kcsapi/api_req_sortie/battle')).toBe(false)

  })
})
