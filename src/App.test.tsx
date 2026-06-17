import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconViewer } from './App';
import type { IconCatalog } from './types';

const catalogFixture: IconCatalog = {
  sourceDir: '/tmp/icons',
  generatedAt: '2026-06-17T00:00:00.000Z',
  status: 'ok',
  setupError: null,
  icons: [
    {
      name: 'ArrowLeftIcon',
      category: 'navigation',
      filePath: 'navigation/ArrowLeftIcon.tsx',
      svg: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
      importSnippet: "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    },
    {
      name: 'CloseIcon',
      category: 'actions',
      filePath: 'actions/CloseIcon.jsx',
      svg: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/></svg>',
      importSnippet: "import { CloseIcon } from '@/icons/actions/CloseIcon';"
    }
  ],
  errors: [
    {
      filePath: 'complex/ConditionalIcon.tsx',
      reason: 'Unsupported JSX expression container in Svg children'
    }
  ]
};

const setupErrorCatalog: IconCatalog = {
  sourceDir: null,
  generatedAt: null,
  status: 'setup-error',
  setupError: 'Run npm run scan:icons after setting RN_ICON_SOURCE_DIR in .env.',
  icons: [],
  errors: []
};

describe('IconViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders icon grid, metadata, selected details, and unsupported file errors', () => {
    render(<IconViewer catalog={catalogFixture} />);

    expect(screen.getByText('2 icons')).toBeInTheDocument();
    expect(screen.getByText('/tmp/icons')).toBeInTheDocument();
    expect(screen.getByText(/6\/17\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ArrowLeftIcon/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CloseIcon/ })).toBeInTheDocument();

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('ArrowLeftIcon')).toBeInTheDocument();
    expect(within(detail).getByText('navigation')).toBeInTheDocument();
    expect(within(detail).getByText('navigation/ArrowLeftIcon.tsx')).toBeInTheDocument();

    expect(screen.getByText('complex/ConditionalIcon.tsx')).toBeInTheDocument();
    expect(screen.getByText('Unsupported JSX expression container in Svg children')).toBeInTheDocument();
  });

  it('keeps the setup-error state visible when fallback catalog has a setup error', () => {
    render(<IconViewer catalog={setupErrorCatalog} />);

    expect(screen.getByRole('heading', { name: 'Scanner setup required' })).toBeInTheDocument();
    expect(screen.getByText(setupErrorCatalog.setupError as string)).toBeInTheDocument();
    expect(screen.getByText('0 icons')).toBeInTheDocument();
  });

  it('filters icons by search text and shows an empty state for no matches', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    await user.type(screen.getByLabelText('Search icons'), 'close');

    expect(screen.queryByRole('button', { name: /ArrowLeftIcon/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CloseIcon/ })).toBeInTheDocument();
    expect(screen.getByText('1 icon')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search icons'));
    await user.type(screen.getByLabelText('Search icons'), 'missing');

    expect(screen.getByText('No matching icons')).toBeInTheDocument();
    expect(screen.getByText('0 icons')).toBeInTheDocument();
  });

  it('filters icons by category', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    await user.selectOptions(screen.getByLabelText('Category'), 'actions');

    expect(screen.queryByRole('button', { name: /ArrowLeftIcon/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CloseIcon/ })).toBeInTheDocument();
  });

  it('updates detail panel when selecting an icon', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    await user.click(screen.getByRole('button', { name: /CloseIcon/ }));

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('CloseIcon')).toBeInTheDocument();
    expect(within(detail).getByText('actions')).toBeInTheDocument();
    expect(within(detail).getByText('actions/CloseIcon.jsx')).toBeInTheDocument();
  });

  it('copies the selected component name and import snippet', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    render(<IconViewer catalog={catalogFixture} />);
    await user.click(screen.getByRole('button', { name: 'Copy component name' }));
    await user.click(screen.getByRole('button', { name: 'Copy import snippet' }));

    expect(writeText).toHaveBeenNthCalledWith(1, 'ArrowLeftIcon');
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    );
  });
});
