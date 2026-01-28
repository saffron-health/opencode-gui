import { render } from 'solid-js/web';
import App from './App';
import { OpenCodeProvider } from './hooks/useOpenCode';
import { SyncProvider } from './state/sync';
import './App.css';

console.log('[OpenCode] Webview main.tsx loading...');
console.log('[OpenCode] Root element:', document.getElementById('root'));

try {
  render(
    () => (
      <OpenCodeProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </OpenCodeProvider>
    ),
    document.getElementById('root')!
  );
  console.log('[OpenCode] Webview rendered successfully');
} catch (error) {
  console.error('[OpenCode] Error rendering webview:', error);
}
