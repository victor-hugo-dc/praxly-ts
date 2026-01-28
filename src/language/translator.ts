import type { Program, Statement, Expression, Block, BinaryExpression, UnaryExpression } from './ast';

// --- Types & Interfaces ---

export type TargetLanguage = 'java' | 'python' | 'csp';

interface TranslationContext {
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

// --- Abstract Visitor Pattern ---

abstract class ASTVisitor {
    protected output: string[] = [];
    protected indentLevel = 0;
    protected context: TranslationContext;

    constructor(context: TranslationContext) {
        this.context = context;
    }

    getGeneratedCode(): string {
        return this.output.join('\n');
    }

    protected emit(line: string) {
        this.output.push('  '.repeat(this.indentLevel) + line);
    }
    protected indent() { this.indentLevel++; }
    protected dedent() { this.indentLevel--; }

    // -- Visit Methods (To be implemented by concrete emitters) --

    abstract visitProgram(program: Program): void;
    abstract visitBlock(block: Block): void;

    // Statements
    abstract visitPrint(stmt: any): void;
    abstract visitAssignment(stmt: any): void;
    abstract visitIf(stmt: any): void;
    abstract visitWhile(stmt: any): void;
    abstract visitFor(stmt: any): void;
    abstract visitFunctionDeclaration(stmt: any): void;
    abstract visitReturn(stmt: any): void;
    abstract visitExpressionStatement(stmt: any): void;

    // Expressions (These return strings usually, but we keep it void here for the structure, helper methods do string gen)
    abstract generateExpression(expr: Expression, parentPrecedence: number): string;

    // Dispatcher
    visitStatement(stmt: Statement) {
        switch (stmt.type) {
            case 'Print': this.visitPrint(stmt); break;
            case 'Assignment': this.visitAssignment(stmt); break;
            case 'If': this.visitIf(stmt); break;
            case 'While': this.visitWhile(stmt); break;
            case 'For': this.visitFor(stmt); break;
            case 'FunctionDeclaration': this.visitFunctionDeclaration(stmt); break;
            case 'Return': this.visitReturn(stmt); break;
            case 'ExpressionStatement': this.visitExpressionStatement(stmt); break;
        }
    }

    // Type Inference Helper
    protected inferType(expr: Expression): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'boolean') return 'boolean';
                if (typeof expr.value === 'string') return 'String';
                if (typeof expr.value === 'number') {
                    if (expr.raw && (expr.raw.includes('.') || expr.raw.toLowerCase().includes('e'))) return 'double';
                    return 'int';
                }
                return 'Object';
            case 'Identifier': return this.context.symbolTable.get(expr.name) || 'var';
            case 'BinaryExpression':
                if (['>', '<', '>=', '<=', '==', '!='].includes(expr.operator)) return 'boolean';
                const left = this.inferType(expr.left);
                if (left === 'double') return 'double';
                return 'int';
            case 'CallExpression':
                if (this.context.functionReturnTypes.has(expr.callee.name)) return this.context.functionReturnTypes.get(expr.callee.name)!;
                return 'var';
            default: return 'var';
        }
    }
}

// --- Specific Emitters ---

class JavaEmitter extends ASTVisitor {
    visitProgram(program: Program): void {
        // Reset symbol table for emission
        this.context.symbolTable = new SymbolTable();

        this.emit('public class Main {');
        this.indent();
        this.emit('public static void main(String[] args) {');
        this.indent();

        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');
        mainBody.forEach(stmt => this.visitStatement(stmt));

        this.dedent();
        this.emit('}');

        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        functions.forEach(func => {
            this.emit('');
            this.visitStatement(func);
        });

        this.dedent();
        this.emit('}');
    }

    visitBlock(block: Block): void {
        block.body.forEach(stmt => this.visitStatement(stmt));
    }

    visitPrint(stmt: any): void {
        this.emit(`System.out.println(${this.generateExpression(stmt.expression, 0)});`);
    }

    visitAssignment(stmt: any): void {
        const rVal = this.generateExpression(stmt.value, 0);
        if (this.context.symbolTable.hasInCurrentScope(stmt.name)) {
            this.emit(`${stmt.name} = ${rVal};`);
        } else {
            let type = this.inferType(stmt.value);
            if (type === 'var') type = 'Object';
            this.emit(`${type} ${stmt.name} = ${rVal};`);
            this.context.symbolTable.set(stmt.name, type);
        }
    }

