import type { Program, Statement, Expression, Block } from './ast';

export class Translator {
    private output: string[] = [];
    private indentLevel = 0;

    translate(program: Program, targetLang: 'java'): string {
        this.output = [];
        this.indentLevel = 0;

        if (targetLang === 'java') {
            this.emit('public class Main {');
            this.indent();
            this.emit('public static void main(String[] args) {');
            this.indent();

            // Separate functions from main execution body
            const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
            const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

            mainBody.forEach(stmt => this.translateStatement(stmt));

            this.dedent();
            this.emit('}'); // End main

            // Emit functions as static methods
            functions.forEach(func => this.translateStatement(func));

            this.dedent();
            this.emit('}'); // End class
        }

        return this.output.join('\n');
    }

    private translateStatement(stmt: Statement) {
        switch (stmt.type) {
            case 'Print':
                const val = this.translateExpression(stmt.expression);
                this.emit(`System.out.println(${val});`);
                break;

            case 'Assignment':
                // Rudimentary type inference: use 'var' (Java 10+) 
                // In a real transpiler, you'd need a symbol table to track if variable is already defined
                this.emit(`var ${stmt.name} = ${this.translateExpression(stmt.value)};`);
                break;

            case 'If':
                this.emit(`if (${this.translateExpression(stmt.condition)}) {`);
                this.indent();
                this.translateBlock(stmt.thenBranch);
                this.dedent();
                if (stmt.elseBranch) {
                    this.emit('} else {');
                    this.indent();
                    this.translateBlock(stmt.elseBranch);
                    this.dedent();
                }
                this.emit('}');
                break;

            case 'While':
                this.emit(`while (${this.translateExpression(stmt.condition)}) {`);
                this.indent();
                this.translateBlock(stmt.body);
                this.dedent();
                this.emit('}');
                break;

            case 'For':
                // Python: for x in arr -> Java: for (var x : arr)
                this.emit(`for (var ${stmt.variable} : ${this.translateExpression(stmt.iterable)}) {`);
                this.indent();
                this.translateBlock(stmt.body);
                this.dedent();
                this.emit('}');
                break;

            case 'FunctionDeclaration':
                const params = stmt.params.map(p => `Object ${p.name}`).join(', ');
                this.emit(`public static void ${stmt.name}(${params}) {`);
                this.indent();
                this.translateBlock(stmt.body);
                this.dedent();
                this.emit('}');
                break;

            case 'Return':
                if (stmt.value) {
                    this.emit(`return ${this.translateExpression(stmt.value)};`);
                } else {
                    this.emit('return;');
                }
                break;

            case 'ExpressionStatement':
                this.emit(`${this.translateExpression(stmt.expression)};`);
                break;
        }
    }

    private translateBlock(block: Block) {
        block.body.forEach(s => this.translateStatement(s));
    }

    private translateExpression(expr: Expression): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') return `"${expr.value}"`;
                if (typeof expr.value === 'boolean') return expr.value.toString();
                return String(expr.value);

            case 'Identifier':
                return expr.name;

            case 'BinaryExpression':
                return `${this.translateExpression(expr.left)} ${expr.operator} ${this.translateExpression(expr.right)}`;

            case 'CallExpression':
                const args = expr.arguments.map(a => this.translateExpression(a)).join(', ');
                return `${expr.callee.name}(${args})`;

            case 'ArrayLiteral':
                // Java array initialization
                const elements = expr.elements.map(e => this.translateExpression(e)).join(', ');
                return `new Object[] {${elements}}`;

            default:
                return '';
        }
    }

    private emit(line: string) {
        this.output.push('  '.repeat(this.indentLevel) + line);
    }

    private indent() { this.indentLevel++; }
    private dedent() { this.indentLevel--; }
}