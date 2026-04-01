// ============================================================
// ARLANG Interpreter — AST Evaluator
// ============================================================
import { NodeType } from '../parser/parser.js';

export class Interpreter {
  constructor(consoleCallback) {
    this.variables = new Map();       // simple variables (case-sensitive)
    this.arrays = new Map();          // arrays (case-insensitive name → Float64Array)
    this.procedures = new Map();      // procedure name (UPPERCASE) → AST node
    this.consoleLog = consoleCallback || (() => {});

    // Robot/simulation state
    this.robots = new Map();          // robot name → RobotModel
    this.activeRobot = null;
    this.simulationTime = 0;          // L() value [0..1]
    this.moveCommands = [];           // pending MOVE commands in current REPEAT
    this.moveDone = false;
    this.speed = 10;
    this.tStartValues = new Map();    // link name → start value for current action

    // Animation state
    this.animationCallback = null;
    this.isRunning = false;
    this.stepMode = false;

    // Stored positions for geometry CSG
    this.storedPositions = new Map();
  }

  /** Register procedures from parsed AST */
  registerProcedures(procedures) {
    for (const proc of procedures) {
      const nameUpper = proc.name.toUpperCase().replace(/\s+/g, ' ').trim();
      this.procedures.set(nameUpper, proc);
    }
  }

  /** Register a robot model */
  registerRobot(name, robotModel) {
    this.robots.set(name.toUpperCase(), robotModel);
  }

  /** Evaluate an expression AST node → number */
  evalExpr(node) {
    if (!node) return 0;

    switch (node.type) {
      case NodeType.NUMBER_LIT:
        return node.value;

      case NodeType.STRING_LIT:
        return node.value;

      case NodeType.VARIABLE: {
        const name = node.name || node.value;
        if (typeof name === 'string') {
          // Check for Object:Member format
          if (name.includes(':')) return name;
          const val = this.variables.get(name);
          if (val !== undefined) return val;
          // Try case-insensitive for arrays
          const arrName = name.toUpperCase();
          if (this.arrays.has(arrName)) return 0;
        }
        return typeof name === 'number' ? name : 0;
      }

      case NodeType.BINARY_OP: {
        const left = this.evalExpr(node.left);
        const right = this.evalExpr(node.right);
        switch (node.op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return right !== 0 ? left / right : 0;
          default: return 0;
        }
      }

      case NodeType.UNARY_OP: {
        const operand = this.evalExpr(node.operand);
        return node.op === '-' ? -operand : operand;
      }

      case NodeType.FUNC_CALL:
        return this._evalFunction(node);

      case NodeType.ARRAY_ACCESS: {
        const arrName = (node.name || '').toUpperCase();
        const arr = this.arrays.get(arrName);
        const idx = Math.floor(this.evalExpr(node.index));
        if (arr && idx >= 1 && idx <= arr.length) {
          return arr[idx - 1];
        }
        return 0;
      }

      default:
        // If it's an object with a 'value' property (from argList parsing)
        if (node.value !== undefined && typeof node.value === 'number') return node.value;
        if (node.value !== undefined && typeof node.value === 'string') return node.value;
        return 0;
    }
  }

  /** Evaluate a built-in function call */
  _evalFunction(node) {
    const name = (node.name || '').toUpperCase();
    const args = node.args || [];

    switch (name) {
      case 'SIN': return Math.sin(this.evalExpr(args[0]));
      case 'COS': return Math.cos(this.evalExpr(args[0]));
      case 'ABS': return Math.abs(this.evalExpr(args[0]));
      case 'SQRT': return Math.sqrt(Math.max(0, this.evalExpr(args[0])));
      case 'ARCTAN': return Math.atan(this.evalExpr(args[0]));
      case 'ARCTAN2': return Math.atan2(this.evalExpr(args[0]), this.evalExpr(args[1]));
      case 'PI': return Math.PI;
      case 'EXISTS': {
        const varName = args[0]?.name || args[0]?.value || '';
        return this.variables.has(varName) ? 1 : 0;
      }
      case 'T': return 0; // Placeholder — replaced during DH processing
      case 'L': return this.simulationTime;
      case 'DONE': return this.moveDone ? 1 : 0;
      case 'TSTART': {
        const linkName = this._resolveArgName(args[0]);
        return this.tStartValues.get(linkName.toUpperCase()) || 0;
      }
      case 'NEW CONNECTION': return 0;
      case 'COMMAND': return 0;
      case 'SVALUE': return 0;
      default:
        // Check user-defined function/procedure (unlikely but handle)
        return 0;
    }
  }

