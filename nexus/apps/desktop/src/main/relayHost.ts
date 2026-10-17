import type { Server } from 'node:http';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { encodePairingUri } from '@nexus/core';
import { DeviceStore } from '@nexus/relay/devices';
import { createRelayServer, pairingPayload, type RelayDeps } from '@nexus/relay/server';
import { SyncStore } from '@nexus/relay/sync';
import type { RelayStatus } from '../shared/types';
import type { Store } from './store';
import { relayConfigFrom, type ToolHub } from './tools';

/** The phone-facing relay embedded in the desktop app: same protocol as the standalone Nexus Relay. */
export class RelayHost {
  private server: Server | null = null;
  private devices: DeviceStore;
  private sync: SyncStore;
  private error: string | undefined;

  constructor(
    private readonly store: Store,
    private readonly tools: ToolHub,
    private readonly hostName: string,
    private readonly log: (m: string) => void,
  ) {
    const dir = join(store.dir, 'relay');
    this.devices = new DeviceStore(dir);
    this.sync = new SyncStore(dir);
  }

  private deps(): RelayDeps {
    return { cfg: relayConfigFrom(this.store.settings.get(), this.hostName), devices: this.devices, servers: this.tools.servers, builtin: this.tools.builtin, sync: this.sync, log: this.log };
  }

  async apply(): Promise<void> {
    const s = this.store.settings.get();
    await this.stop();
    if (!s.relayEnabled) return;
    const srv = createRelayServer(this.deps());
    await new Promise<void>((resolve) => {
      srv.once('error', (e: NodeJS.ErrnoException) => {
        this.error = e.code === 'EADDRINUSE' ? `Порт ${s.relayPort} занят (возможно, запущен отдельный Nexus Relay). Выберите другой порт.` : e.message;
        resolve();
      });
      srv.listen(s.relayPort, '0.0.0.0', () => {
        this.error = undefined;
        this.server = srv;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const srv = this.server;
    this.server = null;
    if (srv) await new Promise<void>((r) => srv.close(() => r()));
    this.sync.flush();
  }

  async status(): Promise<RelayStatus> {
    const s = this.store.settings.get();
    if (!this.server) return { enabled: s.relayEnabled, running: false, port: s.relayPort, urls: [], qr: null, pairUri: null, expiresAt: null, devices: this.devices.list(), error: this.error };
    const payload = pairingPayload(this.deps());
    const uri = encodePairingUri(payload);
    return {
      enabled: true,
      running: true,
      port: s.relayPort,
      urls: payload.urls,
      qr: await QRCode.toDataURL(uri, { margin: 1, width: 300 }),
      pairUri: uri,
      expiresAt: payload.exp,
      devices: this.devices.list(),
      error: this.error,
    };
  }

  rotate(): void {
    this.devices.rotatePairCode();
  }

  revoke(id: string): void {
    this.devices.revoke(id);
  }
}
