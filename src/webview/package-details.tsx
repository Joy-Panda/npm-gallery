import React from 'react';
import { createRoot } from 'react-dom/client';
import { PackageDetailsView } from './components/PackageDetailsView';
import { VSCodeProvider } from './context/VSCodeContext';

// Get initial data from window if available
declare global {
  interface Window {
    initialData?: unknown;
  }
}

// Acquire VS Code API once at module level
interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const acquireVsCodeApi: () => VSCodeAPI;
const vscodeApi = acquireVsCodeApi();

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <VSCodeProvider vscode={vscodeApi}>
        <PackageDetailsView vscode={vscodeApi} initialData={window.initialData as never} />
      </VSCodeProvider>
    </React.StrictMode>
  );
}
