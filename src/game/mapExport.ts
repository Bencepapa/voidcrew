// Downloading a map's file (src/maps/<id>.json) as it is in the repo -
// to carry it over to another copy of the repo, say.

const RAW = import.meta.glob<string>("../maps/*.json", { eager: true, query: "?raw", import: "default" });

export function downloadMap(id: string) {
  const text = Object.entries(RAW).find(([path]) => path.endsWith(`/${id}.json`))?.[1];
  if (text === undefined) return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
