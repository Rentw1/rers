import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>,
  on: (channel: 'chat:event' | 'approval:request' | 'app:command', fn: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('nexus', api);

export type NexusApi = typeof api;
