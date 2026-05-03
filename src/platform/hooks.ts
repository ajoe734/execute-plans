import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePlatform } from "./store";
import i18n from "@/i18n";

export const useLocaleSync = () => {
  const locale = usePlatform((s) => s.locale);
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);
};

export const useT = () => useTranslation().t;
