import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { Toaster } from '@/components/ui/toaster'
import { META_KEY } from '@/constants/enums'
import { metaService } from '@/services/metaService'
import { registerServiceWorker } from '@/pwa/registerSW'
import '@/styles/index.css'

async function bootstrap() {
  await metaService.initDefaults()
  await metaService.set(META_KEY.APP_VERSION, import.meta.env.VITE_APP_VERSION)
  registerServiceWorker()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
        <Toaster />
      </HashRouter>
    </StrictMode>,
  )
}

void bootstrap()
