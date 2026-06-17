import 'dotenv/config';
import chokidar from 'chokidar';
import { writeCatalogForSourceDir } from './icon-scanner/scan';

export async function runWatch(): Promise<void> {
  const sourceDir = process.env.RN_ICON_SOURCE_DIR;
  let running = false;
  let pending = false;

  async function scan() {
    try {
      const catalog = await writeCatalogForSourceDir(sourceDir);
      console.log(`[icon-view] scanned ${catalog.icons.length} icons, ${catalog.errors.length} unsupported`);
    } catch (error) {
      console.error(`[icon-view] ${(error as Error).message}`);
    }
  }

  async function drainScans(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      while (pending) {
        pending = false;
        await scan();
      }
    } finally {
      running = false;
    }
  }

  function requestScan(): void {
    pending = true;
    void drainScans();
  }

  pending = true;
  await drainScans();

  if (!sourceDir) {
    return;
  }

  chokidar
    .watch(['**/*.tsx', '**/*.jsx'], {
      cwd: sourceDir,
      ignoreInitial: true
    })
    .on('add', requestScan)
    .on('change', requestScan)
    .on('unlink', requestScan);

  console.log(`[icon-view] watching ${sourceDir}`);
}
