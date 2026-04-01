// ============================================================
// ARLANG Parser — AST Builder
// ============================================================
import { TokenType } from './lexer.js';

// AST Node Types
export const NodeType = {
  PROGRAM_BLOCK: 'PROGRAM_BLOCK',
  PROCEDURE_DEF: 'PROCEDURE_DEF',
  PARAMETERS: 'PARAMETERS',
  CALL: 'CALL',
  ASSIGNMENT: 'ASSIGNMENT',
  IF_STMT: 'IF_STMT',
  REPEAT_STMT: 'REPEAT_STMT',
  ARRAY_DECL: 'ARRAY_DECL',
  OBJECT_DECL: 'OBJECT_DECL',
  NEXT_JOINT: 'NEXT_JOINT',
  DH_NOTATION: 'DH_NOTATION',
  TRANSFORM: 'TRANSFORM',
  CSG_OP: 'CSG_OP',
  MOVE: 'MOVE',
  ACTION: 'ACTION',
  SPEED: 'SPEED',
  INCLUDE: 'INCLUDE',
  EXPRESSION: 'EXPRESSION',
  BINARY_OP: 'BINARY_OP',
  UNARY_OP: 'UNARY_OP',
  NUMBER_LIT: 'NUMBER_LIT',
  STRING_LIT: 'STRING_LIT',
  VARIABLE: 'VARIABLE',
  ARRAY_ACCESS: 'ARRAY_ACCESS',
  FUNC_CALL: 'FUNC_CALL',
  CONDITION: 'CONDITION',
  COMPOUND_COND: 'COMPOUND_COND',
  CONNECT: 'CONNECT',
  CONNECT_ORIGIN: 'CONNECT_ORIGIN',
  ATTACH_TO: 'ATTACH_TO',
  ATTACH_ORIGIN_TO: 'ATTACH_ORIGIN_TO',
  DETACH_FROM: 'DETACH_FROM',
  DISCONNECT: 'DISCONNECT',
  HIDE: 'HIDE',
  SHOW: 'SHOW',
  ZOOM: 'ZOOM',
  VIEW: 'VIEW',
  WRITELN: 'WRITELN',
  SPEAKER: 'SPEAKER',
  GENERIC_CALL: 'GENERIC_CALL',
  STPOS: 'STPOS',
  REPOS: 'REPOS',
};

