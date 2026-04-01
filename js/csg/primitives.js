// ============================================================
// CSG Primitives — Wireframe Geometry Generators
// ============================================================
import * as THREE from 'three';

const WIRE_SEGMENTS = 24; // resolution for curved surfaces

/**
 * Creates a wireframe EdgesGeometry for a cuboid (box)
 * Origin: center of bottom face on XY plane
 */
export function createCuboid(dx, dy, dz) {
  const geom = new THREE.BoxGeometry(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  // Shift so bottom face center is at origin
  geom.translate(0, 0, Math.abs(dz) / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe EdgesGeometry for a cylinder
 * Origin: center of bottom circle on XY plane
 */
export function createCylinder(r, h) {
  const geom = new THREE.CylinderGeometry(Math.abs(r), Math.abs(r), Math.abs(h), WIRE_SEGMENTS);
  // Three.js cylinder is Y-axis oriented, we need Z-axis
  geom.rotateX(Math.PI / 2);
  geom.translate(0, 0, Math.abs(h) / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe EdgesGeometry for a cone/frustum
 * Origin: center of bottom circle on XY plane
 * r1: bottom radius, r2: top radius, h: height
 */
export function createCone(r1, r2, h) {
  const geom = new THREE.CylinderGeometry(Math.abs(r2), Math.abs(r1), Math.abs(h), WIRE_SEGMENTS);
  geom.rotateX(Math.PI / 2);
  geom.translate(0, 0, Math.abs(h) / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe EdgesGeometry for a sphere
 * Origin: center of sphere
 */
export function createSphere(r) {
  const geom = new THREE.SphereGeometry(Math.abs(r), WIRE_SEGMENTS, WIRE_SEGMENTS / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe for an infinite cylinder (approximated with large height)
 * Used for ICYL/OCYL elementary shapes
 */
export function createInfiniteCylinder(r, height = 5000) {
  const geom = new THREE.CylinderGeometry(Math.abs(r), Math.abs(r), height, WIRE_SEGMENTS);
  geom.rotateX(Math.PI / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe for a half-space (approximated with large box)
 * LHSP: z <= 0 (lower half space)
 * UHSP: z >= 0 (upper half space)
 */
export function createHalfSpace(isUpper, size = 2000) {
  const geom = new THREE.BoxGeometry(size, size, size);
  if (isUpper) {
    geom.translate(0, 0, size / 2);
  } else {
    geom.translate(0, 0, -size / 2);
  }
  return new THREE.EdgesGeometry(geom);
}

/**
 * Creates a wireframe for an infinite cone
 */
export function createInfiniteCone(halfAngleDeg, height = 3000) {
  const halfAngle = halfAngleDeg; // already in radians if processed
  const r = Math.abs(height * Math.tan(halfAngle));
  const geom = new THREE.CylinderGeometry(r, 0, height * 2, WIRE_SEGMENTS);
  geom.rotateX(Math.PI / 2);
  return new THREE.EdgesGeometry(geom);
}

/**
 * Utility: create a LineSegments mesh from EdgesGeometry
 */
export function edgesToMesh(edges, color = 0x00e676, opacity = 0.85) {
  const mat = new THREE.LineBasicMaterial({
    color: color,
    transparent: opacity < 1,
    opacity: opacity,
    linewidth: 1,
  });
  return new THREE.LineSegments(edges, mat);
}

/**
 * Create a complete wireframe mesh for a shape
 */
export function createShapeMesh(shape, params, isAdd = true) {
  const color = isAdd ? 0x00e676 : 0xff5252; // green for add, red for subtract
  const opacity = isAdd ? 0.85 : 0.5;
  let edges;

  const shapeUpper = shape.toUpperCase();

  switch (shapeUpper) {
    case 'CUBOID':
      edges = createCuboid(params[0] || 10, params[1] || 10, params[2] || 10);
      break;
    case 'CYLINDER':
      edges = createCylinder(params[0] || 10, params[1] || 10);
      break;
    case 'CONE':
      edges = createCone(params[0] || 10, params[1] || 5, params[2] || 10);
      break;
    case 'SPHERE':
    case 'WK':
      edges = createSphere(params[0] || 10);
      break;
    case 'ICYL':
      edges = createInfiniteCylinder(params[0] || 10, 1000);
      break;
    case 'OCYL':
      // Outside of cylinder — approximate with a larger shell
      edges = createInfiniteCylinder(params[0] || 10, 1000);
      break;
    case 'ISPH':
      edges = createSphere(params[0] || 10);
      break;
    case 'OSPH':
      edges = createSphere(params[0] || 10);
      break;
    case 'ICON':
      edges = createInfiniteCone(params[0] || 0.5);
      break;
    case 'OCON':
      edges = createInfiniteCone(params[0] || 0.5);
      break;
    case 'LHSP':
    case 'LSPC':
      edges = createHalfSpace(false, 1000);
      break;
    case 'UHSP':
    case 'USPC':
      edges = createHalfSpace(true, 1000);
      break;
    default:
      // Unknown shape: create a small marker sphere
      edges = createSphere(5);
      break;
  }

  return edgesToMesh(edges, color, opacity);
}
