import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConsoleApp } from './console/App';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConsoleApp />
  </StrictMode>,
);
