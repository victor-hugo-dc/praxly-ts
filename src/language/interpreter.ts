import type { Program, Statement, Expression, FunctionDeclaration, ClassDeclaration, MethodDeclaration, Constructor } from './ast';

class Environment {
    private values: Record<string, any> = {};
    private parent?: Environment;
    constructor(parent?: Environment) { this.parent = parent; }
    define(name: string, value: any) { this.values[name] = value; }
    assign(name: string, value: any) {
        if (name in this.values) { this.values[name] = value; return; }
        if (this.parent) { this.parent.assign(name, value); return; }
        throw new Error(`Undefined variable '${name}'`);
    }
    get(name: string): any {
        if (name in this.values) return this.values[name];
        if (this.parent) return this.parent.get(name);
        throw new Error(`Undefined variable '${name}'`);
    }
}

class ReturnException extends Error {
    value: any;
    constructor(value: any) { super("Return"); this.value = value; }
}

// OOP Classes
class JavaClass {
    name: string;
    methods: Map<string, MethodDeclaration> = new Map();
    ctorDecl: Constructor | undefined;
    fields: Map<string, any> = new Map();
    superClass?: JavaClass;

    constructor(name: string, superClass?: JavaClass) {
        this.name = name;
        this.superClass = superClass;
    }

    addMethod(method: MethodDeclaration) {
        this.methods.set(method.name, method);
    }

    setConstructor(ctor: Constructor) {
        this.ctorDecl = ctor;
    }

    getMethod(name: string): MethodDeclaration | undefined {
        if (this.methods.has(name)) return this.methods.get(name);
        if (this.superClass) return this.superClass.getMethod(name);
        return undefined;
    }
}

class JavaInstance {
    klass: JavaClass;
    fields: Map<string, any> = new Map();

    constructor(klass: JavaClass) {
        this.klass = klass;
    }

    getField(name: string): any {
        if (this.fields.has(name)) return this.fields.get(name);
        if (this.klass.fields.has(name)) return this.klass.fields.get(name);
        return null;
    }

    setField(name: string, value: any) {
        this.fields.set(name, value);
    }

    callMethod(methodName: string, args: any[], interpreter: Interpreter, env: Environment): any {
        const method = this.klass.getMethod(methodName);
        if (!method) throw new Error(`Undefined method '${methodName}'`);

        const methodEnv = new Environment(env);
        methodEnv.define('this', this);
        methodEnv.define('self', this);

        // Bind parameters, skipping 'self' if it's explicitly in the signature
        const actualParams = method.params.filter(p => p.name !== 'self' && p.name !== 'this');
        actualParams.forEach((param, i) => {
            methodEnv.define(param.name, args[i] || null);
        });

        try {
            interpreter.executeBlock(method.body.body, methodEnv);
        } catch (e) {
            if (e instanceof ReturnException) return e.value;
            throw e;
        }
        return null;
    }
}

export class Interpreter {
    private globalEnv = new Environment();
    private output: string[] = [];
    private classes: Map<string, JavaClass> = new Map();

    interpret(program: Program): string[] {
        this.output = [];
        this.globalEnv = new Environment();
        this.classes = new Map();

        // Register built-ins
        this.globalEnv.define('str', (args: any[]) => this.stringify(args[0]));
        this.globalEnv.define('print', (args: any[]) => {
            const val = args.length > 0 ? args[0] : null;
            this.output.push(this.stringify(val));
            return null;
        });

        try {
            // Pass 1: Register classes
            for (const stmt of program.body) {
                if (stmt.type === 'ClassDeclaration') {
                    this.registerClass(stmt);
                }
            }

            // Pass 2: Execute global statements
            const nonClassStatements = program.body.filter(stmt => stmt.type !== 'ClassDeclaration');
            this.executeBlock(nonClassStatements, this.globalEnv);

            // Pass 3: Main entry point
            if (this.classes.has('Main')) {
                const mainClass = this.classes.get('Main')!;
                const mainMethod = mainClass.getMethod('main');
                if (mainMethod) {
                    const mainInstance = new JavaInstance(mainClass);
                    mainInstance.callMethod('main', [], this, this.globalEnv);
                }
            }
        } catch (e: any) {
            this.output.push(`Runtime Error: ${e.message}`);
        }
        return this.output;
    }

    private registerClass(classDecl: ClassDeclaration) {
        const javaClass = new JavaClass(classDecl.name);
        for (const member of classDecl.body) {
            if (member.type === 'MethodDeclaration') {
                javaClass.addMethod(member);
            } else if (member.type === 'Constructor') {
                javaClass.setConstructor(member);
            } else if (member.type === 'FieldDeclaration') {
                javaClass.fields.set(member.name, member.initializer ? this.evaluate(member.initializer, this.globalEnv) : null);
            }
        }
        this.classes.set(classDecl.name, javaClass);
        this.globalEnv.define(classDecl.name, javaClass);
    }

    executeBlock(statements: Statement[], env: Environment) {
        for (const stmt of statements) {
            this.execute(stmt, env);
        }
    }

