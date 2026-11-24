/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端地址，例如 http://127.0.0.1:8000；未配置时使用内置默认值。 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
