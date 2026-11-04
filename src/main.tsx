import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { requestPersistence } from './storage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Ask once per visit; browsers grant it quietly for sites in regular use (Chrome) or ignore it.
requestPersistence()
