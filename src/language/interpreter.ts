import type { Program, Statement, Expression, FunctionDeclaration } from './ast';

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

export class Interpreter {
    private globalEnv = new Environment();
    private output: string[] = [];

    interpret(program: Program): string[] {
        this.output = [];
        this.globalEnv = new Environment();
        try {
            this.executeBlock(program.body, this.globalEnv);
        } catch (e: any) {
            this.output.push(`Runtime Error: ${e.message}`);
        }
        return this.output;
    }

    private execute(stmt: Statement, env: Environment) {
        switch (stmt.type) {
            case 'Print':
                const val = this.evaluate(stmt.expression, env);
                this.output.push(this.stringify(val));
                break;
            case 'Assignment':
                env.define(stmt.name, this.evaluate(stmt.value, env));
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

    private executeBlock(statements: Statement[], env: Environment) {
        for (const stmt of statements) { this.execute(stmt, env); }
    }

    private evaluate(expr: Expression, env: Environment): any {
        switch (expr.type) {
            case 'Literal': return expr.value;
            case 'ArrayLiteral': return expr.elements.map(e => this.evaluate(e, env));
            case 'Identifier': return env.get(expr.name);
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
            case 'CallExpression':
                const callee = env.get(expr.callee.name);
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
                throw new Error(`Undefined function ${expr.callee.name}`);
        }
    }

    private stringify(val: any): string {
        if (val === null) return 'None';
        if (val === true) return 'True';
        if (val === false) return 'False';
        if (Array.isArray(val)) return `[${val.map(v => this.stringify(v)).join(', ')}]`;
        return String(val);
    }
}