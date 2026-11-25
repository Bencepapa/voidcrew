import { strict as assert } from "node:assert";
import { newerMapRevision, nextMapRevision } from "./sharedMapRevisions";

assert.equal(newerMapRevision(3, undefined), undefined);
assert.equal(newerMapRevision(3, 2), undefined);
assert.equal(newerMapRevision(3, 3), undefined);
assert.equal(newerMapRevision(3, 4), 4);
assert.equal(newerMapRevision(0, 1), 1);

assert.equal(nextMapRevision(0), 1);
assert.equal(nextMapRevision(3), 4);
assert.equal(nextMapRevision(3, 2), 4);
assert.equal(nextMapRevision(3, 6), 7);
