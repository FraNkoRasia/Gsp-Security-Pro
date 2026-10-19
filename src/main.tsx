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

    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return
      recargando = true
      window.location.reload()
    })
  })
}

registrarServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
