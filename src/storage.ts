import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { join } from 'path';
import type { PluginContext, CommunicationStoreData } from './types.js';

const FILE_NAME = 'data.json';
const CURRENT_VERSION = 1;

const EMPTY: CommunicationStoreData = {
  version: CURRENT_VERSION,
  announcements: [],
};

export class CommunicationStore {
  private ctx: PluginContext;
  private cache: CommunicationStoreData | null = null;
  /** Serialize writes via a chain that always resolves. A failing mutator re-throws to the caller but never poisons the chain for the next call. */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  private async filePath(): Promise<string> {
    const dir = await this.ctx.getPluginDataDir();
    return join(dir, FILE_NAME);
  }

  async load(): Promise<CommunicationStoreData> {
    if (this.cache) return this.cache;
    const path = await this.filePath();
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw) as CommunicationStoreData;
      this.cache = {
        version: parsed.version ?? CURRENT_VERSION,
        announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        this.cache = { ...EMPTY, announcements: [] };
      } else if (err instanceof SyntaxError) {
        const corruptPath = path + '.corrupt-' + Date.now();
        this.ctx.log.error(`[Communication] data.json is corrupted, moved to ${corruptPath}. Starting with an empty store.`);
        try { await rename(path, corruptPath); } catch { /* best effort */ }
        this.cache = { ...EMPTY, announcements: [] };
      } else {
        throw err;
      }
    }
    return this.cache!;
  }

  /** Runs a mutator under a serialized write lock. Persists via tmp + rename so a crash mid-write can never leave a truncated data.json. */
  async mutate(mutator: (data: CommunicationStoreData) => void | Promise<void>): Promise<CommunicationStoreData> {
    const run = async (): Promise<CommunicationStoreData> => {
      const data = await this.load();
      await mutator(data);
      data.version = CURRENT_VERSION;
      const path = await this.filePath();
      const tmpPath = path + '.tmp';
      await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      try {
        await rename(tmpPath, path);
      } catch (renameErr) {
        try { await unlink(tmpPath); } catch { /* ignore */ }
        throw renameErr;
      }
      this.cache = data;
      return data;
    };

    const next = this.writeChain.catch(() => undefined).then(run);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async snapshot(): Promise<CommunicationStoreData> {
    const data = await this.load();
    return JSON.parse(JSON.stringify(data)) as CommunicationStoreData;
  }
}
