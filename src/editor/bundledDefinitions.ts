// Registers the props, door types and NPCs that `npm run pull:shared` bundled into the release,
// so a build with no shared store (or a guest who is offline) still has them. Called once at startup.
import { installBundledActors } from "./sharedActors";
import { installBundledDoors } from "./sharedDoorTypes";
import { installBundledProps } from "./sharedProps";

export function installBundledDefinitions() {
  installBundledProps();
  installBundledDoors();
  installBundledActors();
}
