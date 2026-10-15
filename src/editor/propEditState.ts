// The prop box editor's state (see PropEditor.tsx), shared with the editor
// bar's button that opens it and the viewport, which draws the edited
// type's boxes over its props and rebuilds them as they change.

export interface PropEditState {
  // the views prop type being edited (null: the editor is closed)
  name: string | null;
  // the selected box (an index into its parts)
  part: number;
  // bumped on every change to its PROP_TYPES entry (edited in place)
  version: number;
}

let state: PropEditState = { name: null, part: 0, version: 0 };
const listeners = new Set<() => void>();

export const propEdit = {
  get: (): PropEditState => state,
  set(patch: Partial<PropEditState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  // a change to the type's boxes or sizes
  changed() {
    propEdit.set({ version: state.version + 1 });
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
