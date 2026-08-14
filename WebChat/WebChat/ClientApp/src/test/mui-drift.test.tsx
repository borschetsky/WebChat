import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Checkbox, InputBase, Stack, Switch } from '@mui/material';
import { buildTheme, densityTokens, avatarColor, initials, PRESENCE } from '@/theme/tokens';
import PresenceAvatar from '@/components/PresenceAvatar';

/**
 * Guards against the bug class that cost the most time in this project: props taken from
 * the v6-era design handoff that MUI v9 silently ignores.
 *
 * v9's createStack destructures only component/direction/spacing/divider/children and
 * spreads the rest onto the DOM node. React warns for unknown camelCase attributes but
 * passes lowercase ones through in silence - which is why `gap` went unnoticed for days
 * while `alignItems` produced console noise.
 */
describe('MUI v9 API drift', () => {
  const withTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={buildTheme('light')}>{ui}</ThemeProvider>);

  it('silently ignores system props written as props', () => {
    // Written the wrong way on purpose: this is what the handoff code looked like.
    const { container } = withTheme(
      // @ts-expect-error - deliberately passing props v9's Stack does not accept
      <Stack direction="row" gap={2} alignItems="center" data-testid="s">
        <span>a</span>
        <span>b</span>
      </Stack>,
    );
    const el = container.querySelector('[data-testid="s"]') as HTMLElement;
    const style = getComputedStyle(el);

    // Neither prop reaches the styles. This is the failure mode - the layout is simply
    // wrong, with no build error and nothing thrown.
    expect(style.gap).toBe('');
    expect(style.alignItems).not.toBe('center');

    // Both end up as junk DOM attributes. The asymmetry that made `gap` so much harder to
    // spot is only in the diagnostics: React warns about unknown camelCase props, so
    // `alignItems` announced itself in the console while `gap` went through in silence.
    expect(el.getAttribute('gap')).toBe('2');
    expect(el.getAttribute('alignitems')).toBe('center');
  });

  it('applies spacing and alignItems when written the supported way', () => {
    const { container } = withTheme(
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} data-testid="s">
        <span>a</span>
        <span>b</span>
      </Stack>,
    );
    const el = container.querySelector('[data-testid="s"]') as HTMLElement;
    const style = getComputedStyle(el);
    expect(style.alignItems).toBe('center');
    // spacing={2} resolves through the theme to a real gap rather than being dropped.
    expect(style.gap === '' ? style.columnGap : style.gap).not.toBe('');
  });

  /**
   * The same class as the Stack case above, and the one that has now cost the most sightings:
   * `inputProps` is not deprecated in v9, it is *gone* - the string does not appear in
   * @mui/material's Checkbox or Switch at all. So it lands in the rest-spread and the control
   * keeps whatever name it had, which for a bare switch or checkbox is none.
   *
   * These live in `.jsx`, which is why the type system never caught it: the handoff's spelling
   * type-errors in `.tsx` and passes in silence everywhere else.
   */
  it('drops inputProps on a Switch, and honours slotProps', () => {
    const wrong = withTheme(
      // @ts-expect-error - the handoff spelling, passed deliberately
      <Switch checked={false} onChange={() => {}} inputProps={{ 'aria-label': 'Dark mode' }} />,
    );
    expect(wrong.container.querySelector('input')?.getAttribute('aria-label')).toBeNull();

    const right = withTheme(
      <Switch
        checked={false}
        onChange={() => {}}
        slotProps={{ input: { 'aria-label': 'Dark mode' } }}
      />,
    );
    expect(right.container.querySelector('input')?.getAttribute('aria-label')).toBe('Dark mode');
  });

  it('drops inputProps on a Checkbox too - the whole SwitchBase family', () => {
    const wrong = withTheme(
      // @ts-expect-error - the handoff spelling, passed deliberately
      <Checkbox checked={false} onChange={() => {}} inputProps={{ 'aria-label': 'Select Maya' }} />,
    );
    expect(wrong.container.querySelector('input')?.getAttribute('aria-label')).toBeNull();
  });

  /**
   * The boundary, and the reason the guard below names components instead of the prop.
   *
   * `inputProps` is not gone from v9 - it is gone from the SwitchBase family. InputBase still
   * takes it, and `SearchField` and `Composer` still use it correctly. A sweep that replaced
   * every `inputProps` in the codebase would be changing working code on a false rule.
   */
  it('still honours inputProps on InputBase, which never lost it', () => {
    const { container } = withTheme(
      <InputBase value="" onChange={() => {}} inputProps={{ 'aria-label': 'Search' }} />,
    );
    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe('Search');
  });

  it('keeps the handoff tokens intact through createTheme', () => {
    const light = buildTheme('light');
    const dark = buildTheme('dark');

    // Custom palette keys and the top-level `custom` object are non-standard; a future MUI
    // major stripping them would break the whole design silently.
    expect(light.palette.background.chat).toBe('#ffffff');
    expect(light.palette.background.field).toBe('#f1f3f4');
    expect(dark.palette.background.quote).toBe('#22303c');
    expect(light.custom.border2).toBe('#c9ced3');
    expect(light.custom.depth2).toBe('0 10px 30px rgba(0,0,0,.14)');
    expect(light.custom.tint(light.palette.primary.main, 0.2)).toContain('rgba');
  });

  it('keeps density tokens and helpers stable', () => {
    expect(densityTokens('compact').avatar).toBe(34);
    expect(densityTokens('comfortable').avatar).toBe(40);
    expect(initials('Maya Rodriguez')).toBe('MR');
    expect(avatarColor('user-abc')).toBe(avatarColor('user-abc'));
    expect(PRESENCE.away).toBe('#f9a825');
  });
});

