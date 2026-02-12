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
        // Check class fields
        if (this.klass.fields.has(name)) return this.klass.fields.get(name);
        throw new Error(`Undefined field '${name}'`);
    }

    setField(name: string, value: any) {
        this.fields.set(name, value);
    }

    callMethod(methodName: string, args: any[], interpreter: Interpreter, env: Environment): any {
        const method = this.klass.getMethod(methodName);
        if (!method) throw new Error(`Undefined method '${methodName}'`);

        const methodEnv = new Environment(env);
        methodEnv.define('this', this);
        methodEnv.define('self', this); // Python compatibility

        // Bind parameters
        method.params.forEach((param, i) => {
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

        try {
            // First pass: register all classes
            for (const stmt of program.body) {
                if (stmt.type === 'ClassDeclaration') {
                    this.registerClass(stmt);
                }
            }

            // Second pass: execute all non-class statements
            const nonClassStatements = program.body.filter(stmt => stmt.type !== 'ClassDeclaration');
            this.executeBlock(nonClassStatements, this.globalEnv);

            // Third pass: if there's a Main class, execute its main() method
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

        // Register methods
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
            case 'ClassDeclaration':
                // Classes are registered in first pass
                break;
            case 'Print':
                const val = this.evaluate(stmt.expression, env);
                this.output.push(this.stringify(val));
                break;
            case 'Assignment':
                const value = this.evaluate(stmt.value, env);
                if (stmt.name.includes('.')) {
                    // Handle member assignment (e.g., self.x = 10)
                    const parts = stmt.name.split('.');
                    const objName = parts[0];
                    const fieldName = parts.slice(1).join('.');
                    const obj = env.get(objName);
                    if (obj instanceof JavaInstance) {
                        obj.setField(fieldName, value);
                    } else {
                        throw new Error(`Cannot assign to field on non-object`);
                    }
                } else {
                    // Handle simple variable assignment
                    env.define(stmt.name, value);
                }
                break;
            case 'If':
                const truthy = this.evaluate(stmt.condition, env);
                if (truthy) { this.executeBlock(stmt.thenBranch.body, env); }
                else if (stmt.elseBranch) { this.executeBlock(stmt.elseBranch.body, env); }
                break;
            case 'While':
                while (this.evaluate(stmt.condition, env)) { this.executeBlock(stmt.body.body, env); }
                break;
            case 'For':
                const iterable = this.evaluate(stmt.iterable, env);
                if (!Array.isArray(iterable) && typeof iterable !== 'string') throw new Error("For loop requires array or string");
                for (const item of iterable) {
                    env.define(stmt.variable, item);
                    this.executeBlock(stmt.body.body, env);
                }
                break;
            case 'FunctionDeclaration':
                env.define(stmt.name, stmt);
                break;
            case 'Return':
                const retVal = stmt.value ? this.evaluate(stmt.value, env) : null;
                throw new ReturnException(retVal);
            case 'ExpressionStatement':
                this.evaluate(stmt.expression, env);
                break;
        }
    }

    evaluate(expr: Expression, env: Environment): any {
        switch (expr.type) {
            case 'Literal':
                return expr.value;
            case 'ArrayLiteral':
                return expr.elements.map(e => this.evaluate(e, env));
            case 'Identifier':
                return env.get(expr.name);
            case 'ThisExpression':
                // Support both 'this' (Java) and 'self' (Python)
                try {
                    return env.get('this');
                } catch {
                    return env.get('self');
                }
            case 'UnaryExpression':
                const right = this.evaluate(expr.argument, env);
                if (expr.operator === '-') return -right;
                if (expr.operator === '!' || expr.operator === 'not') return !right;
                break;
            case 'BinaryExpression':
                const l = this.evaluate(expr.left, env);
                const r = this.evaluate(expr.right, env);
                switch (expr.operator) {
                    case '+': return l + r;
                    case '-': return l - r;
                    case '*': return l * r;
                    case '/': return l / r;
                    case '%': return l % r;
                    case '>': return l > r;
                    case '<': return l < r;
                    case '>=': return l >= r;
                    case '<=': return l <= r;
                    case '==': return l === r;
                    case '!=': return l !== r;
                    case 'and': return l && r;
                    case 'or': return l || r;
                    default: throw new Error(`Unknown operator ${expr.operator}`);
                }
                break;
            case 'NewExpression':
                const klass = env.get(expr.className);
                if (!klass || !(klass instanceof JavaClass)) {
                    throw new Error(`Undefined class '${expr.className}'`);
                }
                const instance = new JavaInstance(klass);
                const args = expr.arguments.map(a => this.evaluate(a, env));

                // Call constructor if it exists
                if (klass.ctorDecl) {
                    const ctorEnv = new Environment(env);
                    ctorEnv.define('this', instance);
                    ctorEnv.define('self', instance); // Python compatibility
                    klass.ctorDecl.params.forEach((param, i) => {
                        ctorEnv.define(param.name, args[i] || null);
                    });
                    try {
                        this.executeBlock(klass.ctorDecl.body.body, ctorEnv);
                    } catch (e) {
                        if (!(e instanceof ReturnException)) throw e;
                    }
                }

                return instance;

            case 'MemberExpression':
                const obj = this.evaluate(expr.object, env);
                if (obj instanceof JavaInstance) {
                    return obj.getField(expr.property.name);
                }
                throw new Error(`Cannot access member on non-object`);

            case 'CallExpression':
                // Handle method calls (obj.method())
                if ((expr.callee as any).type === 'MemberExpression') {
                    const memberExpr = expr.callee as any;
                    const obj = this.evaluate(memberExpr.object, env);
                    const methodName = memberExpr.property.name;
                    const args = expr.arguments.map(a => this.evaluate(a, env));

                    if (obj instanceof JavaInstance) {
                        return obj.callMethod(methodName, args, this, env);
                    }
                    throw new Error(`Cannot call method on non-object`);
                }

                // Handle function calls
                const callee = env.get((expr.callee as any).name);
                if (callee && callee.type === 'FunctionDeclaration') {
                    const func = callee as FunctionDeclaration;
                    const args = expr.arguments.map(a => this.evaluate(a, env));
                    if (args.length !== func.params.length) throw new Error(`Expected ${func.params.length} arguments but got ${args.length}`);
                    const fnEnv = new Environment(env);
                    func.params.forEach((param, i) => fnEnv.define(param.name, args[i]));
                    try { this.executeBlock(func.body.body, fnEnv); }
                    catch (e) { if (e instanceof ReturnException) return e.value; throw e; }
                    return null;
                }
                throw new Error(`Undefined function ${(expr.callee as any).name}`);
        }
    }

    private stringify(val: any): string {
        if (val === null) return 'None';
        if (val === true) return 'True';
        if (val === false) return 'False';
        if (val instanceof JavaInstance) return `${val.klass.name} instance`;
        if (Array.isArray(val)) return `[${val.map(v => this.stringify(v)).join(', ')}]`;
        return String(val);
    }
}