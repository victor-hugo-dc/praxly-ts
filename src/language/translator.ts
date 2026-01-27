import type { Program, Statement, Expression, Block } from './ast';

/**
 * Tracks variable types within a specific scope.
 */
class SymbolTable {
    private scopes: Map<string, string>[] = [new Map()]; // Stack of scopes

    enterScope() {
        this.scopes.push(new Map());
    }

    exitScope() {
        this.scopes.pop();
    }

    // Set type for a variable in the current scope
    set(name: string, type: string) {
        this.scopes[this.scopes.length - 1].set(name, type);
    }

    // Look up type, searching from current scope upwards
    get(name: string): string | undefined {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(name)) {
                return this.scopes[i].get(name);
            }
        }
        return undefined;
    }

    // Check if variable is defined in the *current* scope only (for declarations)
    hasInCurrentScope(name: string): boolean {
        return this.scopes[this.scopes.length - 1].has(name);
    }
}

export class Translator {
    private output: string[] = [];
    private indentLevel = 0;

    private symbolTable = new SymbolTable();

    // Registry to store function return types: { "check": "boolean" }
    private functionReturnTypes = new Map<string, string>();
    // Registry to store function parameter types: { "check": ["int"] }
    private functionParamTypes = new Map<string, string[]>();

    /**
     * Generates Java code from the AST
     */
    translateToJava(program: Program): string {
        this.output = [];
        this.indentLevel = 0;

        // Reset state
        this.symbolTable = new SymbolTable();
        this.functionReturnTypes.clear();
        this.functionParamTypes.clear();

        // --- PASS 1: ANALYSIS ---
        // 1. Register function return types
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        functions.forEach((func: any) => {
            // We use a temporary translator pass to just peek at return types if needed, 
            // or just analyze the block statically.
            const returnType = this.analyzeReturnType(func.body);
            this.functionReturnTypes.set(func.name, returnType);
        });

        // 2. Analyze variable types in the main body (global scope)
        // This populates the symbol table with global variables like 'x' and 'y'
        this.analyzeBlock(program.body);

        // 3. Analyze function calls to infer parameter types based on the now-known variable types
        this.analyzeFunctionCalls(program);


        // --- PASS 2: CODE GENERATION ---
        // Reset symbol table for emission pass to ensure we declare variables correctly in order
        this.symbolTable = new SymbolTable();

        this.emit('public class Main {');
        this.indent();
        this.emit('public static void main(String[] args) {');
        this.indent();

        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        // Emit main body
        mainBody.forEach(stmt => this.emitStatement(stmt, 'java'));

        this.dedent();
        this.emit('}'); // End main

        // Emit static methods
        functions.forEach(func => {
            this.emit(''); // Spacing
            this.emitStatement(func, 'java');
        });

        this.dedent();
        this.emit('}'); // End class

        return this.output.join('\n');
    }

    // --- ANALYSIS PHASE METHODS ---

    /**
     * Walk through statements to build up the symbol table with types.
     */
    private analyzeBlock(statements: Statement[]) {
        statements.forEach(stmt => {
            if (stmt.type === 'Assignment') {
                const type = this.inferType(stmt.value); // Infer type from value
                if (type !== 'var') {
                    this.symbolTable.set(stmt.name, type);
                }
            }
            // Recurse into control structures
            if (stmt.type === 'If') {
                this.analyzeBlock(stmt.thenBranch.body);
                if (stmt.elseBranch) this.analyzeBlock(stmt.elseBranch.body);
            }
            if (stmt.type === 'While') this.analyzeBlock(stmt.body.body);
            if (stmt.type === 'For') this.analyzeBlock(stmt.body.body);
        });
    }

    /**
     * Find all calls and use the current SymbolTable to figure out what types are being passed.
     */
    private analyzeFunctionCalls(node: any) {
        if (!node) return;

        if (node.type === 'CallExpression') {
            const funcName = node.callee.name;
            // Because we ran analyzeBlock() first, symbolTable now knows that 'x' is 'int'.
            // So inferType(x) will return 'int'.
            const argTypes = node.arguments.map((arg: Expression) => this.inferType(arg));

            if (!this.functionParamTypes.has(funcName)) {
                this.functionParamTypes.set(funcName, argTypes);
            }
        }

        // Recursively traverse children
        for (const key in node) {
            if (typeof node[key] === 'object' && node[key] !== null) {
                if (Array.isArray(node[key])) {
                    node[key].forEach((child: any) => this.analyzeFunctionCalls(child));
                } else {
                    this.analyzeFunctionCalls(node[key]);
                }
            }
        }
    }

    private analyzeReturnType(block: Block): string {
        for (const stmt of block.body) {
            if (stmt.type === 'Return') {
                return stmt.value ? this.inferType(stmt.value) : 'void';
            }
            // Simple recursion for nested blocks
            if (stmt.type === 'If') {
                const t = this.analyzeReturnType(stmt.thenBranch);
                if (t !== 'void') return t;
                if (stmt.elseBranch) {
                    const e = this.analyzeReturnType(stmt.elseBranch);
                    if (e !== 'void') return e;
                }
            }
        }
        return 'void';
    }

