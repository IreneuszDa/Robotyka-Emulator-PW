// ============================================================
// Denavit-Hartenberg Math
// ============================================================
import * as THREE from 'three';

/**
 * Compute the 4x4 DH transformation matrix.
 * Standard DH convention:
 *   a     = link length (along x_{i})
 *   alpha = twist angle (about x_{i})
 *   d     = offset (along z_{i-1})
 *   theta = joint angle (about z_{i-1})
 *
 * T = Rz(theta) * Tz(d) * Tx(a) * Rx(alpha)
 */
export function dhMatrix(a, alpha, d, theta) {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);

  const m = new THREE.Matrix4();
  m.set(
    ct,      -st * ca,   st * sa,   a * ct,
    st,       ct * ca,  -ct * sa,   a * st,
    0,        sa,        ca,        d,
    0,        0,         0,         1
  );
  return m;
}

/**
 * Compute forward kinematics: chain of DH transformations
 * @param {Array<{a, alpha, d, theta}>} dhParams
 * @returns {Array<THREE.Matrix4>} Array of cumulative transforms (one per joint)
 */
export function forwardKinematics(dhParams) {
  const transforms = [];
  let T = new THREE.Matrix4();

  for (const params of dhParams) {
    const Ti = dhMatrix(params.a, params.alpha, params.d, params.theta);
    T = T.clone().multiply(Ti);
    transforms.push(T.clone());
  }

  return transforms;
}

/**
 * Extract position from a 4x4 matrix
 */
export function getPosition(matrix) {
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(matrix);
  return pos;
}

/**
 * Extract rotation (as Euler) from a 4x4 matrix
 */
export function getRotation(matrix) {
  const euler = new THREE.Euler();
  euler.setFromRotationMatrix(matrix);
  return euler;
}

/**
 * Create a visual representation of a coordinate frame (axes)
 */
export function createFrameAxes(size = 50) {
  const group = new THREE.Group();

  // X axis (red)
  const xMat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
  const xGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(size, 0, 0)
  ]);
  group.add(new THREE.Line(xGeom, xMat));

  // Y axis (green)
  const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44, linewidth: 2 });
  const yGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, size, 0)
  ]);
  group.add(new THREE.Line(yGeom, yMat));

  // Z axis (blue)
  const zMat = new THREE.LineBasicMaterial({ color: 0x4444ff, linewidth: 2 });
  const zGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, size)
  ]);
  group.add(new THREE.Line(zGeom, zMat));

  return group;
}
