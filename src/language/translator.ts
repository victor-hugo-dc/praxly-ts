import type { 
    Program, Statement, Expression, Block, 
    ClassDeclaration, MethodDeclaration
} from './ast';

export type TargetLanguage = 'java' | 'python' | 'csp';

interface TranslationContext {
    symbolTable: Map<string, string>;
    functionSignatures: Map<string, { returnType: string, paramTypes: string[] }>;
    classNames: Set<string>;
    currentClassName?: string;
}

/**
 * RECONCILED TRANSLATOR
 * Merges the OOP features of the original Praxly with the modern TypeScript architecture.
 * Supports Classes, Methods, Constructors, and robust Type Inference.
 */
export class Translator {
    translate(program: Program, targetLang: TargetLanguage): string {
        // Pass 1: Global Analysis (Type Inference & Signature Mapping)
        const analyzer = new GlobalAnalysis();
        const context = analyzer.analyze(program);

        let emitter: BaseEmitter;
        switch (targetLang) {
            case 'java': emitter = new JavaEmitter(context); break;
            case 'python': emitter = new PythonEmitter(context); break;
            case 'csp': emitter = new CSPEmitter(context); break;
            default: return "// Unsupported Language";
        }

        return emitter.emit(program);
    }
}

/**
 * Analysis pass to determine types and signatures before code generation.
 */
class GlobalAnalysis {
    private symbolTable = new Map<string, string>();
    private functionSignatures = new Map<string, { returnType: string, paramTypes: string[] }>;
    private classNames = new Set<string>();

    analyze(program: Program): TranslationContext {
        // Collect class names
        program.body.forEach(node => {
            if (node.type === 'ClassDeclaration') this.classNames.add(node.name);
        });

        // First pass: identify variables and function/method returns
        this.visitBlock(program.body);

        // Second pass: infer parameter types from call sites
        this.resolveCalls(program);

        return {
            symbolTable: this.symbolTable,
            functionSignatures: this.functionSignatures,
            classNames: this.classNames
        };
    }

    private visitBlock(body: Statement[]) {
        if (!body) return;
        body.forEach(stmt => {
            if (!stmt) return;
            switch (stmt.type) {
                case 'Assignment':
                    this.symbolTable.set(stmt.name, this.inferType(stmt.value));
                    break;
                case 'FieldDeclaration':
                    this.symbolTable.set(stmt.name, this.inferType(stmt.value! || (stmt as any).initializer));
                    break;
                case 'MethodDeclaration' as any:
                    const decl = stmt as any;
                    const ret = this.inferReturnType(decl.body);
                    this.functionSignatures.set(decl.name, { returnType: ret, paramTypes: [] });
                    this.visitBlock(decl.body.body);
                    break;
                case 'Constructor' as any:
                    this.visitBlock((stmt as any).body.body);
                    break;
                case 'ClassDeclaration':
                    stmt.body.forEach((member: any) => {
                        this.visitBlock([member]);
                    });
                    break;
                case 'If':
                    this.visitBlock(stmt.thenBranch.body);
                    if (stmt.elseBranch) this.visitBlock(stmt.elseBranch.body);
                    break;
                case 'While':
                case 'For':
                    this.visitBlock(stmt.body.body);
                    break;
            }
        });
    }

    private inferReturnType(block: Block): string {
        for (const s of block.body) {
            if (s.type === 'Return') {
                return s.value ? this.inferType(s.value) : 'void';
            }
            if (s.type === 'If') {
                const tr = this.inferReturnType(s.thenBranch);
                if (tr !== 'void') return tr;
                if (s.elseBranch) {
                    const er = this.inferReturnType(s.elseBranch);
                    if (er !== 'void') return er;
                }
            }
            if (s.type === 'While' || (s.type as any) === 'For') {
                const lr = this.inferReturnType((s as any).body);
                if (lr !== 'void') return lr;
            }
        }
        return 'void';
    }

