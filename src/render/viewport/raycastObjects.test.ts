import assert from "node:assert/strict";
import { BoxGeometry, Group, Line, LineBasicMaterial, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { passesEditTransparency, raycastDrawn, seeThrough } from "./raycastObjects";

const scene = new Group();
const emitterMarker = new Group();
const ring = new Line(
  new BufferGeometry().setFromPoints([new Vector3(-1, 0, -1), new Vector3(1, 0, -1)]),
  new LineBasicMaterial(),
);
emitterMarker.visible = false;
emitterMarker.add(ring);
const item = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
item.position.z = -2;
scene.add(emitterMarker, item);
scene.updateMatrixWorld(true);

const ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1), 0, 3);
assert.equal(ray.intersectObjects(scene.children, true)[0]?.object, ring);
assert.equal(raycastDrawn(ray, scene.children)[0]?.object, item);

emitterMarker.visible = true;
assert.equal(raycastDrawn(ray, scene.children)[0]?.object, ring);
ring.visible = false;
assert.equal(raycastDrawn(ray, scene.children)[0]?.object, item);
item.visible = false;
assert.equal(raycastDrawn(ray, scene.children).length, 0);

const transparent = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
assert.equal(passesEditTransparency(transparent, true, true), false);
transparent.userData.pickTransparentProp = true;
assert.equal(passesEditTransparency(transparent, false, true), true);
assert.equal(passesEditTransparency(transparent, false, false), false);
assert.equal(seeThrough(transparent), true);

const looseItem = new Group();
looseItem.userData.itemIndex = 0;
looseItem.add(transparent);
delete transparent.userData.pickTransparentProp;
assert.equal(passesEditTransparency(transparent, true, false), true);
assert.equal(passesEditTransparency(transparent, false, true), false);
