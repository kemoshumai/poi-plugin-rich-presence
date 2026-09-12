declare module 'views/services/plugin-manager' {
  export interface Plugin { [key: string]: unknown }
}

declare module 'views/services/plugin-manager/utils' {
  export interface Plugin { [key: string]: unknown }
}

declare global {
  interface WindowEventMap {
    'game.response': CustomEvent<{ path: string; body: Record<string, unknown>; postBody: Record<string, unknown>; time: number }>
  }
  interface Window { isWindowMode?: boolean; isMain?: boolean }
}

export {}
