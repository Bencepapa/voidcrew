import { ITEM_TYPES } from "../game/items";
import { initialCrew } from "../game/crew";
import {
  MAX_LEVEL,
  WEAPON_TYPES,
  buyWeapon,
  canAfford,
  equip,
  resetMeta,
  sellItem,
  upgradeCost,
  upgradeWeapon,
  useMeta,
  weaponStats,
} from "../game/meta";
import type { OwnedWeapon } from "../game/meta";

// The base, between runs (see meta.ts): the stash and what it sells for,
// the crew's weapons (two slots each, upgrades), the shop - and on to the
// next ship.
const BTN = "border border-neutral-600 px-1.5 py-0.5 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent";

const stats = (w: OwnedWeapon) => {
  const s = weaponStats(w);
  return `${s.kind === "heal" ? "heals" : "dmg"} ${s.amount[0]}-${s.amount[1]}${s.burst ? ` x${s.burst}` : ""} · ${(s.cooldownMs / 1000).toFixed(1)} s${
    s.range ? ` · reach ${s.range}` : ""
  }${s.stunMs ? " · stuns" : ""}`;
};
const costText = (cost: { credits: number; items: Record<string, number> }) =>
  [`${cost.credits} cr`, ...Object.entries(cost.items).filter(([, n]) => n > 0).map(([item, n]) => `${n} ${ITEM_TYPES[item]?.name ?? item}`)].join(" + ");

export function BaseScreen({ onLaunch }: { onLaunch: () => void }) {
  const meta = useMeta();
  const stash = Object.entries(meta.stash)
    .filter(([, n]) => n > 0)
    .map(([item, count]) => ({ item, count, type: ITEM_TYPES[item] }))
    .sort((a, b) => (a.type?.category ?? "").localeCompare(b.type?.category ?? "") || a.item.localeCompare(b.item));
  const worth = stash.reduce((sum, r) => sum + r.count * (r.type?.value ?? 0), 0);
  const carried = new Set(Object.values(meta.loadout).flat());
  const spare = meta.weapons.filter((w) => !carried.has(w.id));
  const weaponRow = (w: OwnedWeapon) => {
    const cost = upgradeCost(w);
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span>
          {weaponStats(w).name} <span className="text-neutral-500">{stats(w)}</span>
        </span>
        {cost ? (
          <button type="button" className={BTN} disabled={!canAfford(cost)} onClick={() => upgradeWeapon(w.id)} title={`Upgrade to +${w.level + 1}`}>
            upgrade: {costText(cost)}
          </button>
        ) : (
          <span className="text-neutral-500">max (+{MAX_LEVEL})</span>
        )}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-40 bg-neutral-950 font-mono text-neutral-200 overflow-auto">
      <div className="mx-auto w-[64rem] max-w-[96%] p-4 text-[12px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div className="text-amber-200 text-sm tracking-widest">HOME SHIP</div>
          <div className="text-neutral-400">
            <span className="text-amber-200">{meta.credits} cr</span> · runs {meta.runs} · deepest {meta.depth}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section>
            <div className="text-neutral-500 mb-1">STASH ({worth} cr if sold)</div>
            {stash.length ? (
              <table className="w-full">
                <tbody>
                  {stash.map((r) => (
                    <tr key={r.item}>
                      <td className="text-neutral-500 pr-2">{r.type?.category ?? "?"}</td>
                      <td>{r.type?.name ?? r.item}</td>
                      <td className="text-right pr-2">{r.count}</td>
                      <td className="text-right text-neutral-400 pr-2">{r.type?.value ?? 0} cr</td>
                      <td className="text-right whitespace-nowrap">
                        <button type="button" className={BTN} onClick={() => sellItem(r.item, 1)}>
                          sell 1
                        </button>{" "}
                        <button type="button" className={BTN} onClick={() => sellItem(r.item, r.count)}>
                          all
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-neutral-500">Empty. Board a derelict and bring something back.</div>
            )}

            <div className="text-neutral-500 mt-4 mb-1">SHOP</div>
            {Object.entries(WEAPON_TYPES).map(([id, type]) => (
              <div key={id} className="flex items-center justify-between gap-2 py-0.5">
                <span>
                  {type.name} <span className="text-neutral-500">{type.blurb}</span>
                </span>
                <button type="button" className={`${BTN} whitespace-nowrap`} disabled={meta.credits < type.price} onClick={() => buyWeapon(id)}>
                  buy: {type.price} cr
                </button>
              </div>
            ))}
          </section>

          <section>
            <div className="text-neutral-500 mb-1">CREW - two weapons each (in a run: Shift+1..4 switches)</div>
            {initialCrew.map((mate) => (
              <div key={mate.id} className="border border-neutral-800 p-2 mb-2">
                <div className="text-amber-200 mb-1">
                  {mate.name} <span className="text-neutral-500">{mate.role}</span>
                </div>
                {([0, 1] as const).map((slot) => {
                  const id = meta.loadout[mate.id]?.[slot] ?? null;
                  const owned = meta.weapons.find((w) => w.id === id);
                  return (
                    <div key={slot} className="mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">{slot + 1}.</span>
                        <select
                          value={id ?? ""}
                          onChange={(e) => equip(mate.id, slot, e.target.value === "" ? null : Number(e.target.value))}
                          className="bg-neutral-900 border border-neutral-700 px-1 py-0.5 flex-1"
                        >
                          <option value="">- empty -</option>
                          {owned && <option value={owned.id}>{weaponStats(owned).name}</option>}
                          {spare.map((w) => (
                            <option key={w.id} value={w.id}>
                              {weaponStats(w).name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {owned && <div className="pl-5">{weaponRow(owned)}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
            {spare.length > 0 && (
              <>
                <div className="text-neutral-500 mt-2 mb-1">ARMORY (not carried)</div>
                {spare.map((w) => (
                  <div key={w.id}>{weaponRow(w)}</div>
                ))}
              </>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            className="text-[10px] text-neutral-600 hover:text-neutral-300"
            onClick={() => confirm("Start over? Credits, stash and weapons are lost.") && resetMeta()}
          >
            reset save
          </button>
          <button type="button" onClick={onLaunch} className="border border-amber-500/70 text-amber-200 px-6 py-2 hover:bg-amber-500/10">
            Scan for derelicts →
          </button>
        </div>
      </div>
    </div>
  );
}
