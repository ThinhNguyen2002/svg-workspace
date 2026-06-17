import 'dotenv/config';
import chokidar from 'chokidar';
import { writeCatalogForSourceDir } from './icon-scanner/scan';

export async function runWatch(): Promise<void> {
  const sourceDir = process.env.RN_ICON_SOURCE_DIR;

  async function scan() {
    try {
      const catalog = await writeCatalogForSourceDir(sourceDir);
      console.log(`[icon-view] scanned ${catalog.icons.length} icons, ${catalog.errors.length} unsupported`);
    } catch (error) {
      console.error(`[icon-view] ${(error as Error).message}`);
    }
  }

  await scan();

  if (!sourceDir) {
    return;
  }

  chokidar
    .watch(['**/*.tsx', '**/*.jsx'], {
      cwd: sourceDir,
      ignoreInitial: true
    })
    .on('add', scan)
    .on('change', scan)
    .on('unlink', scan);

  console.log(`[icon-view] watching ${sourceDir}`);
}
