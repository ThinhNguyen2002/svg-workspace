import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanIconDirectory, writeCatalogForSourceDir } from '../scan';

const fixtureDir = path.resolve('test/fixtures/icons');
const tmpDir = path.resolve('test/.tmp');

describe('scanIconDirectory', () => {
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scans supported icons and records unsupported files', async () => {
    const catalog = await scanIconDirectory(fixtureDir);

    expect(catalog.status).toBe('ok');
    expect(catalog.sourceDir).toBe(fixtureDir);
    expect(catalog.setupError).toBeNull();
    expect(catalog.generatedAt).toEqual(expect.any(String));
    expect(catalog.icons.map((icon) => icon.name).sort()).toEqual(['ArrowLeftIcon', 'CloseIcon']);
    expect(catalog.icons.find((icon) => icon.name === 'ArrowLeftIcon')).toMatchObject({
      category: 'navigation',
      filePath: 'navigation/ArrowLeftIcon.tsx',
      importSnippet: "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    });
    expect(catalog.icons.find((icon) => icon.name === 'CloseIcon')).toMatchObject({
      category: 'actions',
      filePath: 'actions/CloseIcon.jsx',
      importSnippet: "import { CloseIcon } from '@/icons/actions/CloseIcon';"
    });
    expect(catalog.errors).toEqual([
      {
        filePath: 'complex/ConditionalIcon.tsx',
        reason: 'Unsupported JSX expression container in Svg children'
      }
    ]);
  });

  it('writes setup-error JSON for a missing directory and throws after writing', async () => {
    const outputPath = path.join(tmpDir, 'missing-icons.json');
    const missingDir = path.join(tmpDir, 'does-not-exist');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.rm(outputPath, { force: true });

    await expect(writeCatalogForSourceDir(missingDir, outputPath)).rejects.toThrow(
      `RN_ICON_SOURCE_DIR does not exist: ${missingDir}`
    );

    const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(written).toMatchObject({
      sourceDir: missingDir,
      status: 'setup-error',
      setupError: `RN_ICON_SOURCE_DIR does not exist: ${missingDir}`,
      icons: [],
      errors: []
    });
    expect(written.generatedAt).toEqual(expect.any(String));
  });
});
