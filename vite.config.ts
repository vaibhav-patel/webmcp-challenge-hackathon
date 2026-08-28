import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// WebMCP requires an origin-isolated document. The browser opts a document into
// its own origin-keyed agent cluster only when the response carries this header.
// Without it, document.modelContext.registerTool rejects with a SecurityError.
// (Cloudflare Pages / Netlify get the same header from public/_headers.)
const originAgentCluster = {
  name: 'origin-agent-cluster-header',
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Origin-Agent-Cluster', '?1')
      next()
    })
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Origin-Agent-Cluster', '?1')
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), originAgentCluster],
  server: { host: true },
})
