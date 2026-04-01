// ============================================================
// CSG Operations Manager
// Manages the working coordinate frame and CSG operations
// ============================================================
import * as THREE from 'three';
import { createShapeMesh, edgesToMesh, createCuboid, createCylinder, createCone, createSphere } from './primitives.js';

export class CSGBuilder {
  constructor() {
    this.reset();
  }

  reset() {
    // Working coordinate frame stack
    this.frameStack = [new THREE.Matrix4()];
    // Stored positions (STPOS/REPOS)
    this.storedPositions = new Map();
    // Result group containing all wireframe meshes
    this.group = new THREE.Group();
    // Subtracted shapes (kept separately for visualization)
    this.subtractedGroup = new THREE.Group();
  }

  /** Get current working frame matrix */
  get currentFrame() {
    return this.frameStack[this.frameStack.length - 1].clone();
  }

  /** Push a copy of the current frame */
  pushFrame() {
    this.frameStack.push(this.currentFrame);
  }

  /** Pop the frame stack */
  popFrame() {
    if (this.frameStack.length > 1) {
      this.frameStack.pop();
    }
  }

  /** Set the current frame */
  setFrame(matrix) {
    this.frameStack[this.frameStack.length - 1] = matrix;
  }

  /** Apply translation to current frame */
  translate(dx, dy, dz) {
    const t = new THREE.Matrix4().makeTranslation(dx, dy, dz);
    const current = this.frameStack[this.frameStack.length - 1];
    current.multiply(t);
  }

  /** Apply rotation around X axis */
  rotateX(angle) {
    const r = new THREE.Matrix4().makeRotationX(angle);
    const current = this.frameStack[this.frameStack.length - 1];
    current.multiply(r);
  }

  /** Apply rotation around Y axis */
  rotateY(angle) {
    const r = new THREE.Matrix4().makeRotationY(angle);
    const current = this.frameStack[this.frameStack.length - 1];
    current.multiply(r);
  }

  /** Apply rotation around Z axis */
  rotateZ(angle) {
    const r = new THREE.Matrix4().makeRotationZ(angle);
    const current = this.frameStack[this.frameStack.length - 1];
    current.multiply(r);
  }

  /** Store position (STPOS) */
  storePosition(num) {
    this.storedPositions.set(num, this.currentFrame);
  }

  /** Restore position (REPOS) */
  restorePosition(num) {
    const stored = this.storedPositions.get(num);
    if (stored) {
      this.frameStack[this.frameStack.length - 1] = stored.clone();
    }
  }

  /** Add a CSG shape at current frame position */
  addShape(shape, params, isAdd = true) {
    const mesh = createShapeMesh(shape, params, isAdd);
    mesh.applyMatrix4(this.currentFrame);

    if (isAdd) {
      this.group.add(mesh);
    } else {
      this.subtractedGroup.add(mesh);
      this.group.add(mesh); // Also show subtracted shapes (in red)
    }

    return mesh;
  }

  /** Execute a transform command */
  executeTransform(transformType, value) {
    switch (transformType.toUpperCase()) {
      case 'TX': this.translate(value, 0, 0); break;
      case 'TY': this.translate(0, value, 0); break;
      case 'TZ': this.translate(0, 0, value); break;
      case 'RX': this.rotateX(value); break;
      case 'RY': this.rotateY(value); break;
      case 'RZ': this.rotateZ(value); break;
    }
  }

  /** Get the result group (for adding to scene) */
  getResult() {
    const result = new THREE.Group();
    result.add(this.group.clone());
    return this.group;
  }

  /** Get combined group including subtractions */
  getFullResult() {
    return this.group;
  }
}
