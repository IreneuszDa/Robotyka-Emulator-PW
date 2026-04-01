// ============================================================
// Robot Kinematic Model
// ============================================================
import * as THREE from 'three';
import { dhMatrix, forwardKinematics, createFrameAxes } from './dh.js';

export class Joint {
  constructor(name, parentName, dhParams, limits, startValue) {
    this.name = name;
    this.parentName = parentName;
    this.dh = dhParams; // { a, alpha, d, theta, variableIndex: 'd' or 'theta' or null }
    this.limits = limits; // { min, max } or null
    this.startValue = startValue || 0;
    this.currentValue = this.startValue;
    this.geometry = null; // THREE.Group for this link's geometry
    this.isGripper = false;
  }

  /** Get the current DH parameters with joint variable applied */
  getCurrentDH() {
    const dh = { ...this.dh };
    if (dh.variableIndex === 'd') {
      dh.d = this.currentValue;
    } else if (dh.variableIndex === 'theta') {
      dh.theta = this.currentValue;
    }
    return dh;
  }
}

export class RobotModel {
  constructor(name) {
    this.name = name;
    this.joints = new Map();   // name → Joint
    this.linkOrder = [];       // ordered list of joint names (in kinematic chain order)
    this.baseGeometry = null;  // THREE.Group for the base link
    this.sceneGroup = new THREE.Group(); // root group in the scene
    this.linkGroups = new Map(); // name → THREE.Group (positioned in scene)
    this.showFrames = false;
    this.procedures = new Map(); // procedure name → procedure AST node
  }

  /** Add a joint/link to the robot */
  addJoint(joint) {
    this.joints.set(joint.name.toUpperCase(), joint);
    this.linkOrder.push(joint.name.toUpperCase());
  }

  /** Get a joint by name */
  getJoint(name) {
    return this.joints.get(name.toUpperCase()) || null;
  }

  /** Set a joint's configuration variable */
  setJointValue(name, value) {
    const joint = this.getJoint(name);
    if (!joint) return;

    // Clamp to limits
    if (joint.limits) {
      value = Math.max(joint.limits.min, Math.min(joint.limits.max, value));
    }

    joint.currentValue = value;
  }

  /** Get a joint's current value */
  getJointValue(name) {
    const joint = this.getJoint(name);
    return joint ? joint.currentValue : 0;
  }

  /** Compute forward kinematics and update scene positions */
  updateKinematics() {
    // Clear existing link groups
    while (this.sceneGroup.children.length > 0) {
      this.sceneGroup.remove(this.sceneGroup.children[0]);
    }

    // Add base geometry
    if (this.baseGeometry) {
      this.sceneGroup.add(this.baseGeometry.clone());
    }

    // Build kinematic chain
    // We need to resolve the parent-child relationships
    const parentMap = new Map(); // childName → parentName
    const childrenMap = new Map(); // parentName → [childName, ...]

    for (const [name, joint] of this.joints) {
      const parentName = (joint.parentName || 'BASE').toUpperCase();
      parentMap.set(name, parentName);
      if (!childrenMap.has(parentName)) childrenMap.set(parentName, []);
      childrenMap.get(parentName).push(name);
    }

    // Compute transforms recursively from BASE
    const worldTransforms = new Map();
    worldTransforms.set('BASE', new THREE.Matrix4());

    const computeTransform = (jointName) => {
      const joint = this.joints.get(jointName);
      if (!joint) return;

      const parentTransform = worldTransforms.get(joint.parentName.toUpperCase()) || new THREE.Matrix4();
      const dh = joint.getCurrentDH();
      const localTransform = dhMatrix(dh.a, dh.alpha, dh.d, dh.theta);
      const worldTransform = parentTransform.clone().multiply(localTransform);
      worldTransforms.set(jointName, worldTransform);

      // Position the link geometry
      if (joint.geometry) {
        const linkGroup = joint.geometry.clone();
        linkGroup.applyMatrix4(worldTransform);
        this.sceneGroup.add(linkGroup);
      }

      // Add coordinate frame visualization
      if (this.showFrames) {
        const frame = createFrameAxes(30);
        frame.applyMatrix4(worldTransform);
        this.sceneGroup.add(frame);
      }

      // Process children
      const children = childrenMap.get(jointName) || [];
      for (const childName of children) {
        computeTransform(childName);
      }
    };

    // Start from BASE children
    const baseChildren = childrenMap.get('BASE') || [];
    for (const childName of baseChildren) {
      computeTransform(childName);
    }

    // Store world transforms for external use
    this.worldTransforms = worldTransforms;
  }

  /** Get the world-space position of a link */
  getLinkWorldPosition(name) {
    const transform = this.worldTransforms?.get(name.toUpperCase());
    if (!transform) return new THREE.Vector3();
    return new THREE.Vector3().setFromMatrixPosition(transform);
  }

  /** Get all joint info for UI sliders */
  getJointInfo() {
    const info = [];
    for (const name of this.linkOrder) {
      const joint = this.joints.get(name);
      if (!joint) continue;
      if (joint.dh.variableIndex) {
        info.push({
          name: joint.name,
          value: joint.currentValue,
          min: joint.limits ? joint.limits.min : -1000,
          max: joint.limits ? joint.limits.max : 1000,
          isRotational: joint.dh.variableIndex === 'theta',
          startValue: joint.startValue
        });
      }
    }
    return info;
  }

  /** Reset all joints to start values */
  resetToStart() {
    for (const [name, joint] of this.joints) {
      joint.currentValue = joint.startValue;
    }
    this.updateKinematics();
  }
}