    private resolveCalls(node: any) {
        if (!node || typeof node !== 'object') return;
        
        if (node.type === 'CallExpression') {
            const callee = node.callee;
            const calleeName = callee.type === 'Identifier' ? callee.name : (callee.type === 'MemberExpression' ? callee.property.name : null);
            if (calleeName) {
                const sig = this.functionSignatures.get(calleeName);
                if (sig && sig.paramTypes.length === 0) {
                    sig.paramTypes = node.arguments.map((arg: Expression) => this.inferType(arg));
                }
            }
        }

        for (const key in node) {
            const val = node[key];
            if (Array.isArray(val)) {
                val.forEach(item => this.resolveCalls(item));
            } else {
                this.resolveCalls(val);
            }
        }
    }

    private inferType(expr: Expression): string {
        if (!expr) return 'Object';
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'number') return String(expr.raw || '').includes('.') ? 'double' : 'int';
                if (typeof expr.value === 'boolean') return 'boolean';
                if (typeof expr.value === 'string') return 'String';
                return 'Object';
            case 'Identifier':
                return this.symbolTable.get(expr.name) || 'Object';
            case 'CallExpression':
                const callee = expr.callee;
                const calleeName = callee.type === 'Identifier' ? callee.name : (callee.type === 'MemberExpression' ? callee.property.name : null);
                return (calleeName ? this.functionSignatures.get(calleeName)?.returnType : null) || 'Object';
            case 'BinaryExpression':
                if (['>', '<', '>=', '<=', '==', '!=', 'and', 'or'].includes(expr.operator)) return 'boolean';
                const left = this.inferType(expr.left);
                const right = this.inferType(expr.right);
                if (left === 'double' || right === 'double') return 'double';
                if (left === 'String' || right === 'String') return 'String';
                return 'int';
            case 'UnaryExpression':
                if (expr.operator === 'not') return 'boolean';
                return this.inferType(expr.argument);
            case 'MemberExpression':
                return 'Object'; // Basic fallback
            default: return 'Object';
        }
    }
}

abstract class BaseEmitter {
    protected output: string[] = [];
    protected indentLevel = 0;
    protected context: TranslationContext;
    constructor(context: TranslationContext) {
        this.context = context;
    }
    abstract emit(program: Program): string;
    protected add(s: string) { this.output.push('  '.repeat(this.indentLevel) + s); }
    protected indent() { this.indentLevel++; }
    protected dedent() { this.indentLevel--; }
}

class JavaEmitter extends BaseEmitter {
    private declaredLocals = new Set<string>();

    emit(program: Program): string {
        this.output = [];
        this.declaredLocals.clear();
        
        const mainClass = program.body.find(s => s.type === 'ClassDeclaration' && s.name === 'Main') as ClassDeclaration | undefined;
        const otherClasses = program.body.filter(s => s.type === 'ClassDeclaration' && s.name !== 'Main') as ClassDeclaration[];
        const scriptCode = program.body.filter(s => s.type !== 'ClassDeclaration');

        this.add("public class Main {");
        this.indent();

        if (mainClass) {
            mainClass.body.forEach(member => {
                if (member.type === ('MethodDeclaration' as any) && (member as any).name === 'main') {
                    // Handled in main entry point
                } else {
                    this.visitStatement(member as any);
                    this.output.push("");
                }
            });
        }

        otherClasses.forEach(cls => {
            this.visitClass(cls);
            this.output.push("");
        });

        const sourceMain = mainClass?.body.find(m => m.type === ('MethodDeclaration' as any) && (m as any).name === 'main') as MethodDeclaration | undefined;
        if (scriptCode.length > 0 || sourceMain) {
            this.add("public static void main(String[] args) {");
            this.indent();
            this.declaredLocals.clear();
            if (sourceMain) sourceMain.body.body.forEach(s => this.visitStatement(s as any));
            scriptCode.forEach(s => this.visitStatement(s));
            this.dedent();
            this.add("}");
        }

        this.dedent();
        this.add("}");
        return this.output.join('\n').replace(/\n\n\n+/g, '\n\n');
    }

