import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import AvatarStack from '@/components/AvatarStack';

/**
 * The handoff's group avatar, built on MUI's AvatarGroup. MUI owns the surplus logic, so
 * these tests cover the two things this wrapper is actually responsible for: the geometry
 * that keeps a group inside one avatar's footprint, and the fallbacks either side of it.
 *
 * The geometry numbers are the design, not implementation detail - a group row has to
 * occupy the same box as a direct one or the list develops a ragged left edge.
 */

const member = (n: number) => ({ id: `u${n}`, name: `Person${n} Surname` });
const members = (count: number) => Array.from({ length: count }, (_, i) => member(i + 1));

const draw = (ui: React.ReactElement) => render(<ThemeModeProvider>{ui}</ThemeModeProvider>);

/** The rendered avatar circles, in DOM order. */
const avatars = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.MuiAvatar-root'));

describe('AvatarStack', () => {
  it('draws a plain avatar rather than a stack of one', () => {
    const { container } = draw(<AvatarStack members={members(1)} fallbackName="Solo" size={40} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // fallbackName wins over the one member's own name, per the handoff - the row is still
    // the thread, and the thread has a name.
    expect(container.textContent).toBe('S');
  });

  it('falls back for a group whose members have not loaded', () => {
    const { container } = draw(<AvatarStack members={[]} fallbackName="Design Guild" size={40} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.textContent).toBe('DG');
  });

  it('names the members for a screen reader instead of leaking initials', () => {
    draw(<AvatarStack members={members(2)} size={40} />);

    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Person1 Surname, Person2 Surname',
    );
  });

  it('labels exactly what is drawn, surplus included', () => {
    const { container } = draw(<AvatarStack members={members(6)} size={40} />);

    // AvatarGroup gives up one slot to the surplus once the total overflows max, so two
    // faces are visible and the tile reads "+4". The label has to agree with that, not
    // claim three names and "3 more".
    expect(container.textContent).toContain('+4');
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Person1 Surname, Person2 Surname and 4 more',
    );
  });

  it('lets MUI cap the faces and render the surplus', () => {
    const { container } = draw(<AvatarStack members={members(6)} size={40} />);

    // AvatarGroup renders max-1 faces plus one surplus tile, so max=3 gives 3 circles.
    const circles = avatars(container);
    expect(circles).toHaveLength(3);
    expect(container.textContent).toContain('+4');
  });

  it('sizes and overlaps the tight variant from size alone', () => {
    const { container } = draw(<AvatarStack members={members(3)} size={40} />);

    // cell = round(40 * 0.62) = 25; overlap = -round(25 * 0.55) = -14.
    const [first, second] = avatars(container);
    expect(first).toHaveStyle({ width: '25px', height: '25px' });
    expect(first).toHaveStyle({ marginLeft: '0px' });
    expect(second).toHaveStyle({ marginLeft: '-14px' });
  });

  it('stays proportional at compact density', () => {
    const { container } = draw(<AvatarStack members={members(3)} size={34} />);

    // cell = round(34 * 0.62) = 21; overlap = -round(21 * 0.55) = -12.
    const [first, second] = avatars(container);
    expect(first).toHaveStyle({ width: '21px', height: '21px' });
    expect(second).toHaveStyle({ marginLeft: '-12px' });
  });

  it('gives the row variant bigger faces and a looser overlap', () => {
    const { container } = draw(<AvatarStack members={members(3)} size={40} variant="row" />);

    // cell = round(40 * 0.78) = 31; overlap = -round(31 * 0.3) = -9.
    const [first, second] = avatars(container);
    expect(first).toHaveStyle({ width: '31px', height: '31px' });
    expect(second).toHaveStyle({ marginLeft: '-9px' });
  });

  /**
   * #47: the faces were always initials, whatever the members had uploaded, because
   * `toThread` discarded `avatarFileName` before it ever reached here. With the mapping
   * fixed the stack has to actually draw the file.
   */
  it('draws an uploaded avatar for a member who has one', () => {
    const { container } = draw(
      <AvatarStack
        members={[
          { id: 'u1', name: 'Sam Ray', avatarFileName: 'sam-avatar.png' },
          { id: 'u2', name: 'Jo Lin', avatarFileName: 'jo-avatar.png' },
        ]}
        size={40}
      />,
    );

    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    // AvatarGroup renders its children in reverse DOM order for the stacking, so compare
    // as a set rather than in order.
    expect(srcs).toHaveLength(2);
    expect(srcs.join(' ')).toContain('images/sam-avatar.png');
    expect(srcs.join(' ')).toContain('images/jo-avatar.png');
    // An avatar drawn from a file replaces the initials, it does not sit behind them.
    expect(container.textContent).toBe('');
  });

  it('still draws initials for a member with no avatar', () => {
    const { container } = draw(
      <AvatarStack
        members={[
          { id: 'u1', name: 'Sam Ray', avatarFileName: null },
          { id: 'u2', name: 'Jo Lin', avatarFileName: null },
        ]}
        size={40}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('JLSR');
  });

  it('mixes faces and initials in one group, keeping the geometry', () => {
    const { container } = draw(
      <AvatarStack
        members={[
          { id: 'u1', name: 'Sam Ray', avatarFileName: 'sam-avatar.png' },
          { id: 'u2', name: 'Jo Lin', avatarFileName: null },
          { id: 'u3', name: 'Ada Vine', avatarFileName: 'ada-avatar.png' },
        ]}
        size={40}
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(2);
    // The one without an avatar still shows initials.
    expect(container.textContent).toBe('JL');

    // An avatar rendered from a file is still an AvatarGroup child, so the group's own
    // geometry overrides have to land on it: cell = round(40 * 0.62) = 25, overlap = -14.
    const circles = avatars(container);
    expect(circles).toHaveLength(3);
    expect(circles[0]).toHaveStyle({ width: '25px', height: '25px', marginLeft: '0px' });
    expect(circles[1]).toHaveStyle({ width: '25px', height: '25px', marginLeft: '-14px' });
  });
});
