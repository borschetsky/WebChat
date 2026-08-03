import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Stack } from '@mui/material';
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
      <Stack direction="row" gap={2} alignItems="center" data-testid="s"><span>a</span><span>b</span></Stack>,
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
        <span>a</span><span>b</span>
      </Stack>,
    );
    const el = container.querySelector('[data-testid="s"]') as HTMLElement;
    const style = getComputedStyle(el);
    expect(style.alignItems).toBe('center');
    // spacing={2} resolves through the theme to a real gap rather than being dropped.
    expect(style.gap === '' ? style.columnGap : style.gap).not.toBe('');
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

describe('PresenceAvatar', () => {
  const withTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={buildTheme('light')}>{ui}</ThemeProvider>);

  it('falls back to initials with no uploaded image', () => {
    const { getByText } = withTheme(<PresenceAvatar name="Maya Rodriguez" color="#7b1fa2" showPresence={false} />);
    expect(getByText('MR')).toBeInTheDocument();
  });

  it('renders the uploaded avatar when one exists', () => {
    const { container } = withTheme(<PresenceAvatar name="Maya" avatarFileName="a.png" showPresence={false} />);
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