    private execute(stmt: Statement, env: Environment) {
        switch (stmt.type) {
            case 'ClassDeclaration': break;
            case 'Print':
                this.output.push(this.stringify(this.evaluate(stmt.expression, env)));
                break;
            case 'Assignment':
                const value = this.evaluate(stmt.value, env);
                // Fix: Handle "unknown." prefix and resolve fields correctly
                const cleanName = stmt.name.replace(/^unknown\./, "");
                if (cleanName.includes('.')) {
                    const parts = cleanName.split('.');
                    const objName = parts[0];
                    const fieldName = parts.slice(1).join('.');
                    const obj = env.get(objName);
                    if (obj instanceof JavaInstance) {
                        obj.setField(fieldName, value);
                    } else {
                        throw new Error(`Cannot assign field '${fieldName}' on non-object`);
                    }
                } else {
                    env.define(cleanName, value);
                }
                break;
            case 'If':
                if (this.evaluate(stmt.condition, env)) {
                    this.executeBlock(stmt.thenBranch.body, env);
                } else if (stmt.elseBranch) {
                    this.executeBlock(stmt.elseBranch.body, env);
                }
                break;
            case 'While':
                while (this.evaluate(stmt.condition, env)) { this.executeBlock(stmt.body.body, env); }
                break;
            case 'For':
                const iterable = this.evaluate(stmt.iterable, env);
                if (!Array.isArray(iterable) && typeof iterable !== 'string') throw new Error("Loop target must be array or string");
                for (const item of iterable) {
                    env.define(stmt.variable, item);
                    this.executeBlock(stmt.body.body, env);
                }
                break;
            // case 'FunctionDeclaration':
            //     env.define(stmt.name, stmt);
            //     break;
            case 'Return':
                throw new ReturnException(stmt.value ? this.evaluate(stmt.value, env) : null);
            case 'ExpressionStatement':
                this.evaluate(stmt.expression, env);
                break;
        }
    }

    evaluate(expr: Expression, env: Environment): any {
        switch (expr.type) {
            case 'Literal': return expr.value;
            case 'Identifier':
                return env.get(expr.name);
            // case 'ThisExpression':
            //     try { return env.get('this'); } catch { return env.get('self'); }
            case 'BinaryExpression':
                const l = this.evaluate(expr.left, env);
                const r = this.evaluate(expr.right, env);
                switch (expr.operator) {
                    case '+': return l + r;
                    case '-': return l - r;
                    case '*': return l * r;
                    case '/': return l / r;
                    case '==': return l === r;
                    case '!=': return l !== r;
                    case '>': return l > r;
                    case '<': return l < r;
                    case 'and': return l && r;
                    case 'or': return l || r;
                    default: return null;
                }
            // case 'NewExpression':
            //     const klass = env.get(expr.className);
            //     if (!(klass instanceof JavaClass)) throw new Error(`Class ${expr.className} not found`);
            //     const inst = new JavaInstance(klass);
            //     const args = expr.arguments.map(a => this.evaluate(a, env));
            //     if (klass.ctorDecl) {
            //         const cEnv = new Environment(env);
            //         cEnv.define('this', inst);
            //         cEnv.define('self', inst);
            //         klass.ctorDecl.params.filter(p => p.name !== 'self').forEach((p, i) => cEnv.define(p.name, args[i]));
            //         try { this.executeBlock(klass.ctorDecl.body.body, cEnv); } catch (e) { if (!(e instanceof ReturnException)) throw e; }
            //     }
            //     return inst;
            case 'MemberExpression':
                const obj = this.evaluate(expr.object, env);
                if (obj instanceof JavaInstance) return obj.getField(expr.property.name);
                throw new Error("Member access on non-object");
            case 'CallExpression':
                const argsEval = expr.arguments.map(a => this.evaluate(a, env));
                if ((expr.callee as any).type === 'MemberExpression') {
                    const m = expr.callee as any;
                    const o = this.evaluate(m.object, env);
                    if (o instanceof JavaInstance) return o.callMethod(m.property.name, argsEval, this, env);
                }
                const fnName = (expr.callee as any).name;
                const fn = env.get(fnName);
                if (typeof fn === 'function') return fn(argsEval);
                if (fn && fn.type === 'FunctionDeclaration') {
                    const fEnv = new Environment(env);
                    fn.params.forEach((p: any, i: number) => fEnv.define(p.name, argsEval[i]));
                    try { this.executeBlock(fn.body.body, fEnv); } catch (e) { if (e instanceof ReturnException) return e.value; throw e; }
                }
                return null;
            case 'StringFormatNode' as any:
                const node = expr as any;
                return node.parts.map((p: any) => typeof p === 'string' ? p : this.stringify(this.evaluate(p, env))).join('');
        }
        return null;
    }

    private stringify(val: any): string {
        if (val === null) return 'None';
        if (typeof val === 'boolean') return val ? 'True' : 'False';
        if (val instanceof JavaClass) {
            return `<class '${val.name}'>`;
        }
        if (val instanceof JavaInstance) {
            const m = val.klass.getMethod('str') || val.klass.getMethod('__str__');
            if (m) {
                const result = val.callMethod(m.name, [], this, this.globalEnv);
                return this.stringify(result);
            }
            return `<${val.klass.name} object at ${Math.random().toString(16).slice(2, 10)}>`;
        }
        if (Array.isArray(val)) return `[${val.map(v => this.stringify(v)).join(', ')}]`;
        return String(val);
    }
}