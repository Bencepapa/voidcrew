import MiniSearch from "minisearch";
import { normalizeSearch } from "./normalizeSearch";
import type { SearchTarget } from "./targets";

export function buildSearchIndex(targets: readonly SearchTarget[], titleFor: (target: SearchTarget) => string) {
  const byId = new Map(targets.map(target => [target.id, target]));
  const index = new MiniSearch({
    fields: ["title", "synonyms", "oldIds", "keywords"],
    searchOptions: {
      prefix: true,
      fuzzy: (term: string) => term.length >= 4 ? 0.2 : false,
      boost: { title: 8, synonyms: 4, oldIds: 2, keywords: 1 },
    },
  });
  index.addAll(targets.map(target => ({
    id: target.id,
    title: normalizeSearch(titleFor(target)),
    synonyms: normalizeSearch(target.synonyms.join(" ")),
    oldIds: normalizeSearch(target.oldIds?.join(" ") ?? ""),
    keywords: normalizeSearch(target.keywords.join(" ")),
  })));
  return {
    query(query: string, world?: SearchTarget["world"]): SearchTarget[] {
      return index.search(normalizeSearch(query), {
        boostDocument: (id: string | number) => world && byId.get(String(id))?.world === world ? 1.1 : 1,
      }).map((result: { id: string | number }) => byId.get(String(result.id))!);
    },
  };
}
