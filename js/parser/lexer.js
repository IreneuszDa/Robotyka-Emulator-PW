// ============================================================
// ARLANG Lexer — Tokenizer
// ============================================================

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENTIFIER: 'IDENTIFIER',
  DEGREE_SYMBOL: 'DEGREE_SYMBOL',

  // Operators
  ASSIGN: 'ASSIGN',        // :=
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  MULTIPLY: 'MULTIPLY',
  DIVIDE: 'DIVIDE',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  COMMA: 'COMMA',
  SEMICOLON: 'SEMICOLON',
  COLON: 'COLON',
  DOT: 'DOT',

  // Comparison
  LT: 'LT',
  GT: 'GT',
  EQ: 'EQ',
  NEQ: 'NEQ',          // <>
  AND: 'AND',           // .&.

  // Keywords
  PROCEDURE: 'PROCEDURE',
  ENDPROC: 'ENDPROC',
  PROGRAM: 'PROGRAM',
  PARAMETERS: 'PARAMETERS',
  CALL: 'CALL',
  IF: 'IF',
  ELSE: 'ELSE',
  ENDIF: 'ENDIF',
  REPEAT: 'REPEAT',
  UNTIL: 'UNTIL',
  ARRAY: 'ARRAY',

  // Robot-specific
  OBJECT: 'OBJECT',
  GRIPPER: 'GRIPPER',
  NEXT_JOINT: 'NEXT_JOINT',
  DH_NOTATION: 'DH_NOTATION',
  MOVE: 'MOVE',
  ACTION: 'ACTION',
  CONNECT: 'CONNECT',
  CONNECT_ORIGIN: 'CONNECT_ORIGIN',
  ATTACH_TO: 'ATTACH_TO',
  ATTACH_ORIGIN_TO: 'ATTACH_ORIGIN_TO',
  DETACH_FROM: 'DETACH_FROM',
  DISCONNECT: 'DISCONNECT',
  SPEED: 'SPEED',
  HIDE: 'HIDE',
  SHOW: 'SHOW',
  VIEW: 'VIEW',
  ZOOM: 'ZOOM',
  INCLUDE: 'INCLUDE',

  // CSG primitives (with + or -)
  CSG_ADD: 'CSG_ADD',      // e.g. +CUBOID
  CSG_SUB: 'CSG_SUB',      // e.g. -CUBOID

  // Transforms
  TX: 'TX',
  TY: 'TY',
  TZ: 'TZ',
  RX: 'RX',
  RY: 'RY',
  RZ: 'RZ',
  STPOS: 'STPOS',
  REPOS: 'REPOS',

  // Built-in functions
  FUNC_SIN: 'FUNC_SIN',
  FUNC_COS: 'FUNC_COS',
  FUNC_ABS: 'FUNC_ABS',
  FUNC_SQRT: 'FUNC_SQRT',
  FUNC_ARCTAN: 'FUNC_ARCTAN',
  FUNC_ARCTAN2: 'FUNC_ARCTAN2',
  FUNC_PI: 'FUNC_PI',
  FUNC_EXISTS: 'FUNC_EXISTS',
  FUNC_T: 'FUNC_T',         // t() - joint variable
  FUNC_L: 'FUNC_L',         // L() - normalized time
  FUNC_DONE: 'FUNC_DONE',
  FUNC_TSTART: 'FUNC_TSTART',
  FUNC_NEW_CONNECTION: 'FUNC_NEW_CONNECTION',
  FUNC_COMMAND: 'FUNC_COMMAND',
  FUNC_SVALUE: 'FUNC_SVALUE',

  // System procedures
  WRITELN: 'WRITELN',
  SPEAKER: 'SPEAKER',

  // Special
  EOF: 'EOF',
  NEWLINE: 'NEWLINE',
};

const CSG_SHAPES = [
  'CUBOID', 'CYLINDER', 'CONE', 'SPHERE',
  'LHSP', 'UHSP', 'ICYL', 'OCYL', 'ISPH', 'OSPH', 'ICON', 'OCON',
  'WK',  // alias for SPHERE
  'LSPC', 'USPC',  // aliases used in some examples
];

