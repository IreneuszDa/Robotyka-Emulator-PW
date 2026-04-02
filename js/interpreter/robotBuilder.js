// ============================================================
// Robot Builder — Constructs RobotModel from parsed AST
// ============================================================
import * as THREE from 'three';
import { NodeType } from '../parser/parser.js';
import { CSGBuilder } from '../csg/operations.js?v=7';
import { Joint, RobotModel } from '../robot/kinematics.js';

/**
 * Process a GEOMETRY procedure's body to extract per-link CSG groups.
 * Returns: { base: THREE.Group, links: Map<name, THREE.Group> }
 */
function buildGeometry(geometryProc, interpreter, allProcedures) {
  const builder = new CSGBuilder();
  const links = new Map();
  let currentLinkName = 'BASE';
  let currentBuilder = new CSGBuilder();
  const gripperLinks = new Set();

  const body = geometryProc.body || [];

  for (const stmt of body) {
    switch (stmt.type) {
      case NodeType.OBJECT_DECL: {
        // Save current link geometry
        links.set(currentLinkName.toUpperCase(), currentBuilder.getFullResult());
        // Start new link
        currentLinkName = stmt.name;
        currentBuilder = new CSGBuilder();
        if (stmt.isGripper) {
          gripperLinks.add(stmt.name.toUpperCase());
        }
        break;
      }

      case NodeType.TRANSFORM: {
        const value = resolveValue(stmt.value, interpreter);
        const finalValue = stmt.isDegrees ? value : value;
        currentBuilder.executeTransform(stmt.transform, finalValue);
        break;
      }

      case NodeType.CSG_OP: {
        const shape = stmt.shape.toUpperCase();
        const params = (stmt.params || []).map(p => resolveValue(p, interpreter));

        // Check if it's a user-defined procedure (non-standard shape name)
        const standardShapes = [
          'CUBOID', 'CYLINDER', 'CONE', 'SPHERE', 'WK',
          'LHSP', 'UHSP', 'LSPC', 'USPC',
          'ICYL', 'OCYL', 'ISPH', 'OSPH', 'ICON', 'OCON',
          'PIN1', 'PIN2', 'PIN3', 'PIN4',
          'PART1', 'PART2', 'PART3', 'PART4',
          'BASE1', 'ARM1', 'ARM2', 'ARM3',
          'BLOCK1', 'CRANKSHAFT'
        ];

        if (!standardShapes.includes(shape)) {
          // User-defined shape procedure
          const procName = stmt.shape.toUpperCase();
          const proc = allProcedures.get(procName);
          if (proc) {
            // Set parameters
            if (proc.params && params.length > 0) {
              for (let i = 0; i < proc.params.length && i < params.length; i++) {
                interpreter.variables.set(proc.params[i], params[i]);
              }
            }
            // Save frame, process procedure body, restore frame
            const savedFrame = currentBuilder.currentFrame;
            processGeometryBody(proc.body, currentBuilder, interpreter, allProcedures);
            // Note: don't restore frame — procedure transforms accumulate as per spec
          }
        } else {
          currentBuilder.addShape(shape, params, stmt.isAdd);
        }
        break;
      }

      case NodeType.STPOS: {
        const num = resolveValue(stmt.number, interpreter);
        currentBuilder.storePosition(Math.floor(num));
        break;
      }

      case NodeType.REPOS: {
        const num = resolveValue(stmt.number, interpreter);
        currentBuilder.restorePosition(Math.floor(num));
        break;
      }

      case NodeType.ASSIGNMENT: {
        interpreter.executeStatement(stmt);
        break;
      }

      default:
        break;
    }
  }

  // Save last link
  links.set(currentLinkName.toUpperCase(), currentBuilder.getFullResult());

  return { links, gripperLinks };
}

/**
 * Recursively process geometry body (for user-defined procedure calls inside geometry)
 */
