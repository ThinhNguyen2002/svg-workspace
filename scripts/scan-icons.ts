import 'dotenv/config';
import { writeCatalogForSourceDir } from './icon-scanner/scan';

async function main(): Promise<void> {
  const watch = process.argv.includes('--watch');

  if (watch) {
    const { runWatch } = await import('./watch-icons');
    await runWatch();
    return;
  }

  try {
    const catalog = await writeCatalogForSourceDir(process.env.RN_ICON_SOURCE_DIR);
    console.log(`Scanned ${catalog.icons.length} icons with ${catalog.errors.length} unsupported files.`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
