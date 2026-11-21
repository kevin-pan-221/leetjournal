import * as THREE from 'three'

// Eye-level room framing: preserve a minimum horizontal field of view for the
// table, chest and stand rather than shrinking the entire room into a diorama.
export function fitStudyCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  camera.aspect = width / height
  camera.fov = Math.max(
    54,
    THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(33)) / camera.aspect),
    ),
  )
  camera.position.set(0, 2.45, 6.7)
  camera.lookAt(0, 1.45, -1.2)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}