function processGeometryBody(body, builder, interpreter, allProcedures) {
  for (const stmt of body) {
    switch (stmt.type) {
      case NodeType.TRANSFORM: {
        const value = resolveValue(stmt.value, interpreter);
        builder.executeTransform(stmt.transform, value);
        break;
      }
      case NodeType.CSG_OP: {
        const shape = stmt.shape.toUpperCase();
        const params = (stmt.params || []).map(p => resolveValue(p, interpreter));
        const standardShapes = [
          'CUBOID', 'CYLINDER', 'CONE', 'SPHERE', 'WK',
          'LHSP', 'UHSP', 'LSPC', 'USPC',
          'ICYL', 'OCYL', 'ISPH', 'OSPH', 'ICON', 'OCON',
          'PIN1', 'PIN2', 'PIN3', 'PIN4',
          'PART1', 'PART2', 'PART3', 'PART4',
          'BASE1', 'ARM1', 'ARM2', 'ARM3',
          'BLOCK1', 'CRANKSHAFT'
        ];
        if (!standardShapes.includes(shape)) {
          const proc = allProcedures.get(shape);
          if (proc) {
            if (proc.params && params.length > 0) {
              for (let i = 0; i < proc.params.length && i < params.length; i++) {
                interpreter.variables.set(proc.params[i], params[i]);
              }
            }
            processGeometryBody(proc.body, builder, interpreter, allProcedures);
          }
        } else {
          builder.addShape(shape, params, stmt.isAdd);
        }
        break;
      }
      case NodeType.STPOS: {
        const num = resolveValue(stmt.number, interpreter);
        builder.storePosition(Math.floor(num));
        break;
      }
      case NodeType.REPOS: {
        const num = resolveValue(stmt.number, interpreter);
        builder.restorePosition(Math.floor(num));
        break;
      }
      case NodeType.ASSIGNMENT:
        interpreter.executeStatement(stmt);
        break;
      default:
        break;
    }
  }
}

/**
 * Process a KINEMATICS procedure to extract joints.
 * Returns an array of Joint descriptors.
 */
function buildKinematics(kinematicsProc, interpreter) {
  const joints = [];
  let pendingJoint = null;

  const body = kinematicsProc.body || [];

  for (const stmt of body) {
    switch (stmt.type) {
      case NodeType.NEXT_JOINT: {
        // Flush previous joint
        if (pendingJoint) joints.push(pendingJoint);

        const childName = resolveArgName(stmt.childName);
        const parentName = resolveArgName(stmt.parentName) || 'BASE';
        const limits = (stmt.limits || []).map(l => resolveValue(l, interpreter));

        pendingJoint = {
          childName: childName.toUpperCase(),
          parentName: parentName.toUpperCase(),
          limits: limits,
          dh: null,
          transforms: []
        };
        break;
      }

      case NodeType.DH_NOTATION: {
        if (pendingJoint) {
          // Determine which parameter is t() — the variable one
          const dhParams = { a: 0, alpha: 0, d: 0, theta: 0, variableIndex: null };

          // Check each DH parameter for t() function call
          dhParams.a = isDHVariable(stmt.a) ? 0 : resolveValue(stmt.a, interpreter);
          dhParams.alpha = isDHVariable(stmt.alpha) ? 0 : resolveValue(stmt.alpha, interpreter);
          dhParams.d = isDHVariable(stmt.d) ? 0 : resolveValue(stmt.d, interpreter);
          dhParams.theta = isDHVariable(stmt.theta) ? 0 : resolveValue(stmt.theta, interpreter);

          if (isDHVariable(stmt.a)) dhParams.variableIndex = 'a';
          else if (isDHVariable(stmt.alpha)) dhParams.variableIndex = 'alpha';
          else if (isDHVariable(stmt.d)) dhParams.variableIndex = 'd';
          else if (isDHVariable(stmt.theta)) dhParams.variableIndex = 'theta';

          pendingJoint.dh = dhParams;
        }
        break;
      }

      case NodeType.TRANSFORM: {
        // Additional transforms between joints (TX/TY/TZ/RX/RY/RZ in kinematics)
        if (pendingJoint) {
          pendingJoint.transforms.push({
            type: stmt.transform,
            value: resolveValue(stmt.value, interpreter)
          });
        }
        break;
      }

      default:
        break;
    }
  }

  // Flush last joint
  if (pendingJoint) joints.push(pendingJoint);

  return joints;
}

/**
 * Check if a DH parameter node is the t() function (variable joint parameter)
 */
function isDHVariable(node) {
  if (!node) return false;
  if (node.type === NodeType.FUNC_CALL && (node.name || '').toUpperCase() === 'T') {
    return true;
  }
  return false;
}

/**
 * Resolve an expression node to a numeric value
 */