    private visitClass(node: ClassDeclaration) {
        this.add(`public static class ${node.name} {`);
        this.indent();
        node.body.forEach(member => this.visitStatement(member as any));
        this.dedent();
        this.add("}");
    }

    private visitStatement(node: Statement) {
        switch (node.type) {
            case 'Assignment':
                const cleanName = (node as any).name.replace(/^unknown\./, "");
                const isField = cleanName.includes('.');
                const type = this.context.symbolTable.get((node as any).name) || 'var';
                const isRedeclare = !isField && !this.declaredLocals.has((node as any).name);
                if (isRedeclare) this.declaredLocals.add((node as any).name);
                const prefix = isRedeclare ? `${type} ` : "";
                this.add(`${prefix}${cleanName.replace(/^self\./, "this.")} = ${this.genExpr((node as any).value)};`);
                break;
            case 'FieldDeclaration':
                const fType = (node as any).fieldType || this.context.symbolTable.get(node.name) || 'Object';
                this.add(`${node.access || 'private'} ${node.isStatic ? 'static ' : ''}${fType} ${node.name} = ${node.value || (node as any).initializer ? this.genExpr(node.value || (node as any).initializer) : 'null'};`);
                break;
            case 'Constructor':
                this.add(`public ${this.context.currentClassName || 'Constructor'}(${node.params.map(p => `Object ${p.name}`).join(', ')}) {`);
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                break;
            case 'Print':
                this.add(`System.out.println(${this.genExpr(node.expression)});`);
                break;
            case 'If':
                this.add(`if (${this.genExpr(node.condition)}) {`);
                this.indent();
                node.thenBranch.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                if (node.elseBranch) {
                    this.add("} else {");
                    this.indent();
                    node.elseBranch.body.forEach(s => this.visitStatement(s as any));
                    this.dedent();
                }
                this.add("}");
                break;
            case 'Return':
                this.add(`return ${node.value ? this.genExpr(node.value) : ''};`);
                break;
            case 'ExpressionStatement':
                this.add(`${this.genExpr(node.expression)};`);
                break;
            case 'While':
                this.add(`while (${this.genExpr(node.condition)}) {`);
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                break;
            case 'For':
                this.add(`for (${node.variable} : ${this.genExpr(node.iterable)}) {`);
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                break;
            case 'MethodDeclaration' as any:
                const methodNode = node as any;
                const sig = this.context.functionSignatures.get(methodNode.name);
                const methodParams = methodNode.params.map((p: any, i: any) => {
                    const type = (p as any).paramType || sig?.paramTypes[i] || 'Object';
                    return `${type} ${p.name}`;
                }).join(', ');
                
                const returnType = methodNode.returnType || sig?.returnType || 'void';
                const access = methodNode.access || 'public';
                const isStatic = methodNode.isStatic ?? true;

                this.add(`${access} ${isStatic ? 'static ' : ''}${returnType} ${methodNode.name}(${methodParams}) {`);
                this.indent();
                
                const oldLocals = new Set(this.declaredLocals);
                this.declaredLocals.clear();
                methodNode.params.forEach((p: any) => this.declaredLocals.add(p.name));
                
                methodNode.body.body.forEach((s: any) => this.visitStatement(s as any));
                
                this.declaredLocals = oldLocals;
                this.dedent();
                this.add("}");
                break;
        }
    }

