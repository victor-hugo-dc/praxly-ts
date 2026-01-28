import type { Token, TokenType } from '../lexer';
import { type Program, type Statement, type Block, type Expression, type Assignment, type If, type While, type For, type FunctionDeclaration, type Return, type CallExpression, type Identifier, type ExpressionStatement, generateId } from '../ast';

export class JavaParser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): Program {
        if (this.check('KEYWORD', 'public') && this.checkNext('KEYWORD', 'class')) {
            this.consume('KEYWORD', 'public');
            this.consume('KEYWORD', 'class');
            this.consume('IDENTIFIER');
            this.consume('PUNCTUATION', '{');

            const body: Statement[] = [];

            while (!this.check('PUNCTUATION', '}') && !this.isAtEnd()) {
                this.parseClassMember(body);
            }

            if (this.check('PUNCTUATION', '}')) this.consume('PUNCTUATION', '}');
            return { id: generateId(), type: 'Program', body };
        } else {
            const body: Statement[] = [];
            while (!this.isAtEnd()) {
                if (this.looksLikeMethod()) {
                    this.parseClassMember(body);
                } else {
                    body.push(this.statement());
                }
            }
            return { id: generateId(), type: 'Program', body };
        }
    }

    private parseClassMember(body: Statement[]) {
        while (this.match('KEYWORD', 'public') || this.match('KEYWORD', 'static') || this.match('KEYWORD', 'private')) {
        }

        if (this.check('KEYWORD') || this.check('IDENTIFIER')) this.advance();

        const nameToken = this.consume('IDENTIFIER');
        const name = nameToken.value;

        if (this.check('PUNCTUATION', '(')) {
            this.consume('PUNCTUATION', '(');
            const params: Identifier[] = [];
            if (!this.check('PUNCTUATION', ')')) {
                do {
                    if (this.check('KEYWORD') || this.check('IDENTIFIER')) this.advance();
                    if (this.check('PUNCTUATION', '[')) { this.advance(); this.consume('PUNCTUATION', ']'); }

                    const pName = this.consume('IDENTIFIER').value;
                    params.push({ id: generateId(), type: 'Identifier', name: pName });
                } while (this.match('PUNCTUATION', ','));
            }
            this.consume('PUNCTUATION', ')');

            const methodBlock = this.block();

            if (name === 'main') {
                body.push(...methodBlock.body);
            } else {
                body.push({
                    id: generateId(),
                    type: 'FunctionDeclaration',
                    name,
                    params,
                    body: methodBlock
                });
            }
        } else {
            let value: Expression = { id: generateId(), type: 'Literal', value: null, raw: 'null' };
            if (this.match('OPERATOR', '=')) {
                value = this.expression();
            }
            this.consume('PUNCTUATION', ';');
            body.push({ id: generateId(), type: 'Assignment', name, value });
        }
    }

    private looksLikeMethod(): boolean {
        const start = this.current;
        let isMethod = false;
        try {
            while (this.check('KEYWORD', 'public', 'static', 'private')) this.advance();
            if (this.check('KEYWORD') || this.check('IDENTIFIER')) this.advance();
            if (this.check('IDENTIFIER')) {
                this.advance();
                if (this.check('PUNCTUATION', '(')) isMethod = true;
            }
        } catch (e) { isMethod = false; }
        this.current = start;
        return isMethod;
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
            if (this.check('PUNCTUATION', '[')) { this.advance(); this.consume('PUNCTUATION', ']'); }

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
        return this.call();
    }

    private call(): Expression {
        let expr = this.primary();
        while (true) {
            if (this.match('PUNCTUATION', '(')) expr = this.finishCall(expr);
            else break;
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
        if (this.match('IDENTIFIER')) return { id: generateId(), type: 'Identifier', name: this.previous().value };
        if (this.match('KEYWORD', 'new')) {
            this.advance();
            this.consume('PUNCTUATION', '[');
            this.consume('PUNCTUATION', ']');
            this.consume('PUNCTUATION', '{');
            const elements: Expression[] = [];
            if (!this.check('PUNCTUATION', '}')) {
                do { elements.push(this.expression()); } while (this.match('PUNCTUATION', ','));
            }
            this.consume('PUNCTUATION', '}');
            return { id: generateId(), type: 'ArrayLiteral', elements };
        }
        if (this.match('PUNCTUATION', '(')) {
            const expr = this.expression();
            this.consume('PUNCTUATION', ')');
            return expr;
        }
        throw new Error(`Expect expression. Found ${this.peek().value}`);
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