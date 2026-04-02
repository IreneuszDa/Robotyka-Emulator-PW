import { ARLANGLexer } from './js/parser/lexer.js';
import { ARLANGParser } from './js/parser/parser.js';
import { ARLANGInterpreter } from './js/interpreter/interpreter.js';

const code = `
procedure geometry
+pin1(20, 10, 40, 20, 0)
endprocedure
`;

const lexer = new ARLANGLexer(code);
const tokens = lexer.tokenize();
const parser = new ARLANGParser(tokens);
const ast = parser.parse();
const interpreter = new ARLANGInterpreter(ast);
interpreter.buildRobot();
console.log("Interpreter variables:", interpreter.variables);
console.log("Procedures:", interpreter.procedures.size);
console.log("Objects in robot:", interpreter.robot.objects.size);
for (const [name, obj] of interpreter.robot.objects.entries()) {
  console.log(`Object ${name}:`, obj.builder.group.children.length, "children");
}