    /**
     * Core type inference logic used during Analysis phase.
     */
    private inferType(expr: Expression): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'boolean') return 'boolean';
                if (typeof expr.value === 'string') return 'String';
                if (typeof expr.value === 'number') {
                    if (expr.raw && (expr.raw.includes('.') || expr.raw.toLowerCase().includes('e'))) {
                        return 'double';
                    }
                    return 'int';
                }
                return 'Object';

            case 'Identifier':
                // Look up in symbol table! This is the key fix.
                return this.symbolTable.get(expr.name) || 'var';

            case 'ArrayLiteral':
                if (expr.elements.length === 0) return 'Object[]';
                const types = expr.elements.map(e => this.inferType(e));
                if (types.every(t => t === 'int')) return 'int[]';
                if (types.every(t => t === 'double' || t === 'int')) return 'double[]';
                if (types.every(t => t === 'boolean')) return 'boolean[]';
                return 'Object[]';

            case 'BinaryExpression':
                if (['>', '<', '>=', '<=', '==', '!='].includes(expr.operator)) return 'boolean';
                const left = this.inferType(expr.left);
                const right = this.inferType(expr.right);
                if (left === 'double' || right === 'double') return 'double';
                if (left === 'int' && right === 'int') return 'int';
                return 'var';

            case 'UnaryExpression':
                if (['!', 'not'].includes(expr.operator)) return 'boolean';
                return this.inferType(expr.argument);

            case 'CallExpression':
                if (this.functionReturnTypes.has(expr.callee.name)) {
                    return this.functionReturnTypes.get(expr.callee.name)!;
                }
                return 'var';

            default:
                return 'var';
        }
    }


    // --- EMISSION PHASE METHODS ---

    private emitStatement(stmt: Statement, lang: 'java' | 'python') {
        switch (stmt.type) {
            case 'Print':
                const val = this.emitExpression(stmt.expression, lang);
                if (lang === 'java') this.emit(`System.out.println(${val});`);
                else this.emit(`print(${val})`);
                break;

            case 'Assignment':
                const rVal = this.emitExpression(stmt.value, lang);
                if (lang === 'java') {
                    // Check if variable was already declared in the current scope
                    if (this.symbolTable.hasInCurrentScope(stmt.name)) {
                        this.emit(`${stmt.name} = ${rVal};`);
                    } else {
                        let type = this.inferType(stmt.value);
                        // During emission, inferType works because we are populating the fresh symbol table as we go
                        if (type === 'var') type = 'Object';

                        this.emit(`${type} ${stmt.name} = ${rVal};`);
                        // Register in symbol table so subsequent uses know it exists and what type it is
                        this.symbolTable.set(stmt.name, type);
                    }
                }
                else this.emit(`${stmt.name} = ${rVal}`);
                break;

            case 'If':
                const cond = this.emitExpression(stmt.condition, lang);
                if (lang === 'java') {
                    this.emit(`if (${cond}) {`);
                    this.indent();
                    this.symbolTable.enterScope(); // New scope for block
                    this.emitBlock(stmt.thenBranch, lang);
                    this.symbolTable.exitScope();
                    this.dedent();
                    if (stmt.elseBranch) {
                        this.emit('} else {');
                        this.indent();
                        this.symbolTable.enterScope();
                        this.emitBlock(stmt.elseBranch, lang);
                        this.symbolTable.exitScope();
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
                    this.symbolTable.enterScope();
                    this.emitBlock(stmt.body, lang);
                    this.symbolTable.exitScope();
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
                    let varType = 'var';
                    const iterType = this.inferType(stmt.iterable);
                    if (iterType.endsWith('[]')) {
                        varType = iterType.slice(0, -2);
                    }

                    this.emit(`for (${varType} ${stmt.variable} : ${iterable}) {`);

                    this.indent();
                    this.symbolTable.enterScope();
                    // Register loop variable in scope
                    this.symbolTable.set(stmt.variable, varType);

                    this.emitBlock(stmt.body, lang);

                    this.symbolTable.exitScope();
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
                    // Function scope
                    this.symbolTable.enterScope();

                    // Register parameters in the function scope
                    const paramTypes = this.functionParamTypes.get(stmt.name) || [];
                    stmt.params.forEach((p, i) => {
                        let type = paramTypes[i];
                        if (!type || type === 'var') type = 'Object';
                        this.symbolTable.set(p.name, type);
                    });

                    const params = stmt.params.map((p, i) => {
                        let type = paramTypes[i];
                        if (!type || type === 'var') type = 'Object';
                        return `${type} ${p.name}`;
                    }).join(', ');

                    const returnType = this.functionReturnTypes.get(stmt.name) || 'void';

                    this.emit(`public static ${returnType} ${stmt.name}(${params}) {`);
                    this.indent();
                    this.emitBlock(stmt.body, lang);
                    this.dedent();
                    this.emit('}');

                    this.symbolTable.exitScope();
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
                if (lang === 'java') {
                    const type = this.inferType(expr);
                    const baseType = type.endsWith('[]') ? type.slice(0, -2) : 'Object';
                    return `new ${baseType}[] {${elements}}`;
                }
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