import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // El Service Worker se registra explícitamente desde src/main.tsx.
      // Evita que el plugin inyecte un segundo registro en index.html.
      injectRegister: null,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['favicon.svg', 'Escudo.png', 'logoAPP.png'],
      manifest: {
        id: '/',
        name: 'GSP Security Pro — Gestión de Seguridad Profesional',
        short_name: 'GSP Security Pro',
        description: 'Plataforma profesional para la gestión de empresas de seguridad y servicios de vigilancia.',
        start_url: '/',
        scope: '/',
        theme_color: '#080C14',
        background_color: '#080C14',
        display: 'standalone',
        display_override: ['standalone'],
        prefer_related_applications: false,
        orientation: 'portrait-primary',
        // Usar el logo oficial de la pantalla de acceso y evitar el icono maskable
        // del escudo, que Android puede recortar al generar la pantalla de inicio.
        icons: [
          {
            src: '/logo-gsp.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/Escudo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logoAPP.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})
