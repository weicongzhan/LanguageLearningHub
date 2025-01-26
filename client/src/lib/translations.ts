export const translations = {
  en: {
    welcome: "Welcome",
    assignedLessons: "Your assigned lessons are below",
    progress: "Progress",
    continueButton: "Continue Learning",
    loading: "Loading...",
    noLessons: "No lessons assigned yet",
  },
  zh: {
    welcome: "欢迎",
    assignedLessons: "您的分配课程如下",
    progress: "进度",
    continueButton: "继续学习",
    loading: "加载中...",
    noLessons: "暂无分配课程",
  },
};

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en;

export function useTranslation(lang: Language = 'en') {
  return {
    t: (key: TranslationKey) => translations[lang][key],
    languages: Object.keys(translations) as Language[],
  };
}