    visitIf(stmt: any): void {
        this.emit(`if (${this.generateExpression(stmt.condition, 0)}) {`);
        this.indent();
        this.context.symbolTable.enterScope();
        this.visitBlock(stmt.thenBranch);
        this.context.symbolTable.exitScope();
        this.dedent();
        this.emit('}');
        if (stmt.elseBranch) {
            this.emit('else {');
            this.indent();
            this.context.symbolTable.enterScope();
            this.visitBlock(stmt.elseBranch);
            this.context.symbolTable.exitScope();
            this.dedent();
            this.emit('}');
        }
    }

    visitWhile(stmt: any): void {
        this.emit(`while (${this.generateExpression(stmt.condition, 0)}) {`);
        this.indent();
        this.context.symbolTable.enterScope();
        this.visitBlock(stmt.body);
        this.context.symbolTable.exitScope();
        this.dedent();
        this.emit('}');
    }

    visitFor(stmt: any): void {
        let varType = 'var';
        const iterType = this.inferType(stmt.iterable);
        if (iterType.endsWith('[]')) varType = iterType.slice(0, -2);

        this.emit(`for (${varType} ${stmt.variable} : ${this.generateExpression(stmt.iterable, 0)}) {`);
        this.indent();
        this.context.symbolTable.enterScope();
        this.context.symbolTable.set(stmt.variable, varType);
        this.visitBlock(stmt.body);
        this.context.symbolTable.exitScope();
        this.dedent();
        this.emit('}');
    }

    visitFunctionDeclaration(stmt: any): void {
        this.context.symbolTable.enterScope();
        const paramTypes = this.context.functionParamTypes.get(stmt.name) || [];

        stmt.params.forEach((p: any, i: number) => {
            let type = paramTypes[i];
            if (!type || type === 'var') type = 'Object';
            this.context.symbolTable.set(p.name, type);
        });

        const params = stmt.params.map((p: any, i: number) => {
            let type = paramTypes[i] || 'Object';
            return `${type} ${p.name}`;
        }).join(', ');

        const returnType = this.context.functionReturnTypes.get(stmt.name) || 'void';
        this.emit(`public static ${returnType} ${stmt.name}(${params}) {`);
        this.indent();
        this.visitBlock(stmt.body);
        this.dedent();
        this.emit('}');
        this.context.symbolTable.exitScope();
    }

    visitReturn(stmt: any): void {
        this.emit(`return ${stmt.value ? this.generateExpression(stmt.value, 0) : ''};`);
    }

    visitExpressionStatement(stmt: any): void {
        this.emit(`${this.generateExpression(stmt.expression, 0)};`);
    }

    generateExpression(expr: Expression, parentPrecedence: number): string {
        let output = '';
        let currentPrecedence = 99;

        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'string') output = `"${expr.value}"`;
                else if (typeof expr.value === 'boolean') output = expr.value.toString(); // Java uses lower case true/false
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
                output = `${this.generateExpression(expr.left, currentPrecedence)} ${opData.op} ${this.generateExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let op = expr.operator === 'not' ? '!' : expr.operator;
                output = `${op}${this.generateExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.generateExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const type = this.inferType(expr);
                const baseType = type.endsWith('[]') ? type.slice(0, -2) : 'Object';
                const elems = expr.elements.map(e => this.generateExpression(e, 0)).join(', ');
                output = `new ${baseType}[] {${elems}}`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}

class CSPEmitter extends ASTVisitor {
    visitProgram(program: Program): void {
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        mainBody.forEach(stmt => this.visitStatement(stmt));
        functions.forEach(func => {
            this.emit('');
            this.visitStatement(func);
        });
    }

    visitBlock(block: Block): void {
        block.body.forEach(stmt => this.visitStatement(stmt));
    }

    visitPrint(stmt: any): void {
        this.emit(`DISPLAY(${this.generateExpression(stmt.expression, 0)})`);
    }

    visitAssignment(stmt: any): void {
        this.emit(`${stmt.name} <- ${this.generateExpression(stmt.value, 0)}`);
    }

    visitIf(stmt: any): void {
        this.emit(`IF (${this.generateExpression(stmt.condition, 0)})`);
        this.emit('{'); this.indent(); this.visitBlock(stmt.thenBranch); this.dedent(); this.emit('}');
        if (stmt.elseBranch) {
            this.emit('ELSE');
            this.emit('{'); this.indent(); this.visitBlock(stmt.elseBranch); this.dedent(); this.emit('}');
        }
    }

