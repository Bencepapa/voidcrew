// The movement pad and the context buttons, bottom left of the screen: turn
// left, forward, turn right on a row; strafe left, step back, strafe right
// under it (arrows) - and beside them a few buttons whose labels follow the
// situation (a door ahead: Open; a crate: Search...). Grid movement only.

interface MoveControlsProps {
  onTurnLeft: () => void;
  onForward: () => void;
  onTurnRight: () => void;
  onStrafeLeft: () => void;
  onBack: () => void;
  onStrafeRight: () => void;
  // what the first button does, and what to call it (e.g. "Open")
  onUse: () => void;
  useLabel: string;
  onInventory: () => void;
  // only while standing on a bridge
  onJumpDown?: () => void;
}

const ARROW =
  "w-9 h-8 flex items-center justify-center border border-neutral-600 bg-neutral-900/80 text-neutral-200 text-sm rounded-sm hover:bg-neutral-700 active:bg-neutral-600 select-none";
const SIDE =
  "px-2 h-8 min-w-[5.5rem] flex items-center justify-center border border-neutral-600 bg-neutral-900/80 text-neutral-200 text-[11px] rounded-sm hover:bg-neutral-700 active:bg-neutral-600 select-none";

export function MoveControls(p: MoveControlsProps) {
  const arrow = (label: string, title: string, onClick: () => void) => (
    <button type="button" className={ARROW} title={title} aria-label={title} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 items-start font-mono" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-3 gap-1">
        {arrow("↶", "Turn left (A)", p.onTurnLeft)}
        {arrow("▲", "Forward (W)", p.onForward)}
        {arrow("↷", "Turn right (D)", p.onTurnRight)}
        {arrow("◀", "Strafe left (Q)", p.onStrafeLeft)}
        {arrow("▼", "Step back (S)", p.onBack)}
        {arrow("▶", "Strafe right (E)", p.onStrafeRight)}
      </div>
      <div className="flex flex-col gap-1">
        <button type="button" className={SIDE} onClick={p.onUse}>
          {p.useLabel}
        </button>
        <button type="button" className={SIDE} onClick={p.onInventory}>
          Inventory
        </button>
        {p.onJumpDown && (
          <button type="button" className={SIDE} onClick={p.onJumpDown} title="Jump down (X)">
            Jump down
          </button>
        )}
      </div>
    </div>
  );
}
