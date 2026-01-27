import type { Program, Statement, Expression, Block } from './ast';

// --- Types & Interfaces ---

export type TargetLanguage = 'java' | 'python' | 'csp';

interface Emitter {
    emitProgram(program: Program, analysis: AnalysisResult): string;
}

interface AnalysisResult {
    symbolTable: SymbolTable;
    functionReturnTypes: Map<string, string>;
    functionParamTypes: Map<string, string[]>;
}

// --- Symbol Table & Precedence ---

class SymbolTable {
    private scopes: Map<string, string>[] = [new Map()];

    enterScope() {
        this.scopes.push(new Map());
    }

    exitScope() {
        this.scopes.pop();
    }

    set(name: string, type: string) {
        this.scopes[this.scopes.length - 1].set(name, type);
    }

    get(name: string): string | undefined {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(name)) {
                return this.scopes[i].get(name);
            }
        }
        return undefined;
    }

    hasInCurrentScope(name: string): boolean {
        return this.scopes[this.scopes.length - 1].has(name);
    }
}

const Precedence = {
    Member: 18, Call: 17, Instantiation: 16, Postfix: 15, Unary: 14,
    Exponential: 13, Multiplicative: 12, Additive: 11, Shift: 10,
    Relational: 9, Equality: 8, BitwiseAnd: 7, Xor: 6, BitwiseOr: 5,
    LogicalAnd: 4, LogicalOr: 3, Assignment: 2, Sequence: 1
};

// --- Main Translator Class ---

export class Translator {
    translate(program: Program, targetLang: TargetLanguage): string {
        // 1. Analysis Phase (Language Agnostic)
        const analysis = this.analyze(program);

        // 2. Emission Phase (Target Specific)
        let emitter: Emitter;
        switch (targetLang) {
            case 'java': emitter = new JavaEmitter(); break;
            case 'csp': emitter = new CSPEmitter(); break;
            case 'python': emitter = new PythonEmitter(); break;
            default: throw new Error(`Unsupported target language: ${targetLang}`);
        }

        return emitter.emitProgram(program, analysis);
    }

    private analyze(program: Program): AnalysisResult {
        const analysis: AnalysisResult = {
            symbolTable: new SymbolTable(),
            functionReturnTypes: new Map(),
            functionParamTypes: new Map()
        };

        // Helper to infer types during analysis
        const inferType = (expr: Expression): string => {
            switch (expr.type) {
                case 'Literal':
                    if (typeof expr.value === 'boolean') return 'boolean';
                    if (typeof expr.value === 'string') return 'String';
                    if (typeof expr.value === 'number') {
                        if (expr.raw && (expr.raw.includes('.') || expr.raw.toLowerCase().includes('e'))) return 'double';
                        return 'int';
                    }
                    return 'Object';
                case 'Identifier': return analysis.symbolTable.get(expr.name) || 'var';
                case 'BinaryExpression':
                    if (['>', '<', '>=', '<=', '==', '!='].includes(expr.operator)) return 'boolean';
                    const left = inferType(expr.left);
                    if (left === 'double') return 'double';
                    return 'int';
                case 'CallExpression':
                    if (analysis.functionReturnTypes.has(expr.callee.name)) return analysis.functionReturnTypes.get(expr.callee.name)!;
                    return 'var';
                default: return 'var';
            }
        };

        // Analyze Blocks recursively
        const analyzeBlock = (statements: Statement[]) => {
            statements.forEach(stmt => {
                if (stmt.type === 'Assignment') {
                    const type = inferType(stmt.value);
                    if (type !== 'var') analysis.symbolTable.set(stmt.name, type);
                }
                if (stmt.type === 'If') {
                    analyzeBlock(stmt.thenBranch.body);
                    if (stmt.elseBranch) analyzeBlock(stmt.elseBranch.body);
                }
                if (stmt.type === 'While') analyzeBlock(stmt.body.body);
                if (stmt.type === 'For') analyzeBlock(stmt.body.body);
            });
        };

        // Analyze Function Calls
        const analyzeCalls = (node: any) => {
            if (!node) return;
            if (node.type === 'CallExpression') {
                const funcName = node.callee.name;
                const argTypes = node.arguments.map((arg: Expression) => inferType(arg));
                if (!analysis.functionParamTypes.has(funcName)) {
                    analysis.functionParamTypes.set(funcName, argTypes);
                }
            }
            for (const key in node) {
                if (typeof node[key] === 'object' && node[key] !== null) {
                    if (Array.isArray(node[key])) node[key].forEach((c: any) => analyzeCalls(c));
                    else analyzeCalls(node[key]);
                }
            }
        };

        // Helper for Return Types
        const analyzeReturnType = (block: Block): string => {
            for (const stmt of block.body) {
                if (stmt.type === 'Return') return stmt.value ? inferType(stmt.value) : 'void';
                if (stmt.type === 'If') {
                    const t = analyzeReturnType(stmt.thenBranch);
                    if (t !== 'void') return t;
                    if (stmt.elseBranch) {
                        const e = analyzeReturnType(stmt.elseBranch);
                        if (e !== 'void') return e;
                    }
                }
            }
            return 'void';
        };

        // Execute Analysis
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        functions.forEach((func: any) => {
            analysis.functionReturnTypes.set(func.name, analyzeReturnType(func.body));
        });
        analyzeBlock(program.body);
        analyzeCalls(program);

        return analysis;
    }
}