const KEYWORDS = {
  'PROCEDURE': TokenType.PROCEDURE,
  'ENDPROC': TokenType.ENDPROC,
  'PROGRAM': TokenType.PROGRAM,
  'PARAMETERS': TokenType.PARAMETERS,
  'CALL': TokenType.CALL,
  'IF': TokenType.IF,
  'ELSE': TokenType.ELSE,
  'ENDIF': TokenType.ENDIF,
  'REPEAT': TokenType.REPEAT,
  'UNTIL': TokenType.UNTIL,
  'ARRAY': TokenType.ARRAY,
  'OBJECT': TokenType.OBJECT,
  'GRIPPER': TokenType.GRIPPER,
  'MOVE': TokenType.MOVE,
  'ACTION': TokenType.ACTION,
  'SPEED': TokenType.SPEED,
  'HIDE': TokenType.HIDE,
  'SHOW': TokenType.SHOW,
  'VIEW': TokenType.VIEW,
  'ZOOM': TokenType.ZOOM,
  'DISCONNECT': TokenType.DISCONNECT,
  'WRITELN': TokenType.WRITELN,
  'SPEAKER': TokenType.SPEAKER,
  'TX': TokenType.TX,
  'TY': TokenType.TY,
  'TZ': TokenType.TZ,
  'RX': TokenType.RX,
  'RY': TokenType.RY,
  'RZ': TokenType.RZ,
  'STPOS': TokenType.STPOS,
  'REPOS': TokenType.REPOS,
  'SIN': TokenType.FUNC_SIN,
  'COS': TokenType.FUNC_COS,
  'ABS': TokenType.FUNC_ABS,
  'SQRT': TokenType.FUNC_SQRT,
  'ARCTAN': TokenType.FUNC_ARCTAN,
  'ARCTAN2': TokenType.FUNC_ARCTAN2,
  'PI': TokenType.FUNC_PI,
  'EXISTS': TokenType.FUNC_EXISTS,
  'TSTART': TokenType.FUNC_TSTART,
  'DONE': TokenType.FUNC_DONE,
};

export class Token {
  constructor(type, value, line) {
    this.type = type;
    this.value = value;
    this.line = line;
  }

