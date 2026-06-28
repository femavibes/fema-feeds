import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NsfwBlurProvider } from './lib/nsfw-blur'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <NsfwBlurProvider>
        <App />
      </NsfwBlurProvider>
    </ErrorBoundary>
  </StrictMode>,
)
