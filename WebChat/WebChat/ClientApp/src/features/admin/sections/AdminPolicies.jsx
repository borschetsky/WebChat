import { Box, Stack, Switch, Typography } from '@mui/material';
import { useGetPoliciesQuery, useSetPolicyMutation } from '@/app/api/adminApi';
import Panel from '../Panel';
import { POLICY_GROUPS, policyState, policyValue, unknownPolicies } from '../policyCatalogue';

/**
 * Workspace policies.
 *
 * Every switch here either changes behaviour somewhere in the app or says plainly that it does
 * not yet - which is the whole of #75. The screen used to render nine switches over mock state
 * that reset on reload; one of the nine has an enforcement point today, one is enforced
 * unconditionally, and the remaining seven are drawn as inert rows rather than as controls
 * that appear to work.
 *
 * The server decides which is which. See `../policyCatalogue.ts`.
 */

/**
 * The small right-hand label that says what kind of row this is.
 *
 * A native `title` rather than MUI's `Tooltip`, and the reason is measurable: `Tooltip` pulls
 * Popper with it, and because this screen is only reachable through the lazy `/admin` import,
 * the vendor-splitting in `vite.config.ts` (`tags: ['$initial']`) cannot hoist it into
 * vendor-mui. It lands in the admin chunk instead - 34 kB to 67 kB for two hint bubbles. The
 * chart bars on the Overview already use a native title for the same reason.
 */
function StateTag({ children, title }) {
  return (
    <Box
      component="span"
      title={title}
      sx={{
        fontSize: 11,
        px: 0.875,
        py: 0.25,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        color: 'text.secondary',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

function PolicyRow({ row, state, value, disabled, onChange }) {
  const notEnforced = state === 'not-enforced';

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: 'center', py: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, color: notEnforced ? 'text.disabled' : 'text.primary' }}>
          {row.label}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{row.hint}</Typography>
      </Box>

      {state === 'always-on' && (
        <StateTag title="Enforced unconditionally. This is not a setting.">Always on</StateTag>
      )}

      {notEnforced && (
        <StateTag title="Nothing reads this yet, so it is shown rather than offered as a control.">
          Not enforced yet
        </StateTag>
      )}

      <Switch
        checked={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        // slotProps, not inputProps: MUI v9 drops inputProps silently - no warning, no error,
        // the control simply loses the attributes it carried. This row's only accessible name
        // comes from here, so the previous `inputProps` spelling left every switch on this
        // screen unnamed.
        slotProps={{ input: { 'aria-label': row.label } }}
      />
    </Stack>
  );
}

export default function AdminPolicies({ onNotify }) {
  const { data } = useGetPoliciesQuery();
  const [setPolicy, { isLoading: saving }] = useSetPolicyMutation();

  const change = async (key, label, value) => {
    try {
      await setPolicy({ key, value }).unwrap();
      onNotify?.(`${label} is now ${value ? 'on' : 'off'}`);
    } catch {
      // The query still holds the server's value, and the switch renders from it - so a
      // failure leaves the control showing what is actually configured rather than what was
      // clicked. That is the point of not keeping a local copy.
      onNotify?.('That policy could not be changed.');
    }
  };

  const extra = unknownPolicies(data);

  return (
    <Stack spacing={2}>
      {POLICY_GROUPS.map((group) => (
        <Panel key={group.title} sx={{ p: '20px 24px 8px' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>{group.title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>{group.sub}</Typography>

          {group.rows.map((row) => {
            const state = policyState(row.key, data);

            return (
              <PolicyRow
                key={row.key}
                row={row}
                state={state}
                value={policyValue(row.key, data)}
                disabled={state !== 'enforced' || saving}
                onChange={(value) => change(row.key, row.label, value)}
              />
            );
          })}
        </Panel>
      ))}

      {extra.length > 0 && (
        <Panel sx={{ p: '20px 24px 8px' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>Other policies</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
            Enforced by the server, but this version of the console has no description for them.
          </Typography>

          {extra.map((key) => (
            <PolicyRow
              key={key}
              row={{
                key,
                label: key,
                hint: 'Shown by its key, because this build does not know it.',
              }}
              state="enforced"
              value={policyValue(key, data)}
              disabled={saving}
              onChange={(value) => change(key, key, value)}
            />
          ))}
        </Panel>
      )}
    </Stack>
  );
}
