import '@mui/material/styles';

/**
 * The theme in `tokens.js` carries keys MUI does not define: extra background slots and a
 * top-level `custom` bag, both taken verbatim from the design handoff. Without this
 * augmentation every `theme.custom.*` and `palette.background.chat` read is a type error,
 * which is why the theme file itself was left as JS during the TypeScript conversion.
 *
 * Declaring them here types those reads across the whole app - and means a future MUI major
 * that renames or removes a slot fails the typecheck instead of silently rendering wrong.
 */
declare module '@mui/material/styles' {
  interface TypeBackground {
    chat: string;
    field: string;
    quote: string;
    selected: string;
    skeleton: string;
  }

  interface CustomTokens {
    /** A second, stronger divider colour; MUI only exposes one. */
    border2: string;
    depth1: string;
    depth2: string;
    /** `alpha()` re-exported so components do not each import it. */
    tint: (color: string, opacity: number) => string;
  }

  interface Theme {
    custom: CustomTokens;
  }

  interface ThemeOptions {
    custom?: Partial<CustomTokens>;
  }
}