// --- Base Emitter Class ---

abstract class BaseEmitter implements Emitter {
    protected output: string[] = [];
    protected indentLevel = 0;
    protected analysis!: AnalysisResult; // Assigned in emitProgram

    emitProgram(program: Program, analysis: AnalysisResult): string {
        this.output = [];
        this.indentLevel = 0;
        this.analysis = analysis;
        this.emitSpecificProgram(program);
        return this.output.join('\n');
    }

    protected abstract emitSpecificProgram(program: Program): void;
    protected abstract emitStatement(stmt: Statement): void;
    protected abstract emitExpression(expr: Expression, parentPrecedence: number): string;

    protected emit(line: string) {
        this.output.push('  '.repeat(this.indentLevel) + line);
    }
    protected indent() { this.indentLevel++; }
    protected dedent() { this.indentLevel--; }

    protected emitBlock(block: Block) {
        block.body.forEach(s => this.emitStatement(s));
    }

    protected inferType(expr: Expression): string {
        // Re-implement basic inference using the symbol table from analysis
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'boolean') return 'boolean';
                if (typeof expr.value === 'string') return 'String';
                if (typeof expr.value === 'number') {
                    if (expr.raw && (expr.raw.includes('.') || expr.raw.toLowerCase().includes('e'))) return 'double';
                    return 'int';
                }
                return 'Object';
            case 'Identifier': return this.analysis.symbolTable.get(expr.name) || 'var';
            case 'BinaryExpression':
                if (['>', '<', '>=', '<=', '==', '!='].includes(expr.operator)) return 'boolean';
                const left = this.inferType(expr.left);
                if (left === 'double') return 'double';
                return 'int';
            case 'CallExpression':
                if (this.analysis.functionReturnTypes.has(expr.callee.name)) return this.analysis.functionReturnTypes.get(expr.callee.name)!;
                return 'var';
            default: return 'var';
        }
    }
}

// --- Java Emitter ---

class JavaEmitter extends BaseEmitter {
    protected emitSpecificProgram(program: Program): void {
        // Reset symbol table for emission to ensure scope correctness
        this.analysis.symbolTable = new SymbolTable();

        this.emit('public class Main {');
        this.indent();
        this.emit('public static void main(String[] args) {');
        this.indent();

        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');
        mainBody.forEach(stmt => this.emitStatement(stmt));

        this.dedent();
        this.emit('}'); // End main

        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        functions.forEach(func => {
            this.emit('');
            this.emitStatement(func);
        });

        this.dedent();
        this.emit('}'); // End class
    }

