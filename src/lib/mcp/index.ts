import { defineMcp } from "@lovable.dev/mcp-js";
import listRecentRareObservations from "./tools/list-recent-rare-observations";
import listRecentNews from "./tools/list-recent-news";
import listUpcomingEvents from "./tools/list-upcoming-events";

export default defineMcp({
  name: "estbirding-mcp",
  title: "EstBirding",
  version: "0.1.0",
  instructions:
    "Read-only tools for the EstBirding Estonian birding app: recent rare bird observations near Estonia, birding news, and upcoming events.",
  tools: [listRecentRareObservations, listRecentNews, listUpcomingEvents],
});
