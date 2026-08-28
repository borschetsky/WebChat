import { useEffect, useRef, useState } from 'react';
import { Button, Portal, Snackbar } from '@mui/material';
import type { SnackbarOrigin } from '@mui/material';

/**
 * Bottom-left, as the chat app has always shown it. A module constant rather than a default
 * in the destructuring, so the object identity is stable across renders.
 */
const DEFAULT_ANCHOR: SnackbarOrigin = { vertical: 'bottom', horizontal: 'left' };

type AppSnackbarProps = {
  /** The message to show. Empty means no snackbar; there is only ever one at a time. */
  message: string;
  /** Label of the single action, if this notification carries one. */
  actionLabel?: string;
  /** What the action does. Rendered only when both this and {@link actionLabel} are given. */
  onAction?: (() => void) | null;
  onClose: () => void;
  autoHideDuration?: number;
  /**
   * Whether a modal - a `Drawer` or a `Dialog` - currently has focus trapped. The caller knows
   * this; the snackbar cannot ask the document without guessing at MUI class names.
   */
  focusTrapped?: boolean;
  /**
   * Where the toast sits. Defaults to the chat app's bottom-left; the admin console asks for
   * bottom-centre, which is where its own inline snackbar sat before #102 folded it into this
   * component. It exists so that folding was behaviour-only - moving a toast the design put
   * somewhere is not a thing an accessibility fix should do on the way past.
   */
  anchorOrigin?: SnackbarOrigin;
};

/**
 * The app's one snackbar per screen, rendered through a portal - issue #96.
 *
 * Two screens use it: `ChatApp` and, since #102, `AdminConsole`, which had grown a second
 * inline `Snackbar` of its own carrying the identical defect. Anything that needs a toast
 * should render this rather than a `Snackbar`, because a divergent second implementation is
 * exactly how the console came to be missing everything below.
 *
 * **Why a portal.** A MUI `Drawer` is a `Modal`, and `ModalManager` marks every other child of
 * `body` `aria-hidden="true"` for as long as one is open. This snackbar used to render inline
 * in `ChatApp`'s tree, i.e. inside the app's own root div, so a toast raised from inside the
 * settings drawer was in that hidden subtree: on screen, clickable with a mouse, and absent
 * from the accessibility tree. Harmless while every such toast was message-only; #89 gave one
 * an Undo and had to close the drawer to make the button real. A portal puts the toast beside
 * the modal rather than behind it.
 *
 * **Why the portal is not sufficient on its own.** `ariaHiddenSiblings` runs *once*, when the
 * modal opens, over the children `body` has at that instant - so a toast raised afterwards is
 * simply never visited, but one already on screen when the drawer opens is hidden for the rest
 * of its life. The `MutationObserver` below makes the property hold in both orders and for
 * modals this component knows nothing about (the crop dialog opens from inside the drawer):
 * while this snackbar is open, it is never in an `aria-hidden` subtree. That is a deliberate
 * exemption from the modal's "hide everything else" rule, and the usual one - a toast is an
 * announcement about what just happened, and the thing that just happened is the modal's own
 * doing.
 *
 * **Why the action takes focus, and only sometimes.** Being in the accessibility tree still
 * does not make a control reachable while a modal is open: `FocusTrap` renders sentinel nodes
 * that send Tab back to the top of the trap, so no amount of tabbing leaves it, with or
 * without `disableEnforceFocus`. For a time-limited action that is the difference between a
 * working Undo and a decorative one, so the action is given focus - but only when focus was
 * trapped in the first place. With no modal open the toast sits at the end of the document,
 * Tab reaches it like anything else, and stealing focus from whatever the user was typing
 * would be the rude version of this fix. Focus is borrowed: whatever held it gets it back
 * when the toast goes, so a keyboard user is returned to the drawer rather than to `body`.
 *
 * The caller must also pass `disableEnforceFocus` to any modal it has open while an actionable
 * snackbar is up, or the trap pulls focus straight back. `ChatApp` does that from the same
 * flag it passes here.
 *
 * **One consequence of holding focus, deliberate.** MUI pauses the auto-hide timer while the
 * snackbar has focus and resumes it at half the duration on blur, so an actionable toast that
 * has been handed focus waits for the user instead of expiring under them - which is the right
 * way round for the one control standing where a confirm dialog would. The way out is already
 * there: `Snackbar` closes on `Escape` from a listener on the document, so it works with focus
 * parked outside the drawer, and the focus hand-back below returns the user to where they
 * were. Do not add an `onKeyDown` for this; it would be a second handler for the same key.
 */
export default function AppSnackbar({
  message,
  actionLabel,
  onAction,
  onClose,
  autoHideDuration,
  focusTrapped = false,
  anchorOrigin = DEFAULT_ANCHOR,
}: AppSnackbarProps) {
  const open = Boolean(message);
  const hasAction = Boolean(actionLabel && onAction);

  // State rather than a ref: the observer effect below has to run when the node arrives, and
  // the node arrives on a later commit than this component's first one. A `useRef` would be
  // null exactly when it matters - the same shape as #92's dialog measurement.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!root) return undefined;

    const unhide = () => {
      if (root.hasAttribute('aria-hidden')) root.removeAttribute('aria-hidden');
    };

    unhide();
    const observer = new MutationObserver(unhide);
    observer.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!open || !hasAction || !focusTrapped) return undefined;

    const button = actionRef.current;
    if (!button) return undefined;

    const previous = document.activeElement as HTMLElement | null;
    button.focus();

    return () => {
      // `isConnected`, because the element that had focus may have gone with the action - a
      // menu item, most often. Focusing a detached node silently does nothing useful.
      if (previous?.isConnected) previous.focus();
    };
  }, [open, hasAction, focusTrapped]);

  return (
    <Portal>
      <Snackbar
        ref={setRoot}
        open={open}
        message={message}
        autoHideDuration={autoHideDuration}
        onClose={onClose}
        anchorOrigin={anchorOrigin}
        action={
          hasAction ? (
            <Button ref={actionRef} color="primary" size="small" onClick={() => onAction?.()}>
              {actionLabel}
            </Button>
          ) : null
        }
      />
    </Portal>
  );
}
