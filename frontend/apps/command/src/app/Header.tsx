import { Badge } from '@setu/ui';
import { useProjections, type ConnectionState } from '../data';

const CONN: Record<ConnectionState, { tone: 'success' | 'warning' | 'danger'; icon: string; label: string }> = {
  live: { tone: 'success', icon: '●', label: 'Live' },
  polling: { tone: 'warning', icon: '↻', label: 'Polling every 5s' },
  offline: { tone: 'danger', icon: '⦸', label: 'Offline (showing last data)' },
};

export function Header() {
  const { snapshot, version, connection } = useProjections();
  const cutOff = snapshot?.settlements.features.filter((f) => f.properties.accessibility === 'cut_off').length;
  const blocked = snapshot?.roads.features.filter((f) => f.properties.status === 'blocked').length;
  const active = snapshot?.routes.features.filter((f) => f.properties.status !== 'unavailable').length;
  const c = CONN[connection];
  return (
    <div className="cmd-header">
      <h1 className="cmd-title">SETU Command Centre</h1>
      <dl className="cmd-stats">
        <div><dt>Cut-off settlements</dt><dd data-testid="stat-cut-off">{cutOff ?? '–'}</dd></div>
        <div><dt>Blocked roads</dt><dd data-testid="stat-blocked-roads">{blocked ?? '–'}</dd></div>
        <div><dt>Active routes</dt><dd data-testid="stat-active-routes">{active ?? '–'}</dd></div>
      </dl>
      <span className="cmd-version">v{version ?? '–'}</span>
      <span data-testid="connection-status" data-state={connection} role="status">
        <Badge tone={c.tone} icon={c.icon}>{c.label}</Badge>
      </span>
    </div>
  );
}
