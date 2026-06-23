import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconViewer } from './App';
import type { IconCatalog } from './types';

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('react-toastify', () => ({
  ToastContainer: () => null,
  toast: {
    success: toastSuccess
  }
}));

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
      importSnippet: "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';",
      props: [
        { name: 'width', value: '{SIZE_VALUE._16}', shorthand: false },
        { name: 'height', value: '{SIZE_VALUE._16}', shorthand: false },
        { name: 'fill', value: '{theme.colors.secondaryBlack.black04}', shorthand: false },
        { name: 'isShow', value: null, shorthand: true }
      ]
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
  setupError: 'Choose an SVG source folder to scan React Native, React, or raw SVG icons.',
  icons: [],
  errors: []
};

const duplicateNameCatalog: IconCatalog = {
  ...catalogFixture,
  icons: [
    {
      name: 'SharedIcon',
      category: 'actions',
      filePath: 'actions/SharedIcon.tsx',
      svg: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>',
      importSnippet: "import { SharedIcon } from '@/icons/actions/SharedIcon';"
    },
    {
      name: 'SharedIcon',
      category: 'navigation',
      filePath: 'navigation/SharedIcon.tsx',
      svg: '<svg viewBox="0 0 24 24"><path d="M2 2"/></svg>',
      importSnippet: "import { SharedIcon } from '@/icons/navigation/SharedIcon';"
    }
  ]
};

describe('IconViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastSuccess.mockClear();
  });

  it('renders icon grid, metadata, selected details, and unsupported file errors', () => {
    render(<IconViewer catalog={catalogFixture} />);

    expect(screen.getByText('2 icons')).toBeInTheDocument();
    expect(screen.getByText('/tmp/icons')).toBeInTheDocument();
    expect(screen.getByText(/6\/17\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /navigation 1 icon/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actions 1 icon/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ArrowLeftIcon/ })).not.toBeInTheDocument();

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('ArrowLeftIcon')).toBeInTheDocument();
    expect(within(detail).getByText('navigation')).toBeInTheDocument();
    expect(within(detail).getByText('navigation/ArrowLeftIcon.tsx')).toBeInTheDocument();
    expect(within(detail).getByText(/<ArrowLeftIcon/)).toBeInTheDocument();
    expect(within(detail).getByText(/fill=\{theme\.colors\.secondaryBlack\.black04\}/)).toBeInTheDocument();

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
    expect(within(screen.getByLabelText('Catalog metadata')).getByText('1 icon')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search icons'));
    await user.type(screen.getByLabelText('Search icons'), 'missing');

    expect(screen.getByText('No matching icons')).toBeInTheDocument();
    expect(screen.getByText('0 icons')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected icon details' })).toHaveTextContent('No icon selected');
    expect(screen.queryByRole('button', { name: 'Copy component name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy import snippet' })).not.toBeInTheDocument();
  });

  it('filters icons by category', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    await user.selectOptions(screen.getByLabelText('Category'), 'actions');

    expect(screen.queryByRole('button', { name: /ArrowLeftIcon/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actions 1 icon/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CloseIcon/ })).not.toBeInTheDocument();
  });

  it('updates detail panel when selecting an icon', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    await user.click(screen.getByRole('button', { name: /actions 1 icon/ }));
    await user.click(screen.getByRole('button', { name: /CloseIcon/ }));

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('CloseIcon')).toBeInTheDocument();
    expect(within(detail).getByText('actions')).toBeInTheDocument();
    expect(within(detail).getByText('actions/CloseIcon.jsx')).toBeInTheDocument();
  });

  it('selects duplicate icon names by file path', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={duplicateNameCatalog} />);

    await user.type(screen.getByLabelText('Search icons'), 'shared');
    await user.click(screen.getAllByRole('button', { name: /SharedIcon/ })[1]);

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('navigation/SharedIcon.tsx')).toBeInTheDocument();
  });

  it('shows all icons in a category when clicking the category name', async () => {
    const user = userEvent.setup();
    render(<IconViewer catalog={catalogFixture} />);

    expect(screen.queryByRole('button', { name: /CloseIcon/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /actions 1 icon/ }));

    expect(screen.getByRole('button', { name: /CloseIcon/ })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Copy usage example' }));

    expect(writeText).toHaveBeenNthCalledWith(1, 'ArrowLeftIcon');
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    );
    expect(writeText).toHaveBeenNthCalledWith(
      3,
      `<ArrowLeftIcon
  width={SIZE_VALUE._16}
  height={SIZE_VALUE._16}
  fill={theme.colors.secondaryBlack.black04}
  isShow
/>`
    );
    expect(toastSuccess).toHaveBeenLastCalledWith('Copied usage example.');
  });
});
