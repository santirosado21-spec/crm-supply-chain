import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías pesadas en chunks propios — antes todo iba en
        // un solo bundle de ~3.5 MB. Beneficio principal: estos chunks de
        // vendor se cachean entre deploys (cambiar código del app no los
        // invalida) y se descargan en paralelo.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          pdf: ['jspdf', 'pdf-lib', 'pdfjs-dist'],
          sheets: ['xlsx'],
          maps: ['leaflet'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
