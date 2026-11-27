import MiniSearch from "minisearch";
import { normalizeSearch } from "./normalizeSearch";
import type { SearchTarget } from "./targets";

export function buildSearchIndex(targets: readonly SearchTarget[], titleFor: (target: SearchTarget) => string) {
  const byId = new Map(targets.map(target => [target.id, target]));
  const exactPhrases = new Map<string, Set<string>>();
  const index = new MiniSearch({
    fields: ["title", "synonyms", "oldIds", "keywords"],
    searchOptions: {
      prefix: true,
      fuzzy: (term: string) => term.length >= 4 ? 0.2 : false,
      boost: { title: 8, synonyms: 4, oldIds: 2, keywords: 1 },
    },
  });
  index.addAll(targets.map(target => {
    const title = normalizeSearch(titleFor(target));
    const synonyms = target.synonyms.map(normalizeSearch);
    for (const phrase of [title, ...synonyms]) {
      if (!phrase) continue;
      const matches = exactPhrases.get(phrase) ?? new Set<string>();
      matches.add(target.id);
      exactPhrases.set(phrase, matches);
    }
    return {
      id: target.id,
      title,
      synonyms: synonyms.join(" "),
      oldIds: normalizeSearch(target.oldIds?.join(" ") ?? ""),
      keywords: normalizeSearch(target.keywords.join(" ")),
    };
  }));
  return {
    query(query: string, world?: SearchTarget["world"]): SearchTarget[] {
      const phrase = normalizeSearch(query);
      const exact = exactPhrases.get(phrase);
      const results = index.search(phrase, {
        boostDocument: (id: string | number) => world && byId.get(String(id))?.world === world ? 1.1 : 1,
      });
      // A complete title or alias is more useful than a fuzzy or prefix-only hit.
      if (exact) results.sort((a, b) => Number(exact.has(String(b.id))) - Number(exact.has(String(a.id))));
      return results.map((result: { id: string | number }) => byId.get(String(result.id))!);
    },
  };
}
