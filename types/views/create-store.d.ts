export interface PoiStoreState {
  [key: string]: unknown
}

export function getStore(path?: string): PoiStoreState
export const store: { getState: () => PoiStoreState; subscribe: (listener: () => void) => () => void }
