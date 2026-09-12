import { describe, expect, it } from 'vitest'

import { buildActivity, initialPresenceState, reduceResponse } from './presence'

describe('presence state and activity', () => {
  it('tracks sortie, map, battle and battle result', () => {
    let state = reduceResponse(initialPresenceState, '/kcsapi/api_req_map/start', { api_maparea_id: 9, api_mapinfo_no: 9 }, { api_maparea_id: 12, api_mapinfo_no: 1 })
    expect(state).toMatchObject({ sortie: true, map: '海域 12-1', battle: false })
    state = reduceResponse(state, '/kcsapi/api_req_sortie/battle', {})
    expect(state.battle).toBe(true)
    state = reduceResponse(state, '/kcsapi/api_req_sortie/battleresult', {})
    expect(state.battle).toBe(false)
  })

  it('uses body values when postBody has no map and does not expose practice map', () => {
    const state = reduceResponse(initialPresenceState, '/kcsapi/api_req_map/start', { api_maparea_id: 2, api_mapinfo_no: 3 })
    expect(state.map).toBe('海域 2-3')
    const practice = reduceResponse(state, '/kcsapi/api_req_practice/battle', {})
    expect(practice.practice).toBe(true)
    expect(practice.map).toBeNull()
  })

  it('does not expose map for practice and builds details/state', () => {
    const practice = reduceResponse(initialPresenceState, '/kcsapi/api_req_practice/battle', {})
    expect(practice.practice).toBe(true)
    const activity = buildActivity({ sortie: true, battle: false, map: '海域 1-1', practice: false }, 1700000000123, {
      showMap: true,
      largeImage: '',
      smallImage: '',
    })
    expect(activity).toMatchObject({ name: 'poi', details: '出撃中', state: '海域 1-1', timestamps: { start: 1700000000 } })
    expect(buildActivity(initialPresenceState, 1700000000123, { showMap: true, largeImage: '', smallImage: '' }).state).toBeUndefined()
  })
})
