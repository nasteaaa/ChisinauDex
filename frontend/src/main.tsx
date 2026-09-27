import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './i18n'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Suspends briefly while a non-Romanian language file or a page chunk downloads. */}
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
