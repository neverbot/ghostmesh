import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { yamlPlugin } from 'vite-yaml-plugin';

import { resolve, dirname } from 'node:path';
import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Optional backend for proxy-routed uploads (read from the shell or a .env
  // file). Unset by default: the frontend runs standalone and registers no
  // /api routes.
  const uploadProxyTarget: string | undefined =
    loadEnv(mode, process.cwd(), '').UPLOAD_PROXY_TARGET || undefined;

  return {
    plugins: [
      vue(),
      tailwindcss(),
      yamlPlugin(),
      VueI18nPlugin({
        include: [resolve(dirname(fileURLToPath(import.meta.url)), './src/i18n/locales/*.json')],
        strictMessage: false,
        runtimeOnly: true,
      }),
    ],
    define: {
      __VUE_I18N_FULL_INSTALL__: true,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_JIT_COMPILATION__: true,
      __INTLIFY_DROP_MESSAGE_COMPILER__: false,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      proxy: uploadProxyTarget
        ? {
            '/api/upload': {
              target: uploadProxyTarget,
              rewrite: (path: string): string => path.replace(/^\/api\/upload/, '/upload'),
            },
          }
        : undefined,
    },
  };
});
