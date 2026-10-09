import WebApp from "@twa-dev/sdk";

export function bootTelegram() {
  WebApp.ready();
  WebApp.expand();
  document.documentElement.dataset.scheme = WebApp.colorScheme;
  const user = WebApp.initDataUnsafe.user;
  return {
    initData: WebApp.initData,
    name: [user?.first_name, user?.last_name].filter(Boolean).join(" "),
  };
}