  toString() {
    return `Token(${this.type}, ${this.value}, line ${this.line})`;
  }
}

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.tokens = [];
  }

  tokenize() {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;

    while (this.pos < this.source.length) {
      this._skipSpacesAndTabs();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Comment ($ to end of line)
      if (ch === '$') {
        this._skipToEndOfLine();
        continue;
      }

      // #INCLUDE directive
      if (ch === '#') {
        const rest = this.source.substring(this.pos).toUpperCase();
        if (rest.startsWith('#INCLUDE')) {
          this.pos += 8;
          this.tokens.push(new Token(TokenType.INCLUDE, '#INCLUDE', this.line));
          continue;
        }
        this.pos++;
        continue;
      }

      // Newline
      if (ch === '\n') {
        this.tokens.push(new Token(TokenType.NEWLINE, '\\n', this.line));
        this.line++;
        this.pos++;
        continue;
      }

      if (ch === '\r') {
        this.pos++;
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          this.pos++;
        }
        this.tokens.push(new Token(TokenType.NEWLINE, '\\n', this.line));
        this.line++;
        continue;
      }

      // Semicolon (statement separator)
      if (ch === ';') {
        this.tokens.push(new Token(TokenType.SEMICOLON, ';', this.line));
        this.pos++;
        continue;
      }

      // String literal (single quotes)
      if (ch === "'") {
        this.tokens.push(this._readString());
        continue;
      }

      // Degree symbol (° = \u00B0)
      if (ch === '°' || ch === '\u00B0') {
        this.tokens.push(new Token(TokenType.DEGREE_SYMBOL, '°', this.line));
        this.pos++;
        continue;
      }

      // CSG add/subtract: +CUBOID, -CUBOID, etc.
      if ((ch === '+' || ch === '-') && this.pos + 1 < this.source.length) {
        const nextCh = this.source[this.pos + 1];
        if (/[A-Za-z]/.test(nextCh)) {
          const saved = this.pos;
          this.pos++; // skip + or -
          const word = this._peekWord();
          const wordUpper = word.toUpperCase();
          if (CSG_SHAPES.includes(wordUpper)) {
            this.pos += word.length;
            const tokenType = ch === '+' ? TokenType.CSG_ADD : TokenType.CSG_SUB;
            this.tokens.push(new Token(tokenType, wordUpper, this.line));
            continue;
          } else {
            // Could be a user-defined solid: +Nazwa or -Nazwa
            this.pos += word.length;
            const tokenType = ch === '+' ? TokenType.CSG_ADD : TokenType.CSG_SUB;
            this.tokens.push(new Token(tokenType, word, this.line));
            continue;
          }
        }
      }

      // Number
      if (/[0-9]/.test(ch) || (ch === '.' && this.pos + 1 < this.source.length && /[0-9]/.test(this.source[this.pos + 1]))) {
        this.tokens.push(this._readNumber());
        continue;
      }

      // Assignment :=
      if (ch === ':' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '=') {
        this.tokens.push(new Token(TokenType.ASSIGN, ':=', this.line));
        this.pos += 2;
        continue;
      }

      // Colon (used for formatting: expr:width or :width:decimals)
      if (ch === ':') {
        this.tokens.push(new Token(TokenType.COLON, ':', this.line));
        this.pos++;
        continue;
      }

      // Not-equal <>
      if (ch === '<' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '>') {
        this.tokens.push(new Token(TokenType.NEQ, '<>', this.line));
        this.pos += 2;
        continue;
      }

      // Logical AND .&.
      if (ch === '.' && this.pos + 2 < this.source.length && this.source[this.pos + 1] === '&' && this.source[this.pos + 2] === '.') {
        this.tokens.push(new Token(TokenType.AND, '.&.', this.line));
        this.pos += 3;
        continue;
      }

      // Single-char operators
      const singleOps = {
        '+': TokenType.PLUS,
        '-': TokenType.MINUS,
        '*': TokenType.MULTIPLY,
        '/': TokenType.DIVIDE,
        '(': TokenType.LPAREN,
        ')': TokenType.RPAREN,
        '[': TokenType.LBRACKET,
        ']': TokenType.RBRACKET,
        '{': TokenType.LBRACE,
        '}': TokenType.RBRACE,
        ',': TokenType.COMMA,
        '<': TokenType.LT,
        '>': TokenType.GT,
        '=': TokenType.EQ,
        '.': TokenType.DOT,
      };

      if (singleOps[ch]) {
        this.tokens.push(new Token(singleOps[ch], ch, this.line));
        this.pos++;
        continue;
      }

      // Words (identifiers, keywords, multi-word keywords)
      if (/[A-Za-z_]/.test(ch)) {
        const word = this._readWord();
        const upper = word.toUpperCase();

        // Multi-word keywords
        if (upper === 'NEXT') {
          const nextWord = this._peekNextWord();
          if (nextWord && nextWord.toUpperCase() === 'JOINT') {
            this._skipSpacesAndTabs();
            this._readWord(); // consume 'JOINT'
            this.tokens.push(new Token(TokenType.NEXT_JOINT, 'NEXT JOINT', this.line));
            continue;
          }
        }

        if (upper === 'DH') {
          const nextWord = this._peekNextWord();
          if (nextWord && nextWord.toUpperCase() === 'NOTATION') {
            this._skipSpacesAndTabs();
            this._readWord(); // consume 'NOTATION'
            this.tokens.push(new Token(TokenType.DH_NOTATION, 'DH NOTATION', this.line));
            continue;
          }
        }

        if (upper === 'CONNECT') {
          const nextWord = this._peekNextWord();
          if (nextWord && nextWord.toUpperCase() === 'ORIGIN') {
            this._skipSpacesAndTabs();
            this._readWord(); // consume 'ORIGIN'
            this.tokens.push(new Token(TokenType.CONNECT_ORIGIN, 'CONNECT ORIGIN', this.line));
            continue;
          }
          this.tokens.push(new Token(TokenType.CONNECT, 'CONNECT', this.line));
          continue;
        }

        if (upper === 'ATTACH') {
          const nextWord = this._peekNextWord();
          if (nextWord) {
            const nu = nextWord.toUpperCase();
            if (nu === 'TO') {
              this._skipSpacesAndTabs();
              this._readWord();
              this.tokens.push(new Token(TokenType.ATTACH_TO, 'ATTACH TO', this.line));
              continue;
            }
            if (nu === 'ORIGIN') {
              this._skipSpacesAndTabs();
              this._readWord(); // 'ORIGIN'
              const nw2 = this._peekNextWord();
              if (nw2 && nw2.toUpperCase() === 'TO') {
                this._skipSpacesAndTabs();
                this._readWord();
              }
              this.tokens.push(new Token(TokenType.ATTACH_ORIGIN_TO, 'ATTACH ORIGIN TO', this.line));
              continue;
            }
            if (nu === 'VIEW') {
              this._skipSpacesAndTabs();
              this._readWord();
              this.tokens.push(new Token(TokenType.IDENTIFIER, 'ATTACHVIEW', this.line));
              continue;
            }
          }
        }

        if (upper === 'ATTACHVIEW') {
          this.tokens.push(new Token(TokenType.IDENTIFIER, 'ATTACHVIEW', this.line));
          continue;
        }

        if (upper === 'DETACH') {
          const nextWord = this._peekNextWord();
          if (nextWord) {
            const nu = nextWord.toUpperCase();
            if (nu === 'FROM') {
              this._skipSpacesAndTabs();
              this._readWord();
              this.tokens.push(new Token(TokenType.DETACH_FROM, 'DETACH FROM', this.line));
              continue;
            }
            if (nu === 'VIEW') {
              this._skipSpacesAndTabs();
              this._readWord();
              this.tokens.push(new Token(TokenType.IDENTIFIER, 'DETACHVIEW', this.line));
              continue;
            }
          }
        }

        if (upper === 'DETACHVIEW') {
          this.tokens.push(new Token(TokenType.IDENTIFIER, 'DETACHVIEW', this.line));
          continue;
        }

        if (upper === 'NEW') {
          const nw = this._peekNextWord();
          if (nw && nw.toUpperCase() === 'CONNECTION') {
            this._skipSpacesAndTabs();
            this._readWord();
            this.tokens.push(new Token(TokenType.FUNC_NEW_CONNECTION, 'NEW CONNECTION', this.line));
            continue;
          }
        }

        if (upper === 'SHOW') {
          const nw = this._peekNextWord();
          if (nw) {
            const nu = nw.toUpperCase();
            if (nu === 'CONNECTED' || nu === 'MAIN' || nu === 'ALL') {
              // multi-word: consume all words until identifier boundary
              let fullCmd = upper;
              while (true) {
                const peek = this._peekNextWord();
                if (!peek) break;
                const pu = peek.toUpperCase();
                if (['CONNECTED', 'MAIN', 'ALL', 'INSTRUCTIONS'].includes(pu)) {
                  this._skipSpacesAndTabs();
                  const w = this._readWord();
                  fullCmd += ' ' + w.toUpperCase();
                } else break;
              }
              this.tokens.push(new Token(TokenType.IDENTIFIER, fullCmd, this.line));
              continue;
            }
          }
          this.tokens.push(new Token(TokenType.SHOW, 'SHOW', this.line));
          continue;
        }

        if (upper === 'HIDE') {
          const nw = this._peekNextWord();
          if (nw && nw.toUpperCase() === 'CONNECTED') {
            this._skipSpacesAndTabs();
            this._readWord();
            this.tokens.push(new Token(TokenType.IDENTIFIER, 'HIDE CONNECTED', this.line));
            continue;
          }
          this.tokens.push(new Token(TokenType.HIDE, 'HIDE', this.line));
          continue;
        }

        if (upper === 'MOVE') {
          const nw = this._peekNextWord();
          if (nw && nw.toUpperCase() === 'VIEW') {
            this._skipSpacesAndTabs();
            this._readWord();
            this.tokens.push(new Token(TokenType.IDENTIFIER, 'MOVE VIEW', this.line));
            continue;
          }
          this.tokens.push(new Token(TokenType.MOVE, 'MOVE', this.line));
          continue;
        }

        if (upper === 'ROTATE') {
          const nw = this._peekNextWord();
          if (nw && nw.toUpperCase() === 'VIEW') {
            this._skipSpacesAndTabs();
            this._readWord();
            this.tokens.push(new Token(TokenType.IDENTIFIER, 'ROTATE VIEW', this.line));
            continue;
          }
        }

        if (upper === 'SPEECH') {
          const nw = this._peekNextWord();
          if (nw && nw.toUpperCase() === 'RATE') {
            this._skipSpacesAndTabs();
            this._readWord();
            this.tokens.push(new Token(TokenType.IDENTIFIER, 'SPEECH RATE', this.line));
            continue;
          }
        }

        // Check for t() and L() functions
        if (upper === 'T') {
          this.tokens.push(new Token(TokenType.FUNC_T, 'T', this.line));
          continue;
        }
        if (upper === 'L') {
          this.tokens.push(new Token(TokenType.FUNC_L, 'L', this.line));
          continue;
        }

        // Check keyword table
        if (KEYWORDS[upper]) {
          this.tokens.push(new Token(KEYWORDS[upper], upper, this.line));
          continue;
        }

        // Geometry / Kinematics procedure names (case-insensitive match)
        if (upper === 'GEOMETRY' || upper === 'KINEMATICS') {
          this.tokens.push(new Token(TokenType.IDENTIFIER, upper, this.line));
          continue;
        }

        // Regular identifier
        this.tokens.push(new Token(TokenType.IDENTIFIER, word, this.line));
        continue;
      }

      // Unknown character, skip
      this.pos++;
    }

    this.tokens.push(new Token(TokenType.EOF, null, this.line));
    return this.tokens;
  }

  _skipSpacesAndTabs() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === ' ' || ch === '\t') {
        this.pos++;
      } else {
        break;
      }
    }
  }

  _skipToEndOfLine() {
    while (this.pos < this.source.length && this.source[this.pos] !== '\n' && this.source[this.pos] !== '\r') {
      this.pos++;
    }
  }

  _peekWord() {
    let start = this.pos;
    while (start < this.source.length && /[A-Za-z0-9_]/.test(this.source[start])) {
      start++;
    }
    return this.source.substring(this.pos, start);
  }

  _readWord() {
    let start = this.pos;
    while (this.pos < this.source.length && /[A-Za-z0-9_]/.test(this.source[this.pos])) {
      this.pos++;
    }
    return this.source.substring(start, this.pos);
  }

  _peekNextWord() {
    let saved = this.pos;
    this._skipSpacesAndTabs();
    if (this.pos >= this.source.length || !/[A-Za-z_]/.test(this.source[this.pos])) {
      this.pos = saved;
      return null;
    }
    const word = this._peekWord();
    this.pos = saved;
    return word;
  }

  _readNumber() {
    let start = this.pos;
    let hasDot = false;
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (/[0-9]/.test(ch)) {
        this.pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        this.pos++;
      } else {
        break;
      }
    }
    const numStr = this.source.substring(start, this.pos);
    return new Token(TokenType.NUMBER, parseFloat(numStr), this.line);
  }

  _readString() {
    this.pos++; // skip opening quote
    let start = this.pos;
    while (this.pos < this.source.length && this.source[this.pos] !== "'") {
      this.pos++;
    }
    const str = this.source.substring(start, this.pos);
    if (this.pos < this.source.length) this.pos++; // skip closing quote
    return new Token(TokenType.STRING, str, this.line);
  }
}
