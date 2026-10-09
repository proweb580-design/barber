/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface TelegramWebAppStub {
  initData: string;
  initDataUnsafe: { user?: { first_name?: string; last_name?: string } };
  themeParams: Record<string, string | undefined>;
  colorScheme: string;
  ready: () => void;
  expand: () => void;
}

interface Window {
  Telegram?: { WebApp: TelegramWebAppStub };
}
