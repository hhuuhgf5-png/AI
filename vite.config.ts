import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.GEMINI_API_KEY_1': JSON.stringify(process.env.VITE_GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY_1 || env.VITE_GEMINI_API_KEY_1 || env.GEMINI_API_KEY_1 || ''),
        'process.env.GEMINI_API_KEY_2': JSON.stringify(process.env.VITE_GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_2 || env.VITE_GEMINI_API_KEY_2 || env.GEMINI_API_KEY_2 || ''),
        'process.env.GEMINI_API_KEY_3': JSON.stringify(process.env.VITE_GEMINI_API_KEY_3 || process.env.GEMINI_API_KEY_3 || env.VITE_GEMINI_API_KEY_3 || env.GEMINI_API_KEY_3 || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
