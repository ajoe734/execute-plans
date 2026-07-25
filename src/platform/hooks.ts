import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePlatform } from "./store";
import i18n from "@/i18n";
import { connectLiveSse, disconnectLiveSse } from "@/lib/bff-v1";

export const useLocaleSync = () => {
  const locale = usePlatform((s) => s.locale);
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);
};

export const useT = () => useTranslation().t;

/**
 * Shared live SSE connection lifecycle for any top-level app shell
 * (Management PlatformShell, Agora workbench shell, etc). Each shell owns its
 * own mount/unmount so navigating between shells does not leak a stale
 * connection, while both shells report through the same `liveStatus`/
 * `LiveStatusBanner` substrate.
 */
export const useLiveSseConnection = () => {
  useEffect(() => {
    connectLiveSse();
    return () => {
      disconnectLiveSse();
    };
  }, []);
};
