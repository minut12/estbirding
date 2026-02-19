/** Auto-detect and parse RSS or JSON feeds */

export interface FeedItem {
  id: string;
  title: string;
  date: string;
  source: string;
  excerpt: string;
  content: string;
  link: string;
}

export interface BirdEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  location: string;
  description: string;
  link: string;
}

/**
 * Fetch and auto-detect RSS or JSON news feed.
 * TODO: connect to real feed URL.
 */
export async function fetchNewsFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url);
  const text = await res.text();

  // Try JSON first
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map(mapJsonToFeedItem);
    if (json.items) return json.items.map(mapJsonToFeedItem);
  } catch {
    // Not JSON — try RSS/XML
  }

  return parseRss(text);
}

function mapJsonToFeedItem(item: any, index: number): FeedItem {
  return {
    id: item.id ?? String(index),
    title: item.title ?? '',
    date: item.date ?? item.pubDate ?? item.published ?? '',
    source: item.source ?? item.author ?? '',
    excerpt: item.excerpt ?? item.summary ?? (item.content ?? '').slice(0, 150),
    content: item.content ?? item.body ?? '',
    link: item.link ?? item.url ?? '',
  };
}

function parseRss(xml: string): FeedItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item, entry');
  const result: FeedItem[] = [];

  items.forEach((item, i) => {
    const get = (tag: string) => item.querySelector(tag)?.textContent ?? '';
    result.push({
      id: get('guid') || get('id') || String(i),
      title: get('title'),
      date: get('pubDate') || get('published') || get('updated'),
      source: get('author') || get('dc\\:creator') || '',
      excerpt: (get('description') || get('summary') || '').slice(0, 150),
      content: get('content\\:encoded') || get('content') || get('description') || '',
      link: item.querySelector('link')?.getAttribute('href') || get('link'),
    });
  });

  return result;
}

/**
 * Fetch events from a JSON feed.
 * TODO: connect to real events URL.
 */
export async function fetchEventsFeed(url: string): Promise<BirdEvent[]> {
  const res = await fetch(url);
  const json = await res.json();
  const items = Array.isArray(json) ? json : json.events ?? json.items ?? [];
  return items.map(mapJsonToEvent);
}

function mapJsonToEvent(item: any, index: number): BirdEvent {
  return {
    id: item.id ?? String(index),
    title: item.title ?? '',
    date: item.date ?? item.startDate ?? '',
    endDate: item.endDate,
    location: item.location ?? '',
    description: item.description ?? '',
    link: item.link ?? item.url ?? '',
  };
}