export class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE); // flatten newlines
    this.pos = 0;
    this.errors = [];
  }

  parse() {
    const procedures = [];
    let programBlock = null;

    while (!this._isEOF()) {
      try {
        if (this._check(TokenType.PROCEDURE)) {
          procedures.push(this._parseProcedure());
        } else if (this._check(TokenType.PROGRAM)) {
          this._advance(); // consume PROGRAM
          programBlock = this._parseBlock(['EOF']);
        } else if (this._check(TokenType.INCLUDE)) {
          this._advance();
          // Skip include directive (consume parenthesized filename)
          if (this._check(TokenType.LPAREN)) {
            this._advance();
            while (!this._isEOF() && !this._check(TokenType.RPAREN)) this._advance();
            if (this._check(TokenType.RPAREN)) this._advance();
          }
        } else if (this._check(TokenType.SEMICOLON)) {
          this._advance();
        } else {
          // Try parsing as a statement (top-level code before PROGRAM)
          const stmt = this._parseStatement();
          if (stmt) {
            if (!programBlock) programBlock = [];
            if (Array.isArray(programBlock)) {
              programBlock.push(stmt);
            }
          }
        }
      } catch (e) {
        this.errors.push({ message: e.message, line: this._currentLine() });
        this._advance(); // skip problematic token
      }
    }

    return {
      procedures,
      program: programBlock || [],
      errors: this.errors
    };
  }

  // Parse a procedure definition
  _parseProcedure() {
    this._expect(TokenType.PROCEDURE);
    // Procedure name can be multiple words (e.g. "MOVE JOINTS" or "GEOMETRY")
    let name = this._advance().value;
    // Check if next tokens form part of the name (before PARAMETERS or ENDPROC or statement)
    while (!this._isEOF() && this._check(TokenType.IDENTIFIER) &&
           !['GEOMETRY', 'KINEMATICS'].includes(name.toUpperCase())) {
      // Multi-word procedure name
      const peek = this._peek();
      if (['PARAMETERS', 'ENDPROC'].includes(peek.value?.toUpperCase?.())) break;
      // Check if it looks like a statement beginning
      if (this._isStatementStart()) break;
      name += ' ' + this._advance().value;
    }

    // Special case: if name is just an identifier token already consumed above
    const params = [];
    const body = [];

    // Parse body until ENDPROC
    while (!this._isEOF() && !this._check(TokenType.ENDPROC)) {
      if (this._check(TokenType.SEMICOLON)) {
        this._advance();
        continue;
      }

      if (this._check(TokenType.PARAMETERS)) {
        this._advance();
        // Parse parameter names
        while (!this._isEOF()) {
          const p = this._advance();
          params.push(p.value);
          if (!this._check(TokenType.COMMA)) break;
          this._advance(); // consume comma
        }
        continue;
      }

      const stmt = this._parseStatement();
      if (stmt) body.push(stmt);
    }

    if (this._check(TokenType.ENDPROC)) this._advance();

    return {
      type: NodeType.PROCEDURE_DEF,
      name: name,
      params: params,
      body: body
    };
  }

  // Parse a block of statements until one of the stop tokens
  _parseBlock(stopTokens) {
    const stmts = [];
    while (!this._isEOF()) {
      const peek = this._peek();
      if (stopTokens.includes(peek.type) ||
          (peek.type === TokenType.EOF && stopTokens.includes('EOF'))) break;
      if (peek.type === TokenType.IDENTIFIER && stopTokens.includes(peek.value?.toUpperCase?.())) break;

      if (this._check(TokenType.SEMICOLON)) {
        this._advance();
        continue;
      }

      const stmt = this._parseStatement();
      if (stmt) stmts.push(stmt);
    }
    return stmts;
  }

  // Parse a single statement
  _parseStatement() {
    if (this._isEOF()) return null;
    if (this._check(TokenType.SEMICOLON)) { this._advance(); return null; }

    // Object declaration
    if (this._check(TokenType.OBJECT)) {
      return this._parseObject();
    }

    // Next Joint
    if (this._check(TokenType.NEXT_JOINT)) {
      return this._parseNextJoint();
    }

    // DH Notation
    if (this._check(TokenType.DH_NOTATION)) {
      return this._parseDHNotation();
    }

    // CSG operations (+CUBOID, -CYLINDER, etc.)
    if (this._check(TokenType.CSG_ADD) || this._check(TokenType.CSG_SUB)) {
      return this._parseCSGOperation();
    }

    // Transforms
    if ([TokenType.TX, TokenType.TY, TokenType.TZ, TokenType.RX, TokenType.RY, TokenType.RZ].includes(this._peek().type)) {
      return this._parseTransform();
    }

    if (this._check(TokenType.STPOS)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const num = this._parseExpression();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.STPOS, number: num };
    }

    if (this._check(TokenType.REPOS)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const num = this._parseExpression();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.REPOS, number: num };
    }

    // MOVE
    if (this._check(TokenType.MOVE)) {
      return this._parseMove();
    }

    // ACTION
    if (this._check(TokenType.ACTION)) {
      return this._parseAction();
    }

    // SPEED
    if (this._check(TokenType.SPEED)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const val = this._parseExpression();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.SPEED, value: val };
    }

    // IF
    if (this._check(TokenType.IF)) {
      return this._parseIf();
    }

    // REPEAT
    if (this._check(TokenType.REPEAT)) {
      return this._parseRepeat();
    }

    // CALL
    if (this._check(TokenType.CALL)) {
      return this._parseCall();
    }

    // ARRAY
    if (this._check(TokenType.ARRAY)) {
      return this._parseArrayDecl();
    }

    // CONNECT, ATTACH TO, etc.
    if (this._check(TokenType.CONNECT)) return this._parseConnect();
    if (this._check(TokenType.CONNECT_ORIGIN)) return this._parseConnectOrigin();
    if (this._check(TokenType.ATTACH_TO)) return this._parseAttachTo();
    if (this._check(TokenType.ATTACH_ORIGIN_TO)) return this._parseAttachOriginTo();
    if (this._check(TokenType.DETACH_FROM)) return this._parseDetachFrom();
    if (this._check(TokenType.DISCONNECT)) return this._parseDisconnect();

    // HIDE / SHOW
    if (this._check(TokenType.HIDE)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseArgList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.HIDE, args };
    }

    if (this._check(TokenType.SHOW)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseArgList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.SHOW, args };
    }

    // ZOOM
    if (this._check(TokenType.ZOOM)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseExprList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.ZOOM, args };
    }

    // VIEW
    if (this._check(TokenType.VIEW)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseExprList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.VIEW, args };
    }

    // WRITELN
    if (this._check(TokenType.WRITELN)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseArgList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.WRITELN, args };
    }

    // SPEAKER
    if (this._check(TokenType.SPEAKER)) {
      this._advance();
      this._expect(TokenType.LPAREN);
      const args = this._parseArgList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.SPEAKER, args };
    }

    // INCLUDE
    if (this._check(TokenType.INCLUDE)) {
      this._advance();
      if (this._check(TokenType.LPAREN)) {
        this._advance();
        while (!this._isEOF() && !this._check(TokenType.RPAREN)) this._advance();
        if (this._check(TokenType.RPAREN)) this._advance();
      }
      return { type: NodeType.INCLUDE };
    }

    // Identifier: could be assignment, procedure call, or generic command
    if (this._check(TokenType.IDENTIFIER) || this._check(TokenType.FUNC_T) || this._check(TokenType.FUNC_L)) {
      return this._parseIdentifierStatement();
    }

    // Skip unknown token
    this._advance();
    return null;
  }

  _parseIdentifierStatement() {
    const tok = this._advance();
    const name = tok.value;

    // Check for assignment: name := expr
    if (this._check(TokenType.ASSIGN)) {
      this._advance();
      const expr = this._parseExpression();
      return { type: NodeType.ASSIGNMENT, variable: name, value: expr };
    }

    // Array element assignment: name(index) := expr
    if (this._check(TokenType.LPAREN)) {
      // Could be function call or array access
      // Peek ahead to see if this is followed by := (array assignment)
      const savedPos = this.pos;
      this._advance(); // consume (
      let depth = 1;
      while (!this._isEOF() && depth > 0) {
        if (this._check(TokenType.LPAREN)) depth++;
        if (this._check(TokenType.RPAREN)) depth--;
        if (depth > 0) this._advance();
      }
      if (this._check(TokenType.RPAREN)) this._advance();

      if (this._check(TokenType.ASSIGN)) {
        // Array assignment: reparse
        this.pos = savedPos;
        this._advance(); // consume (
        const index = this._parseExpression();
        this._expect(TokenType.RPAREN);
        this._expect(TokenType.ASSIGN);
        const value = this._parseExpression();
        return { type: NodeType.ASSIGNMENT, variable: name, index: index, value: value };
      } else {
        // Generic identifier with parenthesized args — could be a procedure call
        this.pos = savedPos;
        this._advance(); // consume (
        const args = this._parseExprList();
        this._expect(TokenType.RPAREN);
        return { type: NodeType.GENERIC_CALL, name: name, args: args };
      }
    }

    // Bare identifier — treat as generic call with no args
    return { type: NodeType.GENERIC_CALL, name: name, args: [] };
  }

  _parseObject() {
    this._advance(); // consume OBJECT
    this._expect(TokenType.LPAREN);
    const name = this._advance().value;
    let isGripper = false;
    if (this._check(TokenType.COLON)) {
      this._advance();
      if (this._peek().value?.toUpperCase() === 'GRIPPER' || this._check(TokenType.GRIPPER)) {
        this._advance();
        isGripper = true;
      }
    }
    this._expect(TokenType.RPAREN);
    return { type: NodeType.OBJECT_DECL, name: name, isGripper: isGripper };
  }

  _parseNextJoint() {
    this._advance(); // consume NEXT JOINT
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);

    return {
      type: NodeType.NEXT_JOINT,
      childName: args[0]?.value || args[0],
      parentName: args.length > 1 ? (args[1]?.value || args[1]) : 'BASE',
      limits: args.slice(2)
    };
  }

  _parseDHNotation() {
    this._advance(); // consume DH NOTATION
    this._expect(TokenType.LPAREN);
    const params = this._parseExprList();
    this._expect(TokenType.RPAREN);

    return {
      type: NodeType.DH_NOTATION,
      a: params[0] || null,
      alpha: params[1] || null,
      d: params[2] || null,
      theta: params[3] || null
    };
  }

  _parseCSGOperation() {
    const tok = this._advance();
    const isAdd = tok.type === TokenType.CSG_ADD;
    const shape = tok.value;

    // Some shapes have no params (LHSP, UHSP, LSPC, USPC)
    const noParamShapes = ['LHSP', 'UHSP', 'LSPC', 'USPC'];
    if (noParamShapes.includes(shape.toUpperCase())) {
      return { type: NodeType.CSG_OP, isAdd, shape, params: [] };
    }

    if (this._check(TokenType.LPAREN)) {
      this._advance();
      const params = this._parseExprList();
      this._expect(TokenType.RPAREN);
      return { type: NodeType.CSG_OP, isAdd, shape, params };
    }

    // User-defined solid with no parentheses
    return { type: NodeType.CSG_OP, isAdd, shape, params: [] };
  }

  _parseTransform() {
    const tok = this._advance();
    const transformType = tok.type;
    this._expect(TokenType.LPAREN);
    const value = this._parseExpression();
    // Check for degree symbol
    let isDegrees = false;
    if (this._check(TokenType.DEGREE_SYMBOL)) {
      this._advance();
      isDegrees = true;
    }
    this._expect(TokenType.RPAREN);
    return { type: NodeType.TRANSFORM, transform: tok.value, value, isDegrees };
  }

  _parseMove() {
    this._advance(); // consume MOVE
    this._expect(TokenType.LPAREN);
    const linkName = this._advance().value;
    this._expect(TokenType.COMMA);
    const expr = this._parseExpression();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.MOVE, linkName, expression: expr };
  }

  _parseAction() {
    this._advance(); // consume ACTION
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);

    return {
      type: NodeType.ACTION,
      robotName: args[0]?.value || args[0],
      procedureName: args.length > 1 ? (args[1]?.value || args[1]) : null,
      params: args.slice(2)
    };
  }

  _parseIf() {
    this._advance(); // consume IF
    const condition = this._parseCondition();
    const thenBody = [];
    const elseBody = [];

    // Parse then-body
    while (!this._isEOF() && !this._check(TokenType.ELSE) && !this._check(TokenType.ENDIF)) {
      if (this._check(TokenType.SEMICOLON)) { this._advance(); continue; }
      const stmt = this._parseStatement();
      if (stmt) thenBody.push(stmt);
    }

    // Optional else
    if (this._check(TokenType.ELSE)) {
      this._advance();
      while (!this._isEOF() && !this._check(TokenType.ENDIF)) {
        if (this._check(TokenType.SEMICOLON)) { this._advance(); continue; }
        const stmt = this._parseStatement();
        if (stmt) elseBody.push(stmt);
      }
    }

    if (this._check(TokenType.ENDIF)) this._advance();

    return { type: NodeType.IF_STMT, condition, thenBody, elseBody };
  }

  _parseRepeat() {
    this._advance(); // consume REPEAT
    const body = [];

    while (!this._isEOF() && !this._check(TokenType.UNTIL)) {
      if (this._check(TokenType.SEMICOLON)) { this._advance(); continue; }
      const stmt = this._parseStatement();
      if (stmt) body.push(stmt);
    }

    let condition = null;
    if (this._check(TokenType.UNTIL)) {
      this._advance();
      condition = this._parseCondition();
    }

    return { type: NodeType.REPEAT_STMT, body, condition };
  }

  _parseCall() {
    this._advance(); // consume CALL
    // Procedure name (may be multi-word, may have {expr} substitutions)
    let name = '';
    while (!this._isEOF()) {
      if (this._check(TokenType.LPAREN) || this._check(TokenType.SEMICOLON) ||
          this._check(TokenType.EOF) || this._isStatementStart()) break;
      if (this._check(TokenType.LBRACE)) {
        this._advance();
        const expr = this._parseExpression();
        if (this._check(TokenType.RBRACE)) this._advance();
        name += '{EXPR}'; // placeholder
        continue;
      }
      name += this._advance().value;
    }

    let args = [];
    if (this._check(TokenType.LPAREN)) {
      this._advance();
      args = this._parseExprList();
      this._expect(TokenType.RPAREN);
    }

    return { type: NodeType.CALL, name: name.trim(), args };
  }

  _parseArrayDecl() {
    this._advance(); // consume ARRAY
    const name = this._advance().value;
    this._expect(TokenType.LPAREN);
    const size = this._parseExpression();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.ARRAY_DECL, name, size };
  }

  _parseConnect() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.CONNECT, args };
  }
  _parseConnectOrigin() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.CONNECT_ORIGIN, args };
  }
  _parseAttachTo() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.ATTACH_TO, args };
  }
  _parseAttachOriginTo() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.ATTACH_ORIGIN_TO, args };
  }
  _parseDetachFrom() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.DETACH_FROM, args };
  }
  _parseDisconnect() {
    this._advance();
    this._expect(TokenType.LPAREN);
    const args = this._parseArgList();
    this._expect(TokenType.RPAREN);
    return { type: NodeType.DISCONNECT, args };
  }

  // --- Expression parsing ---

  _parseExpression() {
    return this._parseAddSub();
  }

  _parseAddSub() {
    let left = this._parseMulDiv();
    while (this._check(TokenType.PLUS) || this._check(TokenType.MINUS)) {
      const op = this._advance().value;
      const right = this._parseMulDiv();
      left = { type: NodeType.BINARY_OP, op, left, right };
    }
    return left;
  }

  _parseMulDiv() {
    let left = this._parseUnary();
    while (this._check(TokenType.MULTIPLY) || this._check(TokenType.DIVIDE)) {
      const op = this._advance().value;
      const right = this._parseUnary();
      left = { type: NodeType.BINARY_OP, op, left, right };
    }
    return left;
  }

  _parseUnary() {
    if (this._check(TokenType.MINUS)) {
      this._advance();
      const expr = this._parsePrimary();
      return { type: NodeType.UNARY_OP, op: '-', operand: expr };
    }
    if (this._check(TokenType.PLUS)) {
      this._advance();
      return this._parsePrimary();
    }
    return this._parsePrimary();
  }

  _parsePrimary() {
    // Number
    if (this._check(TokenType.NUMBER)) {
      let val = this._advance().value;
      // Check for degree symbol
      if (this._check(TokenType.DEGREE_SYMBOL)) {
        this._advance();
        val = val * Math.PI / 180;
      }
      return { type: NodeType.NUMBER_LIT, value: val };
    }

    // String literal
    if (this._check(TokenType.STRING)) {
      return { type: NodeType.STRING_LIT, value: this._advance().value };
    }

    // Parenthesized expression
    if (this._check(TokenType.LPAREN)) {
      this._advance();
      const expr = this._parseExpression();
      this._expect(TokenType.RPAREN);
      return expr;
    }

    // Built-in functions
    const funcTokenTypes = [
      TokenType.FUNC_SIN, TokenType.FUNC_COS, TokenType.FUNC_ABS,
      TokenType.FUNC_SQRT, TokenType.FUNC_ARCTAN, TokenType.FUNC_ARCTAN2,
      TokenType.FUNC_PI, TokenType.FUNC_EXISTS,
      TokenType.FUNC_T, TokenType.FUNC_L, TokenType.FUNC_DONE, TokenType.FUNC_TSTART,
      TokenType.FUNC_NEW_CONNECTION, TokenType.FUNC_COMMAND, TokenType.FUNC_SVALUE,
    ];

    for (const ft of funcTokenTypes) {
      if (this._check(ft)) {
        const funcTok = this._advance();
        let args = [];
        if (this._check(TokenType.LPAREN)) {
          this._advance();
          if (!this._check(TokenType.RPAREN)) {
            args = this._parseArgList();
          }
          this._expect(TokenType.RPAREN);
        }
        return { type: NodeType.FUNC_CALL, name: funcTok.value, args };
      }
    }

    // Identifier (variable or function)
    if (this._check(TokenType.IDENTIFIER)) {
      const tok = this._advance();
      const name = tok.value;

      // Check for parenthesized access (array or function call)
      if (this._check(TokenType.LPAREN)) {
        this._advance();
        const args = this._parseExprList();
        this._expect(TokenType.RPAREN);

        // Check for degree symbol after closing paren
        // (for expressions like someFunc(x)°)
        return { type: NodeType.FUNC_CALL, name, args };
      }

      return { type: NodeType.VARIABLE, name };
    }

    // Fallback: return a zero literal
    return { type: NodeType.NUMBER_LIT, value: 0 };
  }

  // Parse condition (for IF and UNTIL)
  _parseCondition() {
    const left = this._parseSingleCondition();

    // Check for .&. (AND)
    if (this._check(TokenType.AND)) {
      this._advance();
      const right = this._parseCondition();
      return { type: NodeType.COMPOUND_COND, op: 'AND', left, right };
    }

    return left;
  }

  _parseSingleCondition() {
    // Could be: expr > expr, expr < expr, expr = expr, expr <> expr
    // Or just: expr (truthy if > 0.001)
    // Or: DONE() - special function call

    const left = this._parseExpression();

    if (this._check(TokenType.GT)) {
      this._advance();
      const right = this._parseExpression();
      return { type: NodeType.CONDITION, op: '>', left, right };
    }
    if (this._check(TokenType.LT)) {
      this._advance();
      const right = this._parseExpression();
      return { type: NodeType.CONDITION, op: '<', left, right };
    }
    if (this._check(TokenType.EQ)) {
      this._advance();
      const right = this._parseExpression();
      return { type: NodeType.CONDITION, op: '=', left, right };
    }
    if (this._check(TokenType.NEQ)) {
      this._advance();
      const right = this._parseExpression();
      return { type: NodeType.CONDITION, op: '<>', left, right };
    }

    // Expression-only condition (truthy if > 0.001)
    return { type: NodeType.CONDITION, op: 'truthy', left, right: null };
  }

  // Parse comma-separated expression list
  _parseExprList() {
    const exprs = [];
    if (this._check(TokenType.RPAREN)) return exprs;

    exprs.push(this._parseExpression());
    while (this._check(TokenType.COMMA)) {
      this._advance();
      exprs.push(this._parseExpression());
    }
    return exprs;
  }

  // Parse argument list (can contain identifiers, expressions, strings, colon-separated items)
  _parseArgList() {
    const args = [];
    if (this._check(TokenType.RPAREN)) return args;

    args.push(this._parseArg());
    while (this._check(TokenType.COMMA)) {
      this._advance();
      args.push(this._parseArg());
    }
    return args;
  }

  _parseArg() {
    // An arg can be: an identifier, a string, or an expression
    // For identifiers like robot names that contain colons (e.g. MANIPULATOR:GRIPPER)
    if (this._check(TokenType.STRING)) {
      return { type: NodeType.STRING_LIT, value: this._advance().value };
    }
    if (this._check(TokenType.IDENTIFIER)) {
      const tok = this._peek();
      const nextTok = this.tokens[this.pos + 1];
      if (nextTok && nextTok.type === TokenType.COLON) {
        // Object:Member syntax
        const obj = this._advance().value;
        this._advance(); // consume colon
        const member = this._advance().value;
        return { type: NodeType.VARIABLE, value: obj + ':' + member, name: obj, member: member };
      }
    }
    return this._parseExpression();
  }

  // --- Helper methods ---

  _peek() {
    if (this.pos >= this.tokens.length) return { type: TokenType.EOF, value: null };
    return this.tokens[this.pos];
  }

  _advance() {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok || { type: TokenType.EOF, value: null };
  }

  _check(type) {
    return this._peek().type === type;
  }

  _expect(type) {
    if (!this._check(type)) {
      // Soft error — don't throw, just push error and continue
      this.errors.push({
        message: `Oczekiwano ${type}, otrzymano ${this._peek().type} ("${this._peek().value}")`,
        line: this._currentLine()
      });
      return this._peek();
    }
    return this._advance();
  }

  _isEOF() {
    return this.pos >= this.tokens.length || this._check(TokenType.EOF);
  }

  _currentLine() {
    return this._peek().line || 0;
  }

  _isStatementStart() {
    const t = this._peek().type;
    return [
      TokenType.IF, TokenType.REPEAT, TokenType.CALL, TokenType.ARRAY,
      TokenType.OBJECT, TokenType.NEXT_JOINT, TokenType.DH_NOTATION,
      TokenType.CSG_ADD, TokenType.CSG_SUB, TokenType.TX, TokenType.TY,
      TokenType.TZ, TokenType.RX, TokenType.RY, TokenType.RZ,
      TokenType.MOVE, TokenType.ACTION, TokenType.SPEED,
      TokenType.CONNECT, TokenType.HIDE, TokenType.SHOW, TokenType.ZOOM,
      TokenType.VIEW, TokenType.WRITELN, TokenType.ENDPROC, TokenType.PROGRAM,
      TokenType.PROCEDURE, TokenType.STPOS, TokenType.REPOS,
    ].includes(t);
  }
}