    private genExpr(expr: Expression): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'boolean') return String(expr.value);
                return typeof expr.value === 'string' ? `"${expr.value}"` : String(expr.value);
            case 'Identifier':
                return expr.name === 'self' ? 'this' : expr.name;
            case 'BinaryExpression':
                let op = expr.operator;
                if (op === 'and') op = '&&';
                if (op === 'or') op = '||';
                return `${this.genExpr(expr.left)} ${op} ${this.genExpr(expr.right)}`;
            case 'CallExpression':
                const callee = expr.callee;
                const calleeName = callee.type === 'Identifier' ? callee.name : this.genExpr(callee);
                const args = expr.arguments.map(a => this.genExpr(a)).join(', ');
                const isCtor = this.context.classNames.has(calleeName);
                return `${isCtor ? 'new ' : ''}${calleeName}(${args})`;
            case 'MemberExpression':
                return `${this.genExpr(expr.object)}.${expr.property.name}`;
            case 'UnaryExpression':
                const uOp = expr.operator === 'not' ? '!' : expr.operator;
                return `${uOp}${this.genExpr(expr.argument)}`;
            case 'ArrayLiteral':
                return `new Object[] {${expr.elements.map(e => this.genExpr(e)).join(', ')}}`;
            default: return "";
        }
    }
}

/** * PYTHON EMITTER */
class PythonEmitter extends BaseEmitter {
    emit(program: Program): string {
        this.output = [];
        program.body.forEach(s => this.visitStatement(s));
        return this.output.join('\n');
    }

    private visitStatement(node: Statement) {
        switch (node.type) {
            case 'ClassDeclaration':
                if (node.name === 'Main') {
                    node.body.forEach(member => {
                        if ((member.type === 'MethodDeclaration') && (member as any).name === 'main') {
                            (member as any).body.body.forEach((s: any) => this.visitStatement(s));
                        } else {
                            this.visitStatement(member as any);
                        }
                    });
                } else {
                    this.add(`class ${node.name}:`);
                    this.indent();
                    if (node.body.length === 0) this.add("pass");
                    else node.body.forEach(m => {
                        if (m.type === 'MethodDeclaration' || m.type === 'Constructor') {
                            this.visitStatement(m as any);
                        }
                    });
                    this.dedent();
                }
                break;
            case 'Constructor':
                this.add(`def __init__(self, ${node.params.map(p => p.name).join(', ')}):`);
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                break;
            case 'Assignment':
            case 'FieldDeclaration':
                const target = node.name.replace(/^unknown\./, "").replace(/^this\./, "self.");
                this.add(`${target} = ${this.genExpr(node.value! || (node as any).initializer)}`);
                break;
            case 'MethodDeclaration' as any:
                const isStatic = (node as any).isStatic;
                const params = isStatic ? (node as any).params.map((p: any) => p.name) : ['self', ...(node as any).params.map((p: any) => p.name)];
                this.add(`def ${(node as any).name}(${params.join(', ')}):`);
                this.indent();
                if ((node as any).body.body.length === 0) this.add("pass");
                else (node as any).body.body.forEach((s: any) => this.visitStatement(s as any));
                this.dedent();
                break;
            case 'Print':
                this.add(`print(${this.genExpr(node.expression)})`);
                break;
            case 'If':
                this.add(`if ${this.genExpr(node.condition)}:`);
                this.indent();
                node.thenBranch.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                if (node.elseBranch) {
                    this.add("else:");
                    this.indent();
                    node.elseBranch.body.forEach(s => this.visitStatement(s as any));
                    this.dedent();
                }
                break;
            case 'While':
                this.add(`while ${this.genExpr(node.condition)}:`);
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                break;
            case 'Return':
                this.add(`return ${node.value ? this.genExpr(node.value) : ''}`);
                break;
            case 'ExpressionStatement':
                this.add(this.genExpr(node.expression));
                break;
        }
    }

    private genExpr(expr: Expression): string {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'boolean') return expr.value ? 'True' : 'False';
                return typeof expr.value === 'string' ? `"${expr.value}"` : String(expr.value);
            case 'Identifier': return expr.name === 'this' ? 'self' : expr.name;
            case 'BinaryExpression': return `${this.genExpr(expr.left)} ${expr.operator} ${this.genExpr(expr.right)}`;
            case 'CallExpression':
                const callee = expr.callee;
                const calleeName = callee.type === 'Identifier' ? callee.name : this.genExpr(callee);
                return `${calleeName}(${expr.arguments.map(a => this.genExpr(a)).join(', ')})`;
            case 'MemberExpression': return `${this.genExpr(expr.object)}.${expr.property.name}`;
            case 'UnaryExpression':
                const pyUOp = expr.operator === 'not' ? 'not ' : expr.operator;
                return `${pyUOp}${this.genExpr(expr.argument)}`;
            case 'ArrayLiteral':
                return `[${expr.elements.map(e => this.genExpr(e)).join(', ')}]`;
            default: return "";
        }
    }
}