/**
 * The tests above prove the prop is dropped; this one is what stops it coming back.
 *
 * Three sightings so far - ComposeDialog's checkbox, every Switch on the Policies screen, and
 * the two settings switches plus the members-table row checkbox found while checkpointing #75.
 * Each was caught by accident. It survives because the affected components are used in `.jsx`,
 * where nothing type-checks the props, so no amount of per-component testing finds the next
 * one; scanning the source does.
 *
 * Scoped to the SwitchBase family on purpose - see the InputBase test above for why a scan for
 * the bare prop name would be wrong.
 */
describe('the handoff spelling does not come back', () => {
  const AFFECTED = ['Checkbox', 'Switch', 'Radio'];

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
    });

  /**
   * Which component does an `inputProps` belong to? The nearest JSX opening tag before it.
   *
   * Deliberately not a single regex spanning the tag: the obvious `<Checkbox[^>]*inputProps`
   * silently matches nothing, because `onChange={() => …}` puts a `>` inside the tag and ends
   * the character class early. That version passed against source that was provably broken.
   */
  const ownerOf = (source: string, at: number): string =>
    source.slice(0, at).match(/<([A-Z]\w*)[\s/]?[^<]*$/)?.[1] ?? '';

  it('has no inputProps on a Checkbox, Switch or Radio anywhere in src', () => {
    const src = join(__dirname, '..');

    const offenders = sourceFiles(src)
      // This file writes the prop on purpose, in the tests that prove it is dropped.
      .filter((file) => file !== join(__dirname, 'mui-drift.test.tsx'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return [...source.matchAll(/\binputProps\s*=/g)].some((m) =>
          AFFECTED.includes(ownerOf(source, m.index)),
        );
      });

    expect(offenders.map((f) => f.slice(src.length + 1))).toEqual([]);
  });
});

describe('PresenceAvatar', () => {
  const withTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={buildTheme('light')}>{ui}</ThemeProvider>);

  it('falls back to initials with no uploaded image', () => {
    const { getByText } = withTheme(
      <PresenceAvatar name="Maya Rodriguez" color="#7b1fa2" showPresence={false} />,
    );
    expect(getByText('MR')).toBeInTheDocument();
  });

  it('renders the uploaded avatar when one exists', () => {
    const { container } = withTheme(
      <PresenceAvatar name="Maya" avatarFileName="a.png" showPresence={false} />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toContain('images/a.png');
  });

  it('shows a presence dot only when asked', () => {
    const on = withTheme(<PresenceAvatar name="Maya" presence="online" />);
    expect(on.container.querySelector('.MuiBadge-root')).not.toBeNull();

    const off = withTheme(<PresenceAvatar name="Maya" presence="online" showPresence={false} />);
    expect(off.container.querySelector('.MuiBadge-root')).toBeNull();

    // 'group' opts out without needing a second prop.
    const group = withTheme(<PresenceAvatar name="Design Guild" presence="group" />);
    expect(group.container.querySelector('.MuiBadge-root')).toBeNull();
  });
});
