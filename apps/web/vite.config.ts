import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'

function apiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyRes', (proxyRes) => {
        const cookies = proxyRes.headers['set-cookie']
        if (!cookies) return
        proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
          cookie
            .replace(/;\s*Domain=[^;]+/gi, '')
            .replace(/;\s*Secure/gi, ''),
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com', '.localhost', '.fema.monster'],
    proxy: {
      '/api': apiProxy('http://127.0.0.1:3000'),
      '/oauth': apiProxy('http://127.0.0.1:3000'),
    },
  },
})
