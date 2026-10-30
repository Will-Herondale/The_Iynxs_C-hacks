import { Badge } from '@setu/ui';
import { ViewSwitch } from './ViewSwitch';
import { useProjections, type ConnectionState } from '../data';

const CONN: Record<ConnectionState, { tone: 'success' | 'warning' | 'danger'; icon: string; label: string }> = {
  live: { tone: 'success', icon: '●', label: 'Live' },
  polling: { tone: 'warning', icon: '↻', label: 'Polling every 5s' },
  offline: { tone: 'danger', icon: '⦸', label: 'Offline (showing last data)' },
};

export function Header() {
  const { version, connection } = useProjections();
  const c = CONN[connection];
  return (
    <div className="cmd-header">
      <h1 className="cmd-title">SETU Command Centre</h1>
      <ViewSwitch />
      <span className="cmd-version" title="Projection version">v{version ?? '–'}</span>
      <span data-testid="connection-status" data-state={connection} role="status">
        <Badge tone={c.tone} icon={c.icon}>{c.label}</Badge>
      </span>
    </div>
  );
}
