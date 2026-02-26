export interface NewsSourceConfigItem {
  id: string;
  name: string;
  slug: string;
  key?: string | null;
  type: string;
  homepage_url: string | null;
  feed_url: string | null;
  is_enabled: boolean;
}

export const DEFAULT_NEWS_SOURCES: NewsSourceConfigItem[] = [
  {
    id: "default-eoy",
    name: "EOÜ",
    slug: "eoy",
    key: "eoy",
    type: "scrape",
    homepage_url: "https://www.eoy.ee/ET/uudised/",
    feed_url: "https://www.eoy.ee/ET/uudised/",
    is_enabled: true,
  },
  {
    id: "default-birding-poland",
    name: "Birding Poland",
    slug: "birding-poland",
    key: "birding-poland",
    type: "rss",
    homepage_url: "https://rss.app/feed/mn6SuRIcMkSczPdv",
    feed_url: "https://rss.app/feed/mn6SuRIcMkSczPdv",
    is_enabled: true,
  },
];
