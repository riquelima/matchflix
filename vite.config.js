import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main:          resolve(__dirname, 'index.html'),
        login:         resolve(__dirname, 'login.html'),
        cadastro:      resolve(__dirname, 'cadastro.html'),
        primeiroLogin: resolve(__dirname, 'primeiroLogin.html'),
        selecaoGeneros: resolve(__dirname, 'selecaoGeneros.html'),
        descobrir:     resolve(__dirname, 'descobrir.html'),
      }
    }
  }
});

