import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en-US";
import zh from "./locales/zh-TW";

void i18n.use(initReactI18next).init({
  resources: { "en-US": { translation: en }, "zh-TW": { translation: zh } },
  lng: localStorage.getItem("pantheon.locale") || "en-US",
  fallbackLng: "en-US",
  interpolation: { escapeValue: false },
});

export default i18n;
