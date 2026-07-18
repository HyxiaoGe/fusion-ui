"use client";

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useHasMounted } from "@/hooks/useHasMounted";
import "@/lib/i18n";

const CHINESE_LANGUAGE = "zh-CN";
const ENGLISH_LANGUAGE = "en-US";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const isEnglish = hasMounted && currentLanguage.toLowerCase().startsWith("en");
  const targetLanguage = isEnglish ? CHINESE_LANGUAGE : ENGLISH_LANGUAGE;
  const actionLabel = !hasMounted
    ? "语言 / Language"
    : isEnglish
      ? t("language.switchToChinese")
      : t("language.switchToEnglish");

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(targetLanguage)}
      disabled={!hasMounted}
      className="h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast"
      aria-label={actionLabel}
      title={actionLabel}
    >
      <Languages className="h-4 w-4" />
      {hasMounted && (
        <span className="text-[10px] font-semibold leading-none">
          {isEnglish ? "EN" : "中"}
        </span>
      )}
    </button>
  );
}
