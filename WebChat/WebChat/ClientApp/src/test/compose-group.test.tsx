import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import ComposeDialog from '@/features/threads/ComposeDialog';

/**
 * The modeless compose flow from the design handoff: one list, where ticking rows builds a
 * group and the chat-bubble button on a row opens a direct message. There is no mode toggle
 * and no group-name field, so the only thing standing between two ticks and a group is the
 * two-person minimum.
 */

const DIRECTORY = [
  { id: 'u1', name: 'Maya Rodriguez', role: 'Design', presence: 'online', avatarFileName: null },
  { id: 'u2', name: 'Tomás Lind', role: 'Ops', presence: 'away', avatarFileName: null },
  { id: 'u3', name: 'Priya Nair', role: 'Eng', presence: 'offline', avatarFileName: null },
];

function renderDialog(props: Record<string, unknown> = {}) {
  const onStart = vi.fn();
  const onStartGroup = vi.fn().mockResolvedValue(undefined);
  render(
    <ThemeModeProvider>
      <ComposeDialog
        open
        fullScreen={false}
        onClose={() => {}}
        onStart={onStart}
        onStartGroup={onStartGroup}
        onSearch={vi.fn().mockResolvedValue(DIRECTORY)}
        {...props}
      />
    </ThemeModeProvider>,
  );
  return { onStart, onStartGroup };
}

function type(el: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Types a term and lets the 250ms debounce and the resolved search settle. */
async function searchFor(term: string) {
  await act(async () => {
    type(screen.getByRole('textbox'), term);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('ComposeDialog, modeless', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('has no mode toggle and no group-name field', async () => {
    renderDialog();
    await searchFor('a');

    expect(screen.queryByRole('button', { name: 'New group' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
    // The search box is the only text input in the dialog, and it is named - the placeholder
    // is not an accessible name.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(
      screen.getByLabelText('Search the directory for someone to message'),
    ).toBeInTheDocument();
  });

  it('needs two people before a group can be created', async () => {
    renderDialog();
    await searchFor('a');

    const create = screen.getByRole('button', { name: /Create group/ });
    expect(create).toBeDisabled();
    expect(screen.getByText('No one selected')).toBeInTheDocument();

    await act(async () => {
      screen.getByLabelText('Select Maya Rodriguez').click();
    });
    expect(create).toBeDisabled();
    expect(screen.getByText('1 selected · pick one more for a group')).toBeInTheDocument();

    await act(async () => {
      screen.getByLabelText('Select Tomás Lind').click();
    });
    expect(screen.getByRole('button', { name: 'Create group (2)' })).toBeEnabled();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('hands the picked people to the caller, which derives the name', async () => {
    const { onStartGroup } = renderDialog();
    await searchFor('a');

    await act(async () => {
      screen.getByLabelText('Select Maya Rodriguez').click();
      screen.getByLabelText('Select Priya Nair').click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Create group (2)' }).click();
    });

    expect(onStartGroup).toHaveBeenCalledTimes(1);
    expect(onStartGroup.mock.calls[0][0].map((p: { id: string }) => p.id)).toEqual(['u1', 'u3']);
  });

  it('starts a direct message from the row button without selecting the row', async () => {
    const { onStart, onStartGroup } = renderDialog();
    await searchFor('a');

    await act(async () => {
      screen.getByLabelText('Direct message Tomás Lind').click();
    });

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'u2' }));
    expect(onStartGroup).not.toHaveBeenCalled();
    // stopPropagation: the row must not also have been ticked.
    expect(screen.getByText('No one selected')).toBeInTheDocument();
  });

  it('shows a removable chip for each picked person', async () => {
    renderDialog();
    await searchFor('a');

    await act(async () => {
      screen.getByLabelText('Select Maya Rodriguez').click();
    });
    // The chip carries the first name only, per the handoff.
    expect(screen.getByText('Maya')).toBeInTheDocument();

    await act(async () => {
      screen.getByLabelText('Select Maya Rodriguez').click();
    });
    expect(screen.queryByText('Maya')).not.toBeInTheDocument();
  });
});
