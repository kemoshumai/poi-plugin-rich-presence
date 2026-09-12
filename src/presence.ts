import { isBattlePath, isBattleResultPath, isPracticePath } from './paths'
import type { RichActivity } from './rpc'

export interface PresenceState {
  sortie: boolean
  battle: boolean
  map: string | null
  practice: boolean
}

export const initialPresenceState: PresenceState = { sortie: false, battle: false, map: null, practice: false }

export const mapFromBody = (body: Record<string, unknown>, postBody: Record<string, unknown> = {}): string | null => {
  const area = postBody.api_maparea_id ?? postBody.api_mapareaid ?? body.api_maparea_id ?? body.api_mapareaid
  const info = postBody.api_mapinfo_no ?? postBody.api_mapinfo_id ?? body.api_mapinfo_no ?? body.api_mapinfo_id
  const valid = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number'
  if (!valid(area) && !valid(info)) return null
  if (valid(area) && valid(info)) return `海域 ${area}-${info}`
  return `海域 ${valid(area) ? area : info}`
}

export const reduceResponse = (state: PresenceState, path: string, body: Record<string, unknown>, postBody: Record<string, unknown> = {}): PresenceState => {
  if (path === '/kcsapi/api_port/port' || path === '/kcsapi/api_start2/getData') return { ...initialPresenceState }
  if (isPracticePath(path)) return { ...state, practice: true, sortie: false, battle: false, map: null }
  if (path === '/kcsapi/api_req_map/start') {
    return { ...state, sortie: true, practice: false, battle: false, map: mapFromBody(body, postBody) }
  }
  if (
    path === '/kcsapi/api_req_map/next' ||
    path.includes('/api_req_sortie/port') ||
    path === '/kcsapi/api_req_sortie/goback_port' ||
    path === '/kcsapi/api_req_combined_battle/goback_port' ||
    isBattleResultPath(path)
  ) {
    return { ...state, battle: false }
  }
  if (isBattlePath(path)) return { ...state, battle: true, map: mapFromBody(body, postBody) ?? state.map }
  return state
}

export interface ActivityOptions {
  showMap: boolean
  largeImage: string
  smallImage: string
}

export const buildActivity = (state: PresenceState, sessionStartedAt: number, options: ActivityOptions): RichActivity => {
  const activity: RichActivity = {
    type: 0,
    name: 'poi',
    details: state.battle ? '戦闘中' : state.sortie ? '出撃中' : '母港',
    state: state.sortie ? (options.showMap && state.map ? state.map : '艦隊運用中') : undefined,
    timestamps: { start: Math.floor(sessionStartedAt / 1000) },
    instance: false,
  }
  if (options.largeImage || options.smallImage) {
    activity.assets = {}
    if (options.largeImage) {
      activity.assets.large_image = options.largeImage
      activity.assets.large_text = 'poi'
    }
    if (options.smallImage) {
      activity.assets.small_image = options.smallImage
      activity.assets.small_text = state.battle ? '戦闘中' : 'オンライン'
    }
  }
  return activity
}
