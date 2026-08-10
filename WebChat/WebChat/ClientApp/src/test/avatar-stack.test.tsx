import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import AvatarStack from '@/components/AvatarStack';

/**
 * The handoff's group avatar: up to three faces scattered inside one avatar's footprint,
 * alternating top and bottom, then a "+N" tile.
 *
 * The geometry numbers are the design, not implementation detail - a group row has to occupy
 * the same box as a direct one or the list develops a ragged left edge, and the alternation is
 * what makes a group read as a group rather than as a wider single avatar. Asserted on computed
 * pixel values so a change to the maths fails here rather than passing quietly.
 *
 * A revision of the handoff briefly rebuilt this on MUI's AvatarGroup, which lays children out
 * in a straight row. That was implemented and then reverted once the render was compared with
 * the design; these tests are the record of which layout is correct.
 */

const member = (n: number) => ({ id: `u${n}`, name: `Person${n} Surname` });
const members = (count: number) => Array.from({ length: count }, (_, i) => member(i + 1));

const draw = (ui: React.ReactElement) => render(<ThemeModeProvider>{ui}</ThemeModeProvider>);

/**
 * The tiles, in DOM order - the stack Box's direct children.
 *
 * Taken from the container rather than `getByRole("img")`: the stack carries role="img", but
 * so does every rendered <img> inside it, so that query is ambiguous the moment a member has
 * an uploaded avatar.
 *
 * Not filtered on `el.style.position` either - `sx` compiles to an emotion class, so inline
 * style is empty and such a filter silently matches nothing. `toHaveStyle` still works,
 * because jsdom resolves it through the stylesheet.
 */
const tiles = (container: HTMLElement) =>
  Array.from(container.firstElementChild!.children) as HTMLElement[];

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

  it('shows three faces and counts the rest', () => {
    const { container } = draw(<AvatarStack members={members(6)} size={40} />);

    // Three faces plus one surplus tile. AvatarGroup would have shown two faces and "+4",
    // because it gives up a slot to the surplus; this does not.
    expect(tiles(container)).toHaveLength(4);
    expect(container.textContent).toContain('+3');
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Person1 Surname, Person2 Surname, Person3 Surname and 3 more',
    );
  });

  it('alternates top and bottom rather than laying out in a row', () => {
    const { container } = draw(<AvatarStack members={members(4)} size={40} />);

    // cell = round(40 * 0.62) = 25; step = round(25 * 0.45) = 11; bottom = 40 - 25 = 15.
    const [a, b, c, surplus] = tiles(container);
    expect(a).toHaveStyle({ left: '0px', top: '0px', width: '25px', height: '25px' });
    expect(b).toHaveStyle({ left: '11px', top: '15px' });
    expect(c).toHaveStyle({ left: '22px', top: '0px' });
    expect(surplus).toHaveStyle({ left: '33px', top: '15px' });

    // The three assertions above are the alternation: a row would put every tile at top: 0.
    // Asserted through toHaveStyle rather than el.style.top, which is empty under emotion.
  });

  it('stays proportional at compact density', () => {
    const { container } = draw(<AvatarStack members={members(3)} size={34} />);

    // cell = round(34 * 0.62) = 21; step = round(21 * 0.45) = 9; bottom = 34 - 21 = 13.
    const [a, b] = tiles(container);
    expect(a).toHaveStyle({ width: '21px', height: '21px', left: '0px', top: '0px' });
    expect(b).toHaveStyle({ left: '9px', top: '13px' });
  });

  it('stacks the first face above the ones after it', () => {
    const { container } = draw(<AvatarStack members={members(3)} size={40} />);

    const [a, b, c] = tiles(container);
    expect(a).toHaveStyle({ zIndex: '3' });
    expect(b).toHaveStyle({ zIndex: '2' });
    expect(c).toHaveStyle({ zIndex: '1' });
  });

  it('keeps the container to one avatar footprint', () => {
    draw(<AvatarStack members={members(3)} size={40} />);

    expect(screen.getByRole('img')).toHaveStyle({ width: '40px', height: '40px' });
  });

  /**
   * #47: the faces were always initials, whatever members had uploaded, because `toThread`
   * discarded `avatarFileName` before it ever reached here.
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
    expect(srcs).toHaveLength(2);
    expect(srcs.join(' ')).toContain('images/sam-avatar.png');
    expect(srcs.join(' ')).toContain('images/jo-avatar.png');
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
    expect(container.textContent).toBe('SRJL');
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
    expect(container.textContent).toBe('JL');

    const [a, b] = tiles(container);
    expect(a).toHaveStyle({ left: '0px', top: '0px' });
    expect(b).toHaveStyle({ left: '11px', top: '15px' });
  });
});
