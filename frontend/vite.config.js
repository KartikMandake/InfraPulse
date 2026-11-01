import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build:{rollupOptions:{output:{manualChunks(id){
    if(id.includes('node_modules')){
      if(id.includes('recharts')||id.includes('/d3-')||id.includes('victory-vendor'))return 'charts-vendor';
      if(id.includes('@xyflow')||id.includes('@reactflow'))return 'topology-vendor';
      if(id.includes('react-dom')||id.includes('/react/')||id.includes('react-router')||id.includes('/scheduler/'))return 'react-vendor';
    }
  }}}},
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});

