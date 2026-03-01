export interface NewsSourceConfigItem {
  id: string;
  name: string;
  kind: "scrape" | "rss";
  url: string;
  enabled: boolean;
}

export const DEFAULT_NEWS_SOURCES: NewsSourceConfigItem[] = [
  {
    id: "eoy",
    name: "EOÜ",
    kind: "scrape",
    url: "https://www.eoy.ee/ET/uudised/",
    enabled: true,
  },
  {
    id: "birding_poland",
    name: "Birding Poland",
    kind: "rss",
    url: "https://rss.app/feeds/75MPfQwrc0XNIjzd.xml",
    enabled: true,
  },
];



