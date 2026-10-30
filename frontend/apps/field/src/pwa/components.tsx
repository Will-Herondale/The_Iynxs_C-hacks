import { useInstallPrompt } from './useInstallPrompt.js';
import { useUpdateAvailable } from './register.js';

export function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button type="button" className="setu-button" data-testid="install-app" onClick={() => void install()}>
      Install app
    </button>
  );
}

export function UpdateToast() {
  const { available, reload, dismiss } = useUpdateAvailable();
  if (!available) return null;
  return (
    <div role="status" data-testid="update-toast" className="setu-panel" style={{ position: 'fixed', left: 12, right: 12, bottom: 72, zIndex: 50, display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>A new version of SETU Field is ready.</span>
      <button type="button" className="setu-button" data-testid="update-reload" onClick={reload}>Reload</button>
      <button type="button" className="setu-button" data-testid="update-dismiss" onClick={dismiss}>Later</button>
    </div>
  );
}
