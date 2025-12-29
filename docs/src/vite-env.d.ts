/// <reference types="vite/client" />

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<any>
    on: (event: string, handler: (...args: any[]) => void) => void
    removeListener: (event: string, handler: (...args: any[]) => void) => void
  }
}