/** * CSP EMITTER */
class CSPEmitter extends BaseEmitter {
    emit(program: Program): string {
        this.output = [];
        program.body.forEach(s => this.visitStatement(s));
        return this.output.join('\n');
    }

    private visitStatement(node: Statement) {
        switch (node.type) {
            case 'ClassDeclaration':
                if (node.name === 'Main') {
                    node.body.forEach(member => {
                        if ((member.type === ('MethodDeclaration' as any)) && (member as any).name === 'main') {
                            (member as any).body.body.forEach((s: any) => this.visitStatement(s));
                        } else {
                            this.visitStatement(member as any);
                        }
                    });
                } else {
                    this.add(`// Class ${node.name}`);
                    node.body.forEach(m => {
                        if (m.type === 'MethodDeclaration' || m.type === 'Constructor') {
                            this.visitStatement(m as any);
                        }
                    });
                }
                break;
            case 'Assignment':
            case 'FieldDeclaration':
                const target = node.name.replace(/^unknown\./, "").replace(/^this\./, "").replace(/^self\./, "");
                this.add(`${target} <- ${this.genExpr(node.value! || (node as any).initializer)}`);
                break;
            case 'Print':
                this.add(`DISPLAY(${this.genExpr(node.expression)})`);
                break;
            case 'MethodDeclaration' as any:
            case 'Constructor':
                const name = node.type === 'Constructor' ? 'Init' : (node as any).name;
                this.add(`PROCEDURE ${name} (${(node as any).params.map((p: any) => p.name).join(', ')})`);
                this.add("{");
                this.indent();
                (node as any).body.body.forEach((s: any) => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                break;
            case 'If':
                this.add(`IF (${this.genExpr(node.condition)})`);
                this.add("{");
                this.indent();
                node.thenBranch.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                if (node.elseBranch) {
                    this.add("ELSE");
                    this.add("{");
                    this.indent();
                    node.elseBranch.body.forEach(s => this.visitStatement(s as any));
                    this.dedent();
                    this.add("}");
                }
                break;
            case 'While':
                this.add(`REPEAT UNTIL (NOT (${this.genExpr(node.condition)}))`);
                this.add("{");
                this.indent();
                node.body.body.forEach(s => this.visitStatement(s as any));
                this.dedent();
                this.add("}");
                break;
            case 'Return':
                this.add(`RETURN ${node.value ? this.genExpr(node.value) : ''}`);
                break;
            case 'ExpressionStatement':
                this.add(this.genExpr(node.expression));
                break;
        }
    }

    private genExpr(expr: Expression): string {
        switch (expr.type) {
            case 'Literal': return String(expr.value);
            case 'Identifier': return expr.name;
            case 'BinaryExpression':
                let op = expr.operator;
                if (op === '==') op = '=';
                if (op === '!=') op = '<>';
                if (op === 'and') op = 'AND';
                if (op === 'or') op = 'OR';
                if (op === '%') op = 'MOD';
                return `${this.genExpr(expr.left)} ${op} ${this.genExpr(expr.right)}`;
            case 'CallExpression':
                const callee = expr.callee;
                const calleeName = callee.type === 'Identifier' ? callee.name : this.genExpr(callee);
                return `${calleeName}(${expr.arguments.map(a => this.genExpr(a)).join(', ')})`;
            case 'UnaryExpression':
                const cspUOp = expr.operator === 'not' ? 'NOT ' : expr.operator;
                return `${cspUOp}${this.genExpr(expr.argument)}`;
            default: return "";
        }
    }
}