interface ActionMenuProps {
  onForward: () => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
}

const ACTIONS = ["Forward", "Turn Left", "Turn Right", "Use", "Open", "Inspect", "Inventory", "Map", "Status", "Rest"] as const;

export function ActionMenu({ onForward, onTurnLeft, onTurnRight }: ActionMenuProps) {
  const handlers: Partial<Record<(typeof ACTIONS)[number], () => void>> = {
    Forward: onForward,
    "Turn Left": onTurnLeft,
    "Turn Right": onTurnRight,
  };

  return (
    <div className="border border-neutral-700 bg-neutral-900/80 p-2 flex flex-col gap-1 text-[11px] text-neutral-300">
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
