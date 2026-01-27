import type { Program, Statement, Expression, Block } from './ast';

export class Translator {
    private output: string[] = [];
    private indentLevel = 0;

    /**
     * Generates Java code from the AST
     */
    translateToJava(program: Program): string {
        this.output = [];
        this.indentLevel = 0;

        this.emit('public class Main {');
        this.indent();
        this.emit('public static void main(String[] args) {');
        this.indent();

        // Extract functions (Java methods) vs Main Body
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        mainBody.forEach(stmt => this.emitStatement(stmt, 'java'));

        this.dedent();
        this.emit('}'); // End main

        // Emit static methods
        functions.forEach(func => this.emitStatement(func, 'java'));

        this.dedent();
        this.emit('}'); // End class

        return this.output.join('\n');
    }

    /**
     * Generates Python code from the AST (Formatting/Transpiling)
     */
    translateToPython(program: Program): string {
        this.output = [];
        this.indentLevel = 0;

        program.body.forEach(stmt => {
            this.emitStatement(stmt, 'python');
            // Add extra newline after functions for PEP8 style
            if (stmt.type === 'FunctionDeclaration') this.output.push('');
        });

        return this.output.join('\n');
    }

    private emitStatement(stmt: Statement, lang: 'java' | 'python') {
        switch (stmt.type) {
            case 'Print':
                const val = this.emitExpression(stmt.expression, lang);
                if (lang === 'java') this.emit(`System.out.println(${val});`);
                else this.emit(`print(${val})`);
                break;

            case 'Assignment':
                const rVal = this.emitExpression(stmt.value, lang);
                if (lang === 'java') this.emit(`var ${stmt.name} = ${rVal};`);
                else this.emit(`${stmt.name} = ${rVal}`);
                break;

            case 'If':
                const cond = this.emitExpression(stmt.condition, lang);
                if (lang === 'java') {
                    this.emit(`if (${cond}) {`);
                    this.indent();
                    this.emitBlock(stmt.thenBranch, lang);
                    this.dedent();
                    if (stmt.elseBranch) {
                        this.emit('} else {');
                        this.indent();
                        this.emitBlock(stmt.elseBranch, lang);
                        this.dedent();
                    }
                    this.emit('}');
                } else {
                    this.emit(`if ${cond}:`);
                    this.indent();
                    this.emitBlock(stmt.thenBranch, lang);
                    this.dedent();
                    if (stmt.elseBranch) {
                        this.emit('else:');
                        this.indent();
                        this.emitBlock(stmt.elseBranch, lang);
                        this.dedent();
                    }
                }
                break;

            case 'While':
                const wCond = this.emitExpression(stmt.condition, lang);
                if (lang === 'java') {
                    this.emit(`while (${wCond}) {`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                    this.emit('}');
                } else {
                    this.emit(`while ${wCond}:`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                }
                break;

            case 'For':
                const iterable = this.emitExpression(stmt.iterable, lang);
                if (lang === 'java') {
                    this.emit(`for (var ${stmt.variable} : ${iterable}) {`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                    this.emit('}');
                } else {
                    this.emit(`for ${stmt.variable} in ${iterable}:`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                }
                break;

            case 'FunctionDeclaration':
                if (lang === 'java') {
                    const params = stmt.params.map(p => `Object ${p.name}`).join(', ');
                    this.emit(`public static void ${stmt.name}(${params}) {`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                    this.emit('}');
                } else {
                    const params = stmt.params.map(p => p.name).join(', ');
                    this.emit(`def ${stmt.name}(${params}):`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                }
                break;

            case 'Return':
                const retVal = stmt.value ? this.emitExpression(stmt.value, lang) : '';
                if (lang === 'java') this.emit(`return ${retVal};`);
                else this.emit(`return ${retVal}`);
                break;

            case 'ExpressionStatement':
                const expr = this.emitExpression(stmt.expression, lang);
                if (lang === 'java') this.emit(`${expr};`);
                else this.emit(expr);
                break;
        }
    }

    private emitBlock(block: Block, lang: 'java' | 'python') {
        block.body.forEach(s => this.emitStatement(s, lang));
    }

    private emitExpression(expr: Expression, lang: 'java' | 'python'): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') return `"${expr.value}"`;
                if (typeof expr.value === 'boolean') {
                    if (lang === 'python') return expr.value ? 'True' : 'False';
                    return expr.value.toString();
                }
                return String(expr.value);

            case 'Identifier':
                return expr.name;

            case 'BinaryExpression':
                return `${this.emitExpression(expr.left, lang)} ${expr.operator} ${this.emitExpression(expr.right, lang)}`;

            case 'UnaryExpression':
                let op = expr.operator;
                if (lang === 'java' && op === 'not') op = '!';
                if (lang === 'python' && op === '!') op = 'not ';
                return `${op}${this.emitExpression(expr.argument, lang)}`;

            case 'CallExpression':
                const args = expr.arguments.map(a => this.emitExpression(a, lang)).join(', ');
                return `${expr.callee.name}(${args})`;

            case 'ArrayLiteral':
                const elements = expr.elements.map(e => this.emitExpression(e, lang)).join(', ');
                if (lang === 'java') return `new Object[] {${elements}}`;
                return `[${elements}]`;

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