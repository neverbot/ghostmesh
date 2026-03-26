/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}

interface Window {
  __ghostmeshImageError?: (img: HTMLImageElement) => void;
}