    visitWhile(stmt: any): void {
        this.emit(`REPEAT UNTIL (NOT (${this.generateExpression(stmt.condition, 0)}))`);
        this.emit('{'); this.indent(); this.visitBlock(stmt.body); this.dedent(); this.emit('}');
    }

    visitFor(stmt: any): void {
        this.emit(`FOR EACH ${stmt.variable} IN ${this.generateExpression(stmt.iterable, 0)}`);
        this.emit('{'); this.indent(); this.visitBlock(stmt.body); this.dedent(); this.emit('}');
    }

    visitFunctionDeclaration(stmt: any): void {
        const params = stmt.params.map((p: any) => p.name).join(', ');
        this.emit(`PROCEDURE ${stmt.name} (${params})`);
        this.emit('{'); this.indent(); this.visitBlock(stmt.body); this.dedent(); this.emit('}');
    }

    visitReturn(stmt: any): void {
        this.emit(`RETURN ${stmt.value ? this.generateExpression(stmt.value, 0) : ''}`);
    }

    visitExpressionStatement(stmt: any): void {
        this.emit(this.generateExpression(stmt.expression, 0));
    }

    generateExpression(expr: Expression, parentPrecedence: number): string {
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
                output = `${this.generateExpression(expr.left, currentPrecedence)} ${opData.op} ${this.generateExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let op = expr.operator === '!' || expr.operator === 'not' ? 'NOT ' : expr.operator;
                output = `${op}${this.generateExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.generateExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const elems = expr.elements.map(e => this.generateExpression(e, 0)).join(', ');
                output = `[${elems}]`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}

class PythonEmitter extends ASTVisitor {
    visitProgram(program: Program): void {
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        const mainBody = program.body.filter(s => s.type !== 'FunctionDeclaration');

        functions.forEach(func => {
            this.visitStatement(func);
            this.emit('');
        });
        mainBody.forEach(stmt => this.visitStatement(stmt));
    }

    visitBlock(block: Block): void {
        block.body.forEach(stmt => this.visitStatement(stmt));
    }

    visitPrint(stmt: any): void {
        this.emit(`print(${this.generateExpression(stmt.expression, 0)})`);
    }

    visitAssignment(stmt: any): void {
        this.emit(`${stmt.name} = ${this.generateExpression(stmt.value, 0)}`);
    }

    visitIf(stmt: any): void {
        this.emit(`if ${this.generateExpression(stmt.condition, 0)}:`);
        this.indent(); this.visitBlock(stmt.thenBranch); this.dedent();
        if (stmt.elseBranch) {
            this.emit('else:');
            this.indent(); this.visitBlock(stmt.elseBranch); this.dedent();
        }
    }

    visitWhile(stmt: any): void {
        this.emit(`while ${this.generateExpression(stmt.condition, 0)}:`);
        this.indent(); this.visitBlock(stmt.body); this.dedent();
    }

    visitFor(stmt: any): void {
        this.emit(`for ${stmt.variable} in ${this.generateExpression(stmt.iterable, 0)}:`);
        this.indent(); this.visitBlock(stmt.body); this.dedent();
    }

    visitFunctionDeclaration(stmt: any): void {
        const params = stmt.params.map((p: any) => p.name).join(', ');
        this.emit(`def ${stmt.name}(${params}):`);
        this.indent(); this.visitBlock(stmt.body); this.dedent();
    }

    visitReturn(stmt: any): void {
        this.emit(`return ${stmt.value ? this.generateExpression(stmt.value, 0) : ''}`);
    }

    visitExpressionStatement(stmt: any): void {
        this.emit(this.generateExpression(stmt.expression, 0));
    }

    generateExpression(expr: Expression, parentPrecedence: number): string {
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
                const opMap: Record<string, { op: string, prec: number }> = {
                    'or': { op: 'or', prec: Precedence.LogicalOr }, 'and': { op: 'and', prec: Precedence.LogicalAnd },
                    '==': { op: '==', prec: Precedence.Equality }, '!=': { op: '!=', prec: Precedence.Equality },
                    '<': { op: '<', prec: Precedence.Relational }, '>': { op: '>', prec: Precedence.Relational },
                    '<=': { op: '<=', prec: Precedence.Relational }, '>=': { op: '>=', prec: Precedence.Relational },
                    '+': { op: '+', prec: Precedence.Additive }, '-': { op: '-', prec: Precedence.Additive },
                    '*': { op: '*', prec: Precedence.Multiplicative }, '/': { op: '/', prec: Precedence.Multiplicative },
                    '%': { op: '%', prec: Precedence.Multiplicative }
                };
                const opData = opMap[expr.operator] || { op: expr.operator, prec: 0 };
                currentPrecedence = opData.prec;
                output = `${this.generateExpression(expr.left, currentPrecedence)} ${opData.op} ${this.generateExpression(expr.right, currentPrecedence)}`;
                break;
            case 'UnaryExpression':
                currentPrecedence = Precedence.Unary;
                let op = expr.operator === '!' ? 'not ' : expr.operator;
                output = `${op}${this.generateExpression(expr.argument, currentPrecedence)}`;
                break;
            case 'CallExpression':
                currentPrecedence = Precedence.Call;
                const args = expr.arguments.map(a => this.generateExpression(a, 0)).join(', ');
                output = `${expr.callee.name}(${args})`;
                break;
            case 'ArrayLiteral':
                const elems = expr.elements.map(e => this.generateExpression(e, 0)).join(', ');
                output = `[${elems}]`;
                break;
        }
        return (currentPrecedence < parentPrecedence) ? `(${output})` : output;
    }
}

// --- Main Translator Class ---

export class Translator {
    translate(program: Program, targetLang: TargetLanguage): string {
        const context = this.analyze(program);

        let emitter: ASTVisitor;
        switch (targetLang) {
            case 'java': emitter = new JavaEmitter(context); break;
            case 'csp': emitter = new CSPEmitter(context); break;
            case 'python': emitter = new PythonEmitter(context); break;
            default: throw new Error(`Unsupported target language: ${targetLang}`);
        }

        return emitter.visitProgram(program) || emitter.getGeneratedCode();
    }

