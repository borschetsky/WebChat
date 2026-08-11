import { Typography } from '@mui/material';
import { useGetAuditQuery } from '@/app/api/adminApi';
import AuditRow from '../AuditRow';
import Panel from '../Panel';

/**
 * Actor, target, metadata, newest first.
 *
 * The spec's reason for it is worth keeping in view: "This is what makes block/unblock
 * defensible." A destructive action nobody can account for afterwards is one nobody should
 * take.
 */
export default function AdminAuditLog() {
  const { data: audit = [] } = useGetAuditQuery();

  return (
    <Panel sx={{ p: '8px 24px 16px' }}>
      {audit.map((a) => (
        <AuditRow key={a.id} entry={a} />
      ))}
      {audit.length === 0 && (
        <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
          Nothing has happened yet.
        </Typography>
      )}
    </Panel>
  );
}
