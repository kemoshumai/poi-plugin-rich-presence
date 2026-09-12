export interface ConfigApi {
  get<T = unknown>(path: string, defaultValue?: T): T
  set(path: string, value: unknown): void
  addListener(event: string, listener: (path?: string, value?: unknown) => void): void
  removeListener(event: string, listener: (path?: string, value?: unknown) => void): void
}

export const config: ConfigApi