function resolveValue(node, interpreter) {
  if (node === null || node === undefined) return 0;
  if (typeof node === 'number') return node;
  return interpreter.evalExpr(node);
}

/**
 * Resolve an argument to a string name
 */
function resolveArgName(arg) {
  if (!arg) return '';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'object') {
    if (arg.value !== undefined) return String(arg.value);
    if (arg.name !== undefined) return String(arg.name);
  }
  return '';
}

/**
 * Main entry point: Build a RobotModel from a parsed AST.
 */
export function buildRobotFromAST(ast, interpreter, robotName = 'ROBOT') {
  // Register all procedures
  const allProcedures = new Map();
  for (const proc of (ast.procedures || [])) {
    const nameUpper = proc.name.toUpperCase().replace(/\s+/g, ' ').trim();
    allProcedures.set(nameUpper, proc);
  }

  // Also register in interpreter for CALL resolution
  interpreter.registerProcedures(ast.procedures || []);

  // Find GEOMETRY and KINEMATICS procedures
  const geometryProc = allProcedures.get('GEOMETRY');
  const kinematicsProc = allProcedures.get('KINEMATICS');

  if (!geometryProc) {
    return { error: 'Brak procedury GEOMETRY w kodzie', robot: null };
  }

  // Build geometry
  const { links, gripperLinks } = buildGeometry(geometryProc, interpreter, allProcedures);

  // Build kinematics
  const jointDescriptors = kinematicsProc ? buildKinematics(kinematicsProc, interpreter) : [];

  // Create RobotModel
  const robot = new RobotModel(robotName);
  robot.baseGeometry = links.get('BASE') || new THREE.Group();

  // Store all action/motion procedures
  for (const [name, proc] of allProcedures) {
    if (name !== 'GEOMETRY' && name !== 'KINEMATICS') {
      robot.procedures.set(name, proc);
    }
  }

  // Create joints from kinematics
  for (const jd of jointDescriptors) {
    const dh = jd.dh || { a: 0, alpha: 0, d: 0, theta: 0, variableIndex: null };
    const isRotational = (dh.variableIndex === 'theta');
    const limitsObj = parseLimits(jd.limits, isRotational);
    const startValue = parseStartValue(jd.limits, limitsObj, isRotational);

    const joint = new Joint(
      jd.childName,
      jd.parentName,
      dh,
      limitsObj,
      startValue
    );

    // Assign geometry
    const linkGeom = links.get(jd.childName);
    if (linkGeom) {
      joint.geometry = linkGeom;
    }

    // Check gripper
    if (gripperLinks.has(jd.childName)) {
      joint.isGripper = true;
    }

    robot.addJoint(joint);
  }

  // Update kinematics to initial positions
  robot.updateKinematics();

  return { error: null, robot };
}

/**
 * Parse limits array from NEXT JOINT arguments.
 * For rotational joints (theta variable): limits are in degrees, auto-convert to radians.
 * For prismatic joints (d variable): limits are in length units, no conversion.
 * Already-converted values (with ° in code) will be small (<2π) — we detect and skip those.
 */
function parseLimits(limits, isRotational) {
  if (!limits || limits.length < 2) return null;
  let min = typeof limits[0] === 'number' ? limits[0] : 0;
  let max = typeof limits[1] === 'number' ? limits[1] : 0;

  // For rotational joints: if values look like degrees (abs > 2π ≈ 6.28), convert to radians
  // Values already converted via ° symbol will be small (e.g. 150° → 2.618 rad)
  if (isRotational) {
    const DEG2RAD = Math.PI / 180;
    const THRESHOLD = 2 * Math.PI + 0.01; // ~6.29
    if (Math.abs(min) > THRESHOLD || Math.abs(max) > THRESHOLD) {
      min = min * DEG2RAD;
      max = max * DEG2RAD;
    }
  }

  return { min, max };
}

function parseStartValue(limits, limitsObj, isRotational) {
  if (!limits) return 0;
  if (limits.length >= 3 && typeof limits[2] === 'number') {
    let start = limits[2];
    // Apply same degree-to-radian conversion for rotational joints
    if (isRotational && Math.abs(start) > (2 * Math.PI + 0.01)) {
      start = start * Math.PI / 180;
    }
    return start;
  }
  if (limitsObj) return limitsObj.min;
  return 0;
}