    protected emitStatement(stmt: Statement): void {
        switch (stmt.type) {
            case 'Print':
                this.emit(`System.out.println(${this.emitExpression(stmt.expression, 0)});`);
                break;
            case 'Assignment':
                const rVal = this.emitExpression(stmt.value, 0);
                if (this.analysis.symbolTable.hasInCurrentScope(stmt.name)) {
                    this.emit(`${stmt.name} = ${rVal};`);
                } else {
                    let type = this.inferType(stmt.value);
                    if (type === 'var') type = 'Object';
                    this.emit(`${type} ${stmt.name} = ${rVal};`);
                    this.analysis.symbolTable.set(stmt.name, type);
                }
                break;
            case 'If':
                this.emit(`if (${this.emitExpression(stmt.condition, 0)}) {`);
                this.indent();
                this.analysis.symbolTable.enterScope();
                this.emitBlock(stmt.thenBranch);
                this.analysis.symbolTable.exitScope();
                this.dedent();
                this.emit('}');
                if (stmt.elseBranch) {
                    this.emit('else {'); // Fixed capitalization
                    this.indent();
                    this.analysis.symbolTable.enterScope();
                    this.emitBlock(stmt.elseBranch);
                    this.analysis.symbolTable.exitScope();
                    this.dedent();
                    this.emit('}');
                }
                break;
            case 'While':
                this.emit(`while (${this.emitExpression(stmt.condition, 0)}) {`);
                this.indent();
                this.analysis.symbolTable.enterScope();
                this.emitBlock(stmt.body);
                this.analysis.symbolTable.exitScope();
                this.dedent();
                this.emit('}');
                break;
            case 'For':
                let varType = 'var';
                const iterType = this.inferType(stmt.iterable);
                if (iterType.endsWith('[]')) varType = iterType.slice(0, -2);
                this.emit(`for (${varType} ${stmt.variable} : ${this.emitExpression(stmt.iterable, 0)}) {`);
                this.indent();
                this.analysis.symbolTable.enterScope();
                this.analysis.symbolTable.set(stmt.variable, varType);
                this.emitBlock(stmt.body);
                this.analysis.symbolTable.exitScope();
                this.dedent();
                this.emit('}');
                break;
            case 'FunctionDeclaration':
                this.analysis.symbolTable.enterScope();
                const paramTypes = this.analysis.functionParamTypes.get(stmt.name) || [];
                stmt.params.forEach((p, i) => {
                    let type = paramTypes[i];
                    if (!type || type === 'var') type = 'Object';
                    this.analysis.symbolTable.set(p.name, type);
                });
                const params = stmt.params.map((p, i) => {
                    let type = paramTypes[i] || 'Object';
                    return `${type} ${p.name}`;
                }).join(', ');
                const returnType = this.analysis.functionReturnTypes.get(stmt.name) || 'void';
                this.emit(`public static ${returnType} ${stmt.name}(${params}) {`);
                this.indent();
                this.emitBlock(stmt.body);
                this.dedent();
                this.emit('}');
                this.analysis.symbolTable.exitScope();
                break;
            case 'Return':
                this.emit(`return ${stmt.value ? this.emitExpression(stmt.value, 0) : ''};`);
                break;
            case 'ExpressionStatement':
                this.emit(`${this.emitExpression(stmt.expression, 0)};`);
                break;
        }
    }