  /** Evaluate a condition AST node → boolean */
  evalCondition(node) {
    if (!node) return false;

    if (node.type === NodeType.COMPOUND_COND) {
      const left = this.evalCondition(node.left);
      const right = this.evalCondition(node.right);
      if (node.op === 'AND') return left && right;
      return left || right;
    }

    if (node.type === NodeType.CONDITION) {
      const left = this.evalExpr(node.left);

      if (node.op === 'truthy') {
        // Check DONE() function
        if (node.left?.type === NodeType.FUNC_CALL &&
            (node.left.name || '').toUpperCase() === 'DONE') {
          return this.moveDone;
        }
        return Math.abs(left) > 0.001;
      }

      const right = this.evalExpr(node.right);
      switch (node.op) {
        case '>': return left > right;
        case '<': return left < right;
        case '=': return Math.abs(left - right) <= 0.001;
        case '<>': return Math.abs(left - right) > 0.001;
        default: return false;
      }
    }

    // FUNC_CALL node used as condition (e.g., DONE())
    if (node.type === NodeType.FUNC_CALL) {
      const name = (node.name || '').toUpperCase();
      if (name === 'DONE') return this.moveDone;
      return Math.abs(this.evalExpr(node)) > 0.001;
    }

    return Math.abs(this.evalExpr(node)) > 0.001;
  }

  /** Execute a list of statement AST nodes */
  executeBlock(statements) {
    if (!statements) return;
    for (const stmt of statements) {
      this.executeStatement(stmt);
    }
  }

  /** Execute a single statement AST node */
  executeStatement(stmt) {
    if (!stmt) return;

    switch (stmt.type) {
      case NodeType.ASSIGNMENT: {
        const value = this.evalExpr(stmt.value);
        if (stmt.index !== undefined) {
          // Array element assignment
          const arrName = (stmt.variable || '').toUpperCase();
          const arr = this.arrays.get(arrName);
          const idx = Math.floor(this.evalExpr(stmt.index));
          if (arr && idx >= 1 && idx <= arr.length) {
            arr[idx - 1] = value;
          }
        } else {
          this.variables.set(stmt.variable, value);
        }
        break;
      }

      case NodeType.ARRAY_DECL: {
        const name = (stmt.name || '').toUpperCase();
        const size = Math.floor(this.evalExpr(stmt.size));
        if (size > 0 && size <= 10000) {
          this.arrays.set(name, new Float64Array(size));
        }
        break;
      }

      case NodeType.IF_STMT: {
        if (this.evalCondition(stmt.condition)) {
          this.executeBlock(stmt.thenBody);
        } else {
          this.executeBlock(stmt.elseBody);
        }
        break;
      }

      case NodeType.REPEAT_STMT: {
        let iterations = 0;
        const MAX_ITERATIONS = 100000;
        do {
          this.executeBlock(stmt.body);
          iterations++;
          if (iterations > MAX_ITERATIONS) {
            this.consoleLog('Blad: Przekroczono limit iteracji petli REPEAT', 'error');
            break;
          }
        } while (!this.evalCondition(stmt.condition));
        break;
      }

      case NodeType.CALL: {
        this._callProcedure(stmt.name, stmt.args);
        break;
      }

      case NodeType.SPEED: {
        this.speed = this.evalExpr(stmt.value);
        break;
      }

      case NodeType.WRITELN: {
        const parts = (stmt.args || []).map(a => {
          if (typeof a === 'string') return a;
          if (a?.type === NodeType.STRING_LIT) return (a.value || '').replace(/_/g, ' ');
          const val = this.evalExpr(a);
          return typeof val === 'number' ? val.toFixed(3) : String(val);
        });
        // Skip first arg if it's 'DBG'
        const startIdx = parts.length > 0 && String(parts[0]).toUpperCase() === 'DBG' ? 1 : 0;
        this.consoleLog(parts.slice(startIdx).join(''), 'info');
        break;
      }

      case NodeType.GENERIC_CALL: {
        this._callProcedure(stmt.name, stmt.args);
        break;
      }

      case NodeType.ACTION:
      case NodeType.CONNECT:
      case NodeType.CONNECT_ORIGIN:
      case NodeType.ATTACH_TO:
      case NodeType.ATTACH_ORIGIN_TO:
      case NodeType.DETACH_FROM:
      case NodeType.DISCONNECT:
      case NodeType.HIDE:
      case NodeType.SHOW:
      case NodeType.ZOOM:
      case NodeType.VIEW:
      case NodeType.SPEAKER:
      case NodeType.INCLUDE:
        // These are handled at a higher level or not implemented in emulator
        break;

      default:
        break;
    }
  }

  /** Call a user-defined procedure */
  _callProcedure(name, args) {
    const nameUpper = (name || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const proc = this.procedures.get(nameUpper);
    if (!proc) return;

    // Save current variables (simple scoping)
    const savedVars = new Map(this.variables);

    // Evaluate and set parameters
    if (proc.params && proc.params.length > 0 && args) {
      for (let i = 0; i < proc.params.length && i < args.length; i++) {
        const val = this.evalExpr(args[i]);
        this.variables.set(proc.params[i], val);
      }
    }

    // Execute procedure body
    this.executeBlock(proc.body);

    // Restore variables (only parameter names — keep any new variables)
    // Actually in ARLANG, variables are global, so don't restore
  }

  /** Resolve an arg to a string name */
  _resolveArgName(arg) {
    if (!arg) return '';
    if (typeof arg === 'string') return arg;
    if (arg.value !== undefined) return String(arg.value);
    if (arg.name !== undefined) return String(arg.name);
    return '';
  }
}
