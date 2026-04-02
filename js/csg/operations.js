// ============================================================
// CSG Operations Manager
// Manages the working coordinate frame and CSG operations
// ============================================================
import * as THREE from 'three';
import { createShapeMesh, edgesToMesh, createCuboid, createCylinder, createCone, createSphere } from './primitives.js?v=4';

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
    const shapeUpper = shape.toUpperCase();
    const macros = [
      'PIN1', 'PIN2', 'PIN3', 'PIN4',
      'PART1', 'PART2', 'PART3', 'PART4',
      'BASE1', 'ARM1', 'ARM2', 'ARM3',
      'BLOCK1', 'CRANKSHAFT'
    ];

    if (macros.includes(shapeUpper)) {
      this._addMacroComponent(shapeUpper, params, isAdd);
      return null; // Macros build directly into the group
    }

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

  /**
   * Internal macro builder for complex predefined components
   */
  _addMacroComponent(shape, params, isAdd) {
    this.pushFrame();
    
    // Default safe fallbacks for missing params
    const p = (index, fallback = 0) => (params[index] !== undefined ? params[index] : fallback);

    switch (shape) {
      case 'PIN1': {
        // PIN1(D, d, H, h, u) 
        // D: base diam, d: pin diam, H: total height, h: base height, u: system Z-offset
        const [D, d, H, h, u] = [p(0,20), p(1,10), p(2,40), p(3,20), p(4,0)];
        this.translate(0, 0, -Math.abs(u));
        this.addShape('CYLINDER', [D/2, h], isAdd);
        this.translate(0, 0, h);
        this.addShape('CYLINDER', [d/2, Math.max(0, H - h)], isAdd);
        break;
      }
      
      case 'PIN2': {
        // PIN2(A, B, a, b, H, h, u)
        // Two cuboids
        const [A, B, a, b, H, h, u] = [p(0,20), p(1,20), p(2,10), p(3,10), p(4,40), p(5,20), p(6,0)];
        this.translate(0, 0, -Math.abs(u));
        this.addShape('CUBOID', [A, B, h], isAdd);
        this.translate(0, 0, h);
        this.addShape('CUBOID', [a, b, Math.max(0, H - h)], isAdd);
        break;
      }

      case 'PIN3': {
        // PIN3(A, B, d, H, h, u)
        // Base is cuboid, pin is cylinder
        const [A, B, d, H, h, u] = [p(0,20), p(1,20), p(2,10), p(3,40), p(4,20), p(5,0)];
        this.translate(0, 0, -Math.abs(u));
        this.addShape('CUBOID', [A, B, h], isAdd);
        this.translate(0, 0, h);
        this.addShape('CYLINDER', [d/2, Math.max(0, H - h)], isAdd);
        break;
      }

      case 'PIN4': {
        // PIN4(D, a, b, H, h, u)
        // Base is cylinder, pin is cuboid
        const [D, a, b, H, h, u] = [p(0,20), p(1,10), p(2,10), p(3,40), p(4,20), p(5,0)];
        this.translate(0, 0, -Math.abs(u));
        this.addShape('CYLINDER', [D/2, h], isAdd);
        this.translate(0, 0, h);
        this.addShape('CUBOID', [a, b, Math.max(0, H - h)], isAdd);
        break;
      }

      case 'PART1': {
        // PART1(A, B, H, a, b, e, u)
        // Cuboid with a slot at the bottom
        const [A, B, H, a, b, e, u] = [p(0,40), p(1,20), p(2,20), p(3,5), p(4,10), p(5,5), p(6,0)];
        this.translate(0, 0, -Math.abs(u));
        this.addShape('CUBOID', [A, B, H], isAdd);
        
        // Slot subtraction starts at X = a from the left edge (X = -A/2) -> X = -A/2 + a + b/2
        this.pushFrame();
        this.translate(-A/2 + a + b/2, 0, e/2); // Y centered, Z spans [0, e]
        this.addShape('CUBOID', [b, B + 2, e], false); // b width, slightly wider B to cut clean, e height
        this.popFrame();
        break;
      }

      case 'PART2': {
        // PART2(A, B, H, L, R, u)
        // Cuboid ending with a rounded half-cylinder of radius R
        const [A, B, H, L, R, u] = [p(0,20), p(1,20), p(2,20), p(3,50), p(4,10), p(5,0)];
        this.translate(0, 0, -Math.abs(u));
        // L is total length. Semi-cylinder takes R from L, cuboid takes L - R.
        const cuboidLen = Math.max(0, L - R);
        this.pushFrame();
        this.translate(-L/2 + cuboidLen/2, 0, 0);
        this.addShape('CUBOID', [cuboidLen, B, H], isAdd); // Along X
        this.popFrame();
        
        // Rounded end
        this.pushFrame();
        this.translate(L/2 - R, 0, H/2); // At the right end of the cuboid
        // align cylinder along Y so its circular faces are top/bottom? No, rounding the end -> vertical cylinder
        // Wait, standard part ending with semi-circle -> Vertical cylinder intersecting end
        this.rotateX(Math.PI/2); // To align cylinder with Z? No, CYLINDER creates along Z.
        // If CYLINDER creates along Z, we just use it directly!
        this.addShape('CYLINDER', [R, H], isAdd);
        this.popFrame();
        break;
      }

      case 'PART3': {
        // PART3(A, B, H, a, b, e, L, R, u)
        const [A, B, H, a, b, e, L, R, u] = [p(0,20), p(1,20), p(2,20), p(3,5), p(4,10), p(5,5), p(6,50), p(7,10), p(8,0)];
        this.translate(0, 0, -Math.abs(u));
        
        const cuboidLen = Math.max(0, L - R);
        this.pushFrame();
        this.translate(-L/2 + cuboidLen/2, 0, 0);
        this.addShape('CUBOID', [cuboidLen, B, H], isAdd);
        
        // Slot
        this.pushFrame();
        this.translate(-cuboidLen/2 + a + b/2, 0, e/2);
        this.addShape('CUBOID', [b, B + 2, e], false);
        this.popFrame();
        this.popFrame();

        // Rounded end
        this.pushFrame();
        this.translate(L/2 - R, 0, H/2);
        this.addShape('CYLINDER', [R, H], isAdd);
        this.popFrame();
        break;
      }

      case 'PART4': {
        // PART4(A, B, H, a, b, e, L, R, u)
        // Concave semi cylinder cut at the end
        const [A, B, H, a, b, e, L, R, u] = [p(0,20), p(1,20), p(2,20), p(3,5), p(4,10), p(5,5), p(6,50), p(7,10), p(8,0)];
        this.translate(0, 0, -Math.abs(u));
        
        this.pushFrame();
        this.translate(0, 0, 0);
        this.addShape('CUBOID', [L, B, H], isAdd);
        
        // Slot
        this.pushFrame();
        this.translate(-L/2 + a + b/2, 0, e/2);
        this.addShape('CUBOID', [b, B + 2, e], false);
        this.popFrame();
        
        // Concave cut
        this.pushFrame();
        this.translate(L/2, 0, H/2); // At the extreme end
        this.addShape('CYLINDER', [R, H + 2], false); // Subtract to form a concave scoop
        this.popFrame();

        this.popFrame();
        break;
      }

      case 'BASE1': {
        // BASE1(A, H, R, a, b, u)
        const [A, H, R, a, b, u] = [p(0,50), p(1,10), p(2,20), p(3,15), p(4,10), p(5,0)];
        this.translate(0, 0, -Math.abs(u));
        
        // Cuboid base
        this.pushFrame();
        this.translate(-R/2, 0, 0);
        this.addShape('CUBOID', [A, 2*R, H], isAdd);
        
        // Cutout
        this.pushFrame();
        this.translate(-A/2 + a + b/2, 0, H/2);
        this.addShape('CUBOID', [b, b, H + 2], false); // Square hole
        this.popFrame();
        this.popFrame();

        // Rounded end
        this.pushFrame();
        this.translate(A/2 - R/2, 0, H/2);
        this.addShape('CYLINDER', [R, H], isAdd);
        this.popFrame();
        break;
      }

      case 'ARM1': {
        // ARM1(L, B, R, u)
        const [L, B, R, u] = [p(0,50), p(1,10), p(2,15), p(3,0)];
        this.translate(0, 0, -Math.abs(u));
        
        const cuboidLen = Math.max(0, L - R);
        this.pushFrame();
        this.translate(-L/2 + cuboidLen/2, 0, 0);
        this.addShape('CUBOID', [cuboidLen, 2*R, B], isAdd);
        this.popFrame();
        
        this.pushFrame();
        this.translate(L/2 - R, 0, B/2);
        this.addShape('CYLINDER', [R, B], isAdd);
        this.popFrame();
        break;
      }

      case 'ARM2': {
        // ARM2(D, H, L, W, T, u) — same layout as ARM3 but without concave socket
        // D: pivot cylinder diameter
        // H: pivot cylinder height (along Z = DH rotation axis)
        // L: arm bar length (extends backward along -X, should match DH 'a')
        // W: arm bar width (along Y)
        // T: arm bar thickness (along Z)
        // u: Z offset
        const D2 = p(0, 24);
        const H2 = p(1, 24);
        const L2 = p(2, 40);
        const W2 = p(3, 12);
        const T2 = p(4, 12);
        const u2 = p(5, 0);

        if (u2 !== 0) this.translate(0, 0, -Math.abs(u2));

        // 1. Pivot cylinder centered at origin, along Z
        this.pushFrame();
        this.translate(0, 0, -H2 / 2);
        this.addShape('CYLINDER', [D2 / 2, H2], isAdd);
        this.popFrame();

        // 2. Arm bar extending backward along -X
        this.pushFrame();
        this.rotateY(-Math.PI / 2);
        this.addShape('CUBOID', [T2, W2, L2], isAdd);
        this.popFrame();

        break;
      }

      case 'ARM3': {
        // ARM3(D, H, L, W, T, u)
        // D: pivot cylinder diameter
        // H: pivot cylinder height (along Z = DH rotation axis)
        // L: arm bar length (extends backward along -X, should match DH 'a')
        // W: arm bar width (along Y)
        // T: arm bar thickness (along Z, should be < H so cylinder pokes through)
        // u: Z offset
        const D = p(0, 24);
        const H = p(1, 24);
        const L = p(2, 40);
        const W = p(3, 12);
        const T = p(4, 12);
        const u = p(5, 0);

        if (u !== 0) this.translate(0, 0, -Math.abs(u));

        // 1. Pivot cylinder centered at origin, along Z (the DH rotation axis)
        this.pushFrame();
        this.translate(0, 0, -H / 2);
        this.addShape('CYLINDER', [D / 2, H], isAdd);
        this.popFrame();

        // 2. Arm bar extending backward along -X toward previous joint
        //    ry(-90): maps local Z to DH -X direction
        //    CUBOID(T, W, L): T along local X → DH Z (centered), W along Y (centered), L along Z → DH -X
        this.pushFrame();
        this.rotateY(-Math.PI / 2);
        this.addShape('CUBOID', [T, W, L], isAdd);
        this.popFrame();

        // 3. Concave cylindrical socket at far end (at DH x = -L) for previous joint pin
        this.pushFrame();
        this.translate(-L, 0, -H / 2);
        this.addShape('CYLINDER', [D / 2 + 1, H + 2], false);
        this.popFrame();

        break;
      }

      case 'BLOCK1': {
        // BLOCK1(H, S, a, b, c, D_channel, n, u)
        const [H, S, a, b, c, D_channel, n, u] = [p(0,20), p(1,40), p(2,10), p(3,15), p(4,5), p(5,8), p(6,3), p(7,0)];
        this.translate(0, 0, -Math.abs(u));
        
        // Block main body. Let length dynamically grow based on chambers n
        const totalL = c * 2 + n * a + (n - 1) * c; 
        
        this.pushFrame();
        this.translate(totalL/2, 0, 0);
        this.addShape('CUBOID', [totalL, S, H], isAdd);
        
        // Chambers
        for (let i = 0; i < n; i++) {
          this.pushFrame();
          const posX = -totalL/2 + c + (a/2) + i * (a + c);
          this.translate(posX, 0, H/2);
          this.addShape('CUBOID', [a, b, H + 2], false); // Cut hole
          this.popFrame();
        }

        // Central channel
        this.pushFrame();
        this.translate(0, 0, H/2);
        this.rotateY(Math.PI/2); // Horizontal cylinder
        this.addShape('CYLINDER', [D_channel/2, totalL + 2], false);
        this.popFrame();

        this.popFrame();
        break;
      }

      case 'CRANKSHAFT': {
        // CRANKSHAFT(D, d, e, c, a, b, f, R, n, u)
        const [D, d, e, c, a, b, f, R, n, u] = [p(0,10), p(1,8), p(2,15), p(3,20), p(4,10), p(5,30), p(6,20), p(7,5), p(8,2), p(9,0)];
        this.translate(0, 0, -Math.abs(u));

        let currentX = 0;
        
        for (let i = 0; i < n; i++) {
          // Main journal
          this.pushFrame();
          this.translate(currentX + c/2, 0, 0);
          this.rotateY(Math.PI/2);
          this.addShape('CYLINDER', [D/2, c], isAdd);
          this.popFrame();
          currentX += c;

          // Web 1
          this.pushFrame();
          this.translate(currentX + a/2, e/2, 0);
          this.addShape('CUBOID', [a, e + Math.max(D,d), b], isAdd);
          this.popFrame();
          currentX += a;

          // Crankpin
          this.pushFrame();
          this.translate(currentX + f/2, e, 0);
          this.rotateY(Math.PI/2);
          this.addShape('CYLINDER', [d/2, f], isAdd);
          this.popFrame();
          currentX += f;

          // Web 2
          this.pushFrame();
          this.translate(currentX + a/2, e/2, 0);
          this.addShape('CUBOID', [a, e + Math.max(D,d), b], isAdd);
          this.popFrame();
          currentX += a;
        }

        // Final tail journal
        this.pushFrame();
        this.translate(currentX + c/2, 0, 0);
        this.rotateY(Math.PI/2);
        this.addShape('CYLINDER', [D/2, c], isAdd);
        this.popFrame();
        
        break;
      }
    }

    this.popFrame();
  }


  /** Execute a transform command */
  executeTransform(transformType, value) {
    switch (transformType.toUpperCase()) {
      case 'TX': this.translate(value, 0, 0); break;
      case 'TY': this.translate(0, value, 0); break;
      case 'TZ': this.translate(0, 0, value); break;
      case 'RX': this.rotateX(value * Math.PI / 180); break;
      case 'RY': this.rotateY(value * Math.PI / 180); break;
      case 'RZ': this.rotateZ(value * Math.PI / 180); break;
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
