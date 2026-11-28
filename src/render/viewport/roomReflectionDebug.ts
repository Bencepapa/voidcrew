import { BoxGeometry, Mesh, ShaderMaterial, type CubeTexture, type Scene } from "three";

const vertexShader = `
varying vec3 vCubeDirection;
void main() {
  vCubeDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
uniform samplerCube roomCube;
varying vec3 vCubeDirection;
void main() {
  gl_FragColor = vec4(textureCube(roomCube, normalize(vCubeDirection)).rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createRoomReflectionDebug(scene: Scene) {
  let cube: Mesh<BoxGeometry, ShaderMaterial> | undefined;
  return {
    update(texture?: CubeTexture, origin?: [number, number, number]) {
      if (!texture || !origin) {
        if (cube) {
          cube.visible = false;
          cube.material.uniforms.roomCube.value = null;
        }
        return;
      }
      if (!cube) {
        const material = new ShaderMaterial({ uniforms: { roomCube: { value: null } }, vertexShader, fragmentShader });
        material.allowOverride = false;
        cube = new Mesh(new BoxGeometry(0.32, 0.32, 0.32), material);
        cube.name = "roomReflectionDebug";
        cube.userData.excludeFromReflectionCapture = true;
        cube.raycast = () => {};
        scene.add(cube);
      }
      cube.visible = true;
      cube.position.fromArray(origin);
      cube.material.uniforms.roomCube.value = texture;
    },
    dispose() {
      cube?.removeFromParent();
      cube?.geometry.dispose();
      cube?.material.dispose();
    },
  };
}
