// movement handlers are omitted (buttons disabled) in free movement mode
interface ActionMenuProps {
  onForward?: () => void;
  onBack?: () => void;
  onTurnLeft?: () => void;
  onTurnRight?: () => void;
  // only while standing on a bridge
  onJumpDown?: () => void;
  // translucent variant for the mobile overlay layout
  compact?: boolean;
}

const ACTIONS = [
  "Forward",
  "Step Back",
  "Turn Left",
  "Turn Right",
  "Jump Down",
  "Use",
  "Open",
  "Inspect",
  "Inventory",
  "Map",
  "Status",
  "Rest",
] as const;

export function ActionMenu({ onForward, onBack, onTurnLeft, onTurnRight, onJumpDown, compact }: ActionMenuProps) {
  const handlers: Partial<Record<(typeof ACTIONS)[number], () => void>> = {
    Forward: onForward,
    "Step Back": onBack,
    "Turn Left": onTurnLeft,
    "Turn Right": onTurnRight,
    "Jump Down": onJumpDown,
  };

  return (
    <div
      className={`border border-neutral-700 p-2 flex flex-col gap-1 text-[11px] text-neutral-300 ${compact ? "bg-black/40" : "bg-neutral-900/80"}`}
    >
      {ACTIONS.map((action) => {
        const handler = handlers[action];
        return (
          <button
            key={action}
            onClick={handler}
            disabled={!handler}
            className={`text-left px-1 py-0.5 rounded-sm ${handler ? "hover:bg-neutral-700 cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
          >
            {action}
          </button>
        );
      })}
    </div>
  );
}