    protected emitExpression(expr: Expression, parentPrecedence: number): string {
        let output = '';
        let currentPrecedence = 99;

        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') output = `"${expr.value}"`;
                else output = String(expr.value);
                break;
            case 'Identifier': output = expr.name; break;
            case 'BinaryExpression':
                const opMap: Record<string, { op: string, prec: number }> = {
                    'or': { op: '||', prec: Precedence.LogicalOr }, 'and': { op: '&&', prec: Precedence.LogicalAnd },
                    '==': { op: '==', prec: Precedence.Equality }, '!=': { op: '!=', prec: Precedence.Equality },
                    '<': { op: '<', prec: Precedence.Relational }, '>': { op: '>', prec: Precedence.Relational },
                    '<=': { op: '<=', prec: Precedence.Relational }, '>=': { op: '>=', prec: Precedence.Relational },
                    '+': { op: '+', prec: Precedence.Additive }, '-': { op: '-', prec: Precedence.Additive },
                    '*': { op: '*', prec: Precedence.Multiplicative }, '/': { op: '/', prec: Precedence.Multiplicative },
                    '%': { op: '%', prec: Precedence.Multiplicative }
                };
                const opData = opMap[expr.operator] || { op: expr.operator, prec: 0 };
                currentPrecedence = opData.prec;
                output = `${this.emitExpression(expr.left, currentPrecedence)} ${opData.op} ${this.emitExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let op = expr.operator === 'not' ? '!' : expr.operator;
                output = `${op}${this.emitExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.emitExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const type = this.inferType(expr);
                const baseType = type.endsWith('[]') ? type.slice(0, -2) : 'Object';
                const elems = expr.elements.map(e => this.emitExpression(e, 0)).join(', ');
                output = `new ${baseType}[] {${elems}}`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}

// --- CSP Emitter ---

class CSPEmitter extends BaseEmitter {
    protected emitSpecificProgram(program: Program): void {
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        mainBody.forEach(stmt => this.emitStatement(stmt));
        functions.forEach(func => {
            this.emit('');
            this.emitStatement(func);
        });
    }

    protected emitStatement(stmt: Statement): void {
        switch (stmt.type) {
            case 'Print': this.emit(`DISPLAY(${this.emitExpression(stmt.expression, 0)})`); break;
            case 'Assignment': this.emit(`${stmt.name} <- ${this.emitExpression(stmt.value, 0)}`); break;
            case 'If':
                this.emit(`IF (${this.emitExpression(stmt.condition, 0)})`);
                this.emit('{'); this.indent(); this.emitBlock(stmt.thenBranch); this.dedent(); this.emit('}');
                if (stmt.elseBranch) {
                    this.emit('ELSE');
                    this.emit('{'); this.indent(); this.emitBlock(stmt.elseBranch); this.dedent(); this.emit('}');
                }
                break;
            case 'While':
                this.emit(`REPEAT UNTIL (NOT (${this.emitExpression(stmt.condition, 0)}))`);
                this.emit('{'); this.indent(); this.emitBlock(stmt.body); this.dedent(); this.emit('}');
                break;
            case 'For':
                this.emit(`FOR EACH ${stmt.variable} IN ${this.emitExpression(stmt.iterable, 0)}`);
                this.emit('{'); this.indent(); this.emitBlock(stmt.body); this.dedent(); this.emit('}');
                break;
            case 'FunctionDeclaration':
                const params = stmt.params.map(p => p.name).join(', ');
                this.emit(`PROCEDURE ${stmt.name} (${params})`);
                this.emit('{'); this.indent(); this.emitBlock(stmt.body); this.dedent(); this.emit('}');
                break;
            case 'Return': this.emit(`RETURN ${stmt.value ? this.emitExpression(stmt.value, 0) : ''}`); break;
            case 'ExpressionStatement': this.emit(this.emitExpression(stmt.expression, 0)); break;
        }
    }

    protected emitExpression(expr: Expression, parentPrecedence: number): string {
        let output = '';
        let currentPrecedence = 99;

        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') output = `"${expr.value}"`;
                else if (typeof expr.value === 'boolean') output = expr.value ? 'true' : 'false';
                else output = String(expr.value);
                break;
            case 'Identifier': output = expr.name; break;
            case 'BinaryExpression':
                const opMap: Record<string, { op: string, prec: number }> = {
                    'or': { op: 'OR', prec: Precedence.LogicalOr }, 'and': { op: 'AND', prec: Precedence.LogicalAnd },
                    '==': { op: '=', prec: Precedence.Equality }, '!=': { op: '<>', prec: Precedence.Equality },
                    '<': { op: '<', prec: Precedence.Relational }, '>': { op: '>', prec: Precedence.Relational },
                    '<=': { op: '<=', prec: Precedence.Relational }, '>=': { op: '>=', prec: Precedence.Relational },
                    '+': { op: '+', prec: Precedence.Additive }, '-': { op: '-', prec: Precedence.Additive },
                    '*': { op: '*', prec: Precedence.Multiplicative }, '/': { op: '/', prec: Precedence.Multiplicative },
                    '%': { op: 'MOD', prec: Precedence.Multiplicative }
                };
                const opData = opMap[expr.operator] || { op: expr.operator, prec: 0 };
                currentPrecedence = opData.prec;
                output = `${this.emitExpression(expr.left, currentPrecedence)} ${opData.op} ${this.emitExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let op = expr.operator === '!' || expr.operator === 'not' ? 'NOT ' : expr.operator;
                output = `${op}${this.emitExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.emitExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const elems = expr.elements.map(e => this.emitExpression(e, 0)).join(', ');
                output = `[${elems}]`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}

// --- Python Emitter ---

class PythonEmitter extends BaseEmitter {
    protected emitSpecificProgram(program: Program): void {
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        functions.forEach(func => {
            this.emitStatement(func);
            this.emit('');
        });
        mainBody.forEach(stmt => this.emitStatement(stmt));
    }

    protected emitStatement(stmt: Statement): void {
        switch (stmt.type) {
            case 'Print': this.emit(`print(${this.emitExpression(stmt.expression, 0)})`); break;
            case 'Assignment': this.emit(`${stmt.name} = ${this.emitExpression(stmt.value, 0)}`); break;
            case 'If':
                this.emit(`if ${this.emitExpression(stmt.condition, 0)}:`);
                this.indent(); this.emitBlock(stmt.thenBranch); this.dedent();
                if (stmt.elseBranch) {
                    this.emit('else:');
                    this.indent(); this.emitBlock(stmt.elseBranch); this.dedent();
                }
                break;
            case 'While':
                this.emit(`while ${this.emitExpression(stmt.condition, 0)}:`);
                this.indent(); this.emitBlock(stmt.body); this.dedent();
                break;
            case 'For':
                this.emit(`for ${stmt.variable} in ${this.emitExpression(stmt.iterable, 0)}:`);
                this.indent(); this.emitBlock(stmt.body); this.dedent();
                break;
            case 'FunctionDeclaration':
                const params = stmt.params.map(p => p.name).join(', ');
                this.emit(`def ${stmt.name}(${params}):`);
                this.indent(); this.emitBlock(stmt.body); this.dedent();
                break;
            case 'Return': this.emit(`return ${stmt.value ? this.emitExpression(stmt.value, 0) : ''}`); break;
            case 'ExpressionStatement': this.emit(this.emitExpression(stmt.expression, 0)); break;
        }
    }

    protected emitExpression(expr: Expression, parentPrecedence: number): string {
        let output = '';
        let currentPrecedence = 99;

        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') output = `"${expr.value}"`;
                else if (typeof expr.value === 'boolean') output = expr.value ? 'True' : 'False';
                else output = String(expr.value);
                break;
            case 'Identifier': output = expr.name; break;
            case 'BinaryExpression':
                // Python operators are mostly the same, handled implicitly or map '&&'->'and'
                const opMap: Record<string, string> = { '&&': 'and', '||': 'or', '!': 'not' };
                let op = opMap[expr.operator] || expr.operator;
                // Simple precedence mapping (could be more robust)
                if (['or'].includes(op)) currentPrecedence = Precedence.LogicalOr;
                else if (['and'].includes(op)) currentPrecedence = Precedence.LogicalAnd;
                else if (['+', '-'].includes(op)) currentPrecedence = Precedence.Additive;
                else if (['*', '/', '%'].includes(op)) currentPrecedence = Precedence.Multiplicative;
                else currentPrecedence = 0; // Default low precedence

                output = `${this.emitExpression(expr.left, currentPrecedence)} ${op} ${this.emitExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let uOp = expr.operator === '!' ? 'not ' : expr.operator;
                output = `${uOp}${this.emitExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.emitExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const elems = expr.elements.map(e => this.emitExpression(e, 0)).join(', ');
                output = `[${elems}]`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}