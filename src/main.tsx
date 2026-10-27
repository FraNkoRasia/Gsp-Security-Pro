import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const registrarServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      void registration.update()
    }).catch((error) => {
      console.error('GSP Security Pro: no se pudo registrar el Service Worker.', error)
    })

    // Evita recargas repetidas durante el uso: los cambios del Service Worker
    // se aplican al navegar/abrir de nuevo, no interrumpiendo la pantalla activa.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.info('GSP Security Pro: nueva versión disponible; se aplicará al volver a abrir la app.')
    })
  })
}

registrarServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
