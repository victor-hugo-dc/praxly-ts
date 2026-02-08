import type { Token, TokenType } from '../lexer';
import { type Program, type Statement, type Block, type Expression, type If, type While, type For, type Return, type CallExpression, type Identifier, type ClassDeclaration, type FieldDeclaration, type Constructor, type MethodDeclaration, type Parameter, type AccessModifier, generateId } from '../ast';

export class JavaParser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): Program {
        const body: Statement[] = [];
        while (!this.isAtEnd()) {
            body.push(this.topLevelDeclaration());
        }
        return { id: generateId(), type: 'Program', body };
    }

    private topLevelDeclaration(): Statement {
        // Handle class declarations
        if (this.check('KEYWORD', 'public', 'private', 'protected') || this.checkPeekAhead('KEYWORD', 'class', 2)) {
            return this.classDeclaration();
        }
        // Handle regular statements for non-class programs
        return this.statement();
    }

    private classDeclaration(): ClassDeclaration {
        this.parseAccessModifier(); // consume access modifier but typically classes are public
        this.consume('KEYWORD', 'class');
        const name = this.consume('IDENTIFIER').value;

        let superClass: Identifier | undefined = undefined;
        if (this.match('KEYWORD', 'extends')) {
            superClass = { id: generateId(), type: 'Identifier', name: this.consume('IDENTIFIER').value };
        }

        this.consume('PUNCTUATION', '{');
        const body: (FieldDeclaration | Constructor | MethodDeclaration)[] = [];

        while (!this.check('PUNCTUATION', '}') && !this.isAtEnd()) {
            body.push(this.classBodyDeclaration());
        }

        this.consume('PUNCTUATION', '}');
        return { id: generateId(), type: 'ClassDeclaration', name, superClass, body };
    }

    private classBodyDeclaration(): FieldDeclaration | Constructor | MethodDeclaration {
        const access = this.parseAccessModifier();
        const isStatic = this.match('KEYWORD', 'static');
        this.match('KEYWORD', 'final'); // consume but don't need to track

        // Constructor: className (params) { ... }
        if (this.check('IDENTIFIER') && this.peek().value === this.previous().value) {
            return this.constructorDeclaration(access);
        }

        // Check if it's a method or field
        // Accept type keywords (String, int, etc) or identifier types
        let typeString: string;
        if (this.isTypeStart()) {
            typeString = this.peek().value;
            this.advance();
        } else if (this.check('IDENTIFIER')) {
            typeString = this.peek().value;
            this.advance();
        } else {
            throw new Error("Expected type in class member declaration");
        }

        const name = this.consume('IDENTIFIER').value;

        if (this.check('PUNCTUATION', '(')) {
            // It's a method
            return this.methodDeclaration(name, access, isStatic, typeString);
        } else {
            // It's a field
            let initializer: Expression | undefined = undefined;
            if (this.match('OPERATOR', '=')) {
                initializer = this.expression();
            }
            this.consume('PUNCTUATION', ';');
            return { id: generateId(), type: 'FieldDeclaration', name, fieldType: typeString, isStatic, access, initializer };
        }

        throw new Error("Expected class member declaration");
    }

    private constructorDeclaration(access: AccessModifier): Constructor {
        this.consume('IDENTIFIER'); // consume class name 
        this.consume('PUNCTUATION', '(');
        const params = this.parseParameters();
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'Constructor', access, params, body };
    }

    private methodDeclaration(name: string, access: AccessModifier, isStatic: boolean, returnType: string): MethodDeclaration {
        this.consume('PUNCTUATION', '(');
        const params = this.parseParameters();
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'MethodDeclaration', name, access, isStatic, returnType, params, body };
    }

    private parseParameters(): Parameter[] {
        const params: Parameter[] = [];
        if (!this.check('PUNCTUATION', ')')) {
            do {
                // Accept both KEYWORD types (String, int, etc) and IDENTIFIER types
                let paramType: string;
                if (this.isTypeStart()) {
                    paramType = this.peek().value;
                    this.advance();
                } else {
                    paramType = this.consume('IDENTIFIER').value;
                }
                // Handle array types (e.g., String[])
                while (this.match('PUNCTUATION', '[')) {
                    this.consume('PUNCTUATION', ']');
                    paramType += '[]';
                }
                const paramName = this.consume('IDENTIFIER').value;
                params.push({ id: generateId(), type: 'Parameter', name: paramName, paramType });
            } while (this.match('PUNCTUATION', ','));
        }
        return params;
    }

    private parseAccessModifier(): AccessModifier {
        if (this.match('KEYWORD', 'public')) return 'public';
        if (this.match('KEYWORD', 'private')) return 'private';
        if (this.match('KEYWORD', 'protected')) return 'protected';
        return 'public'; // default access
    }

    private checkPeekAhead(type: TokenType, value: string, distance: number): boolean {
        if (this.current + distance >= this.tokens.length) return false;
        const token = this.tokens[this.current + distance];
        return token.type === type && token.value === value;
    }

    private block(): Block {
        this.consume('PUNCTUATION', '{');
        const statements: Statement[] = [];
        while (!this.check('PUNCTUATION', '}') && !this.isAtEnd()) {
            statements.push(this.statement());
        }
        this.consume('PUNCTUATION', '}');
        return { id: generateId(), type: 'Block', body: statements };
    }

    private statement(): Statement {
        if (this.check('KEYWORD', 'if')) return this.ifStatement();
        if (this.check('KEYWORD', 'while')) return this.whileStatement();
        if (this.check('KEYWORD', 'for')) return this.forStatement();
        if (this.check('KEYWORD', 'return')) return this.returnStatement();

        // Fix: System is now an IDENTIFIER in Lexer
        if (this.check('IDENTIFIER', 'System')) return this.printStatement();

        if (this.isTypeStart()) {
            this.advance();
            // Handle array types (e.g., String[] arr)
            while (this.check('PUNCTUATION', '[')) { this.advance(); this.consume('PUNCTUATION', ']'); }

            const name = this.consume('IDENTIFIER').value;
            let value: Expression = { id: generateId(), type: 'Literal', value: null, raw: 'null' };

            if (this.match('OPERATOR', '=')) {
                value = this.expression();
            }
            this.consume('PUNCTUATION', ';');
            return { id: generateId(), type: 'Assignment', name, value };
        }

        if (this.check('IDENTIFIER')) {
            if (this.checkNext('OPERATOR', '=')) {
                const name = this.consume('IDENTIFIER').value;
                this.consume('OPERATOR', '=');
                const value = this.expression();
                this.consume('PUNCTUATION', ';');
                return { id: generateId(), type: 'Assignment', name, value };
            }
            else if (this.checkNext('IDENTIFIER')) {
                this.advance();
                if (this.check('PUNCTUATION', '[')) { this.advance(); this.consume('PUNCTUATION', ']'); }
                const name = this.consume('IDENTIFIER').value;
                let value: Expression = { id: generateId(), type: 'Literal', value: null, raw: 'null' };
                if (this.match('OPERATOR', '=')) {
                    value = this.expression();
                }
                this.consume('PUNCTUATION', ';');
                return { id: generateId(), type: 'Assignment', name, value };
            }
        }

        const expr = this.expression();
        this.consume('PUNCTUATION', ';');
        return { id: generateId(), type: 'ExpressionStatement', expression: expr };
    }

    private isTypeStart(): boolean {
        const token = this.peek();
        const types = ['int', 'double', 'boolean', 'String', 'var', 'char', 'float', 'long', 'void', 'Object'];
        return types.includes(token.value);
    }

    private printStatement(): Statement {
        // Fix: Consume IDENTIFIER 'System'
        this.consume('IDENTIFIER', 'System');
        this.consume('PUNCTUATION', '.');
        this.consume('IDENTIFIER', 'out');
        this.consume('PUNCTUATION', '.');
        this.consume('IDENTIFIER', 'println');
        this.consume('PUNCTUATION', '(');
        const expr = this.expression();
        this.consume('PUNCTUATION', ')');
        this.consume('PUNCTUATION', ';');
        return { id: generateId(), type: 'Print', expression: expr };
    }

    private ifStatement(): If {
        this.consume('KEYWORD', 'if');
        this.consume('PUNCTUATION', '(');
        const condition = this.expression();
        this.consume('PUNCTUATION', ')');
        const thenBranch = this.block();
        let elseBranch: Block | undefined = undefined;
        if (this.match('KEYWORD', 'else')) {
            elseBranch = this.block();
        }
        return { id: generateId(), type: 'If', condition, thenBranch, elseBranch };
    }

    private whileStatement(): While {
        this.consume('KEYWORD', 'while');
        this.consume('PUNCTUATION', '(');
        const condition = this.expression();
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'While', condition, body };
    }

    private forStatement(): For {
        this.consume('KEYWORD', 'for');
        this.consume('PUNCTUATION', '(');
        this.advance();
        const variable = this.consume('IDENTIFIER').value;
        this.consume('PUNCTUATION', ':');
        const iterable = this.expression();
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'For', variable, iterable, body };
    }

    private returnStatement(): Return {
        this.consume('KEYWORD', 'return');
        let value: Expression | undefined = undefined;
        if (!this.check('PUNCTUATION', ';')) value = this.expression();
        this.consume('PUNCTUATION', ';');
        return { id: generateId(), type: 'Return', value };
    }

    private expression(): Expression { return this.logicOr(); }

    private logicOr(): Expression {
        let left = this.logicAnd();
        while (this.match('OPERATOR', '||')) {
            const right = this.logicAnd();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: 'or', right };
        }
        return left;
    }

    private logicAnd(): Expression {
        let left = this.equality();
        while (this.match('OPERATOR', '&&')) {
            const right = this.equality();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: 'and', right };
        }
        return left;
    }

    private equality(): Expression {
        let left = this.comparison();
        while (this.match('OPERATOR', '==', '!=')) {
            const operator = this.previous().value;
            const right = this.comparison();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        return left;
    }

    private comparison(): Expression {
        let left = this.term();
        while (this.match('OPERATOR', '>', '>=', '<', '<=')) {
            const operator = this.previous().value;
            const right = this.term();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        return left;
    }

    private term(): Expression {
        let left = this.factor();
        while (this.match('OPERATOR', '+', '-')) {
            const operator = this.previous().value;
            const right = this.factor();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        return left;
    }

    private factor(): Expression {
        let left = this.unary();
        while (this.match('OPERATOR', '*', '/', '%')) {
            const operator = this.previous().value;
            const right = this.unary();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        return left;
    }

    private unary(): Expression {
        if (this.match('OPERATOR', '!', '-')) {
            let operator = this.previous().value;
            if (operator === '!') operator = 'not';
            const right = this.unary();
            return { id: generateId(), type: 'UnaryExpression', operator, argument: right };
        }
        if (this.match('KEYWORD', 'new')) {
            return this.newExpression();
        }
        return this.postfix();
    }

    private newExpression(): Expression {
        const className = this.consume('IDENTIFIER').value;
        this.consume('PUNCTUATION', '(');
        const args: Expression[] = [];
        if (!this.check('PUNCTUATION', ')')) {
            do { args.push(this.expression()); } while (this.match('PUNCTUATION', ','));
        }
        this.consume('PUNCTUATION', ')');
        return { id: generateId(), type: 'NewExpression', className, arguments: args };
    }

    private postfix(): Expression {
        let expr = this.call();
        while (this.match('PUNCTUATION', '.')) {
            const property = this.consume('IDENTIFIER').value;
            if (this.check('PUNCTUATION', '(')) {
                // Method call: obj.method(args)
                this.advance();
                const args: Expression[] = [];
                if (!this.check('PUNCTUATION', ')')) {
                    do { args.push(this.expression()); } while (this.match('PUNCTUATION', ','));
                }
                this.consume('PUNCTUATION', ')');
                expr = {
                    id: generateId(),
                    type: 'CallExpression',
                    callee: { id: generateId(), type: 'Identifier', name: property },
                    arguments: args
                };
            } else {
                // Field access: obj.field
                expr = {
                    id: generateId(),
                    type: 'MemberExpression',
                    object: expr,
                    property: { id: generateId(), type: 'Identifier', name: property },
                    isMethod: false
                };
            }
        }
        return expr;
    }

    private finishCall(callee: Expression): CallExpression {
        if (callee.type !== 'Identifier') throw new Error("Can only call identifiers");
        const args: Expression[] = [];
        if (!this.check('PUNCTUATION', ')')) {
            do { args.push(this.expression()); } while (this.match('PUNCTUATION', ','));
        }
        this.consume('PUNCTUATION', ')');
        return { id: generateId(), type: 'CallExpression', callee: callee as Identifier, arguments: args };
    }

    private primary(): Expression {
        if (this.match('NUMBER')) return { id: generateId(), type: 'Literal', value: parseFloat(this.previous().value), raw: this.previous().value };
        if (this.match('STRING')) return { id: generateId(), type: 'Literal', value: this.previous().value, raw: `"${this.previous().value}"` };
        if (this.match('BOOLEAN')) return { id: generateId(), type: 'Literal', value: this.previous().value === 'true', raw: this.previous().value };
        if (this.match('KEYWORD', 'null')) return { id: generateId(), type: 'Literal', value: null, raw: 'null' };
        if (this.match('KEYWORD', 'this')) return { id: generateId(), type: 'ThisExpression' };
        if (this.match('IDENTIFIER')) return { id: generateId(), type: 'Identifier', name: this.previous().value };
        if (this.match('PUNCTUATION', '(')) {
            const expr = this.expression();
            this.consume('PUNCTUATION', ')');
            return expr;
        }
        throw new Error(`Expect expression. Found ${this.peek().value}`);
    }

    private call(): Expression {
        let expr = this.primary();
        while (this.match('PUNCTUATION', '(')) {
            expr = this.finishCall(expr);
        }
        return expr;
    }

    private match(type: TokenType, ...values: string[]): boolean {
        if (this.check(type, ...values)) { this.advance(); return true; }
        return false;
    }
    private check(type: TokenType, ...values: string[]): boolean {
        if (this.isAtEnd()) return false;
        const token = this.peek();
        if (token.type !== type) return false;
        if (values.length > 0 && !values.includes(token.value)) return false;
        return true;
    }
    private checkNext(type: TokenType, value?: string): boolean {
        if (this.current + 1 >= this.tokens.length) return false;
        const token = this.tokens[this.current + 1];
        if (token.type !== type) return false;
        if (value && token.value !== value) return false;
        return true;
    }
    private consume(type: TokenType, value?: string): Token {
        if (this.check(type, ...(value ? [value] : []))) return this.advance();
        const found = this.peek();
        throw new Error(`Expected token ${type} ${value || ''} but found ${found.type} '${found.value}' at position ${found.start}`);
    }
    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }
    private isAtEnd(): boolean { return this.peek().type === 'EOF'; }
    private peek(): Token { return this.tokens[this.current]; }
    private previous(): Token { return this.tokens[this.current - 1]; }
}