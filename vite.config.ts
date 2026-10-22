import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Versie die je in Instellingen ziet: het commitnummer dat Netlify bouwt, plus de builddatum
    __APP_VERSION__: JSON.stringify(
      `${(process.env.COMMIT_REF ?? 'lokaal').slice(0, 7)} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    ),
  },
})