    private analyze(program: Program): TranslationContext {
        const context: TranslationContext = {
            symbolTable: new SymbolTable(),
            functionReturnTypes: new Map(),
            functionParamTypes: new Map()
        };

        // --- Helper to infer types during analysis ---
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
                case 'Identifier': return context.symbolTable.get(expr.name) || 'var';
                case 'BinaryExpression':
                    if (['>', '<', '>=', '<=', '==', '!='].includes(expr.operator)) return 'boolean';
                    const left = inferType(expr.left);
                    if (left === 'double') return 'double';
                    return 'int';
                case 'CallExpression':
                    if (context.functionReturnTypes.has(expr.callee.name)) return context.functionReturnTypes.get(expr.callee.name)!;
                    return 'var';
                default: return 'var';
            }
        };

        // --- Analysis Walkers ---

        const analyzeBlock = (statements: Statement[]) => {
            statements.forEach(stmt => {
                if (stmt.type === 'Assignment') {
                    const type = inferType(stmt.value);
                    if (type !== 'var') context.symbolTable.set(stmt.name, type);
                }
                if (stmt.type === 'If') {
                    analyzeBlock(stmt.thenBranch.body);
                    if (stmt.elseBranch) analyzeBlock(stmt.elseBranch.body);
                }
                if (stmt.type === 'While') analyzeBlock(stmt.body.body);
                if (stmt.type === 'For') analyzeBlock(stmt.body.body);
            });
        };

        const analyzeCalls = (node: any) => {
            if (!node) return;
            if (node.type === 'CallExpression') {
                const funcName = node.callee.name;
                const argTypes = node.arguments.map((arg: Expression) => inferType(arg));
                if (!context.functionParamTypes.has(funcName)) {
                    context.functionParamTypes.set(funcName, argTypes);
                }
            }
            for (const key in node) {
                if (typeof node[key] === 'object' && node[key] !== null) {
                    if (Array.isArray(node[key])) node[key].forEach((c: any) => analyzeCalls(c));
                    else analyzeCalls(node[key]);
                }
            }
        };

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

        // --- Execute Analysis ---
        const functions = program.body.filter(s => s.type === 'FunctionDeclaration');
        functions.forEach((func: any) => {
            context.functionReturnTypes.set(func.name, analyzeReturnType(func.body));
        });
        analyzeBlock(program.body);
        analyzeCalls(program);

        return context;
    }
}