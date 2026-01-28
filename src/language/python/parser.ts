import type { Token, TokenType } from '../lexer';
import {
    type Program, type Statement, type Block, type Expression, type Print, type Assignment, type If, type While, type For,
    type FunctionDeclaration, type Return, type CallExpression, type Identifier,
    generateId
} from '../ast';

export class Parser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): Program {
        const body: Statement[] = [];
        while (!this.isAtEnd()) {
            if (this.check('NEWLINE')) { this.advance(); continue; }
            body.push(this.statement());
        }
        return { id: generateId(), type: 'Program', body };
    }

    private statement(): Statement {
        if (this.check('KEYWORD', 'print')) return this.printStatement();
        if (this.check('KEYWORD', 'if')) return this.ifStatement();
        if (this.check('KEYWORD', 'while')) return this.whileStatement();
        if (this.check('KEYWORD', 'for')) return this.forStatement();
        if (this.check('KEYWORD', 'def')) return this.functionDeclaration();
        if (this.check('KEYWORD', 'return')) return this.returnStatement();
        if (this.check('IDENTIFIER') && this.checkNext('OPERATOR', '=')) return this.assignment();

        // Handle standalone expressions (like function calls)
        const expr = this.expression();
        if (this.check('NEWLINE')) this.advance();
        return { id: generateId(), type: 'ExpressionStatement', expression: expr };
    }

    private block(): Block {
        this.consume('PUNCTUATION', ':');
        this.consume('NEWLINE');
        this.consume('INDENT');
        const statements: Statement[] = [];
        while (!this.check('DEDENT') && !this.isAtEnd()) {
            if (this.check('NEWLINE')) { this.advance(); continue; }
            statements.push(this.statement());
        }
        this.consume('DEDENT');
        return { id: generateId(), type: 'Block', body: statements };
    }

    private printStatement(): Print {
        this.consume('KEYWORD', 'print');
        if (this.check('PUNCTUATION', '(')) this.advance();
        const expr = this.expression();
        if (this.check('PUNCTUATION', ')')) this.advance();
        if (this.check('NEWLINE')) this.advance();
        return { id: generateId(), type: 'Print', expression: expr };
    }

    private assignment(): Assignment {
        const name = this.consume('IDENTIFIER').value;
        this.consume('OPERATOR', '=');
        const value = this.expression();
        if (this.check('NEWLINE')) this.advance();
        return { id: generateId(), type: 'Assignment', name, value };
    }

    private ifStatement(): If {
        this.consume('KEYWORD', 'if');
        const condition = this.expression();
        const thenBranch = this.block();
        let elseBranch: Block | undefined = undefined;
        if (this.match('KEYWORD', 'else')) { elseBranch = this.block(); }
        return { id: generateId(), type: 'If', condition, thenBranch, elseBranch };
    }

    private whileStatement(): While {
        this.consume('KEYWORD', 'while');
        const condition = this.expression();
        const body = this.block();
        return { id: generateId(), type: 'While', condition, body };
    }

    private forStatement(): For {
        this.consume('KEYWORD', 'for');
        const variable = this.consume('IDENTIFIER').value;
        this.consume('KEYWORD', 'in');
        const iterable = this.expression();
        const body = this.block();
        return { id: generateId(), type: 'For', variable, iterable, body };
    }

    private functionDeclaration(): FunctionDeclaration {
        this.consume('KEYWORD', 'def');
        const name = this.consume('IDENTIFIER').value;
        this.consume('PUNCTUATION', '(');
        const params: Identifier[] = [];
        if (!this.check('PUNCTUATION', ')')) {
            do {
                const paramName = this.consume('IDENTIFIER').value;
                params.push({ id: generateId(), type: 'Identifier', name: paramName });
            } while (this.match('PUNCTUATION', ','));
        }
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'FunctionDeclaration', name, params, body };
    }

    private returnStatement(): Return {
        this.consume('KEYWORD', 'return');
        let value: Expression | undefined = undefined;
        if (!this.check('NEWLINE') && !this.isAtEnd()) { value = this.expression(); }
        if (this.check('NEWLINE')) this.advance();
        return { id: generateId(), type: 'Return', value };
    }

    private expression(): Expression { return this.logicOr(); }

    private logicOr(): Expression {
        let left = this.logicAnd();
        while (this.match('KEYWORD', 'or')) {
            const operator = this.previous().value;
            const right = this.logicAnd();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        return left;
    }

    private logicAnd(): Expression {
        let left = this.equality();
        while (this.match('KEYWORD', 'and')) {
            const operator = this.previous().value;
            const right = this.equality();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
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
        if (this.match('OPERATOR', '!', '-') || this.match('KEYWORD', 'not')) {
            const operator = this.previous().value;
            const right = this.unary();
            return { id: generateId(), type: 'UnaryExpression', operator, argument: right };
        }
        return this.call();
    }

    private call(): Expression {
        let expr = this.primary();
        while (true) {
            if (this.match('PUNCTUATION', '(')) { expr = this.finishCall(expr); } else { break; }
        }
        return expr;
    }

    private finishCall(callee: Expression): CallExpression {
        if (callee.type !== 'Identifier') { throw new Error("Can only call identifiers"); }
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
        if (this.match('BOOLEAN')) return { id: generateId(), type: 'Literal', value: this.previous().value === 'True', raw: this.previous().value };
        if (this.match('IDENTIFIER')) return { id: generateId(), type: 'Identifier', name: this.previous().value };
        if (this.match('PUNCTUATION', '[')) {
            const elements: Expression[] = [];
            if (!this.check('PUNCTUATION', ']')) {
                do { elements.push(this.expression()); } while (this.match('PUNCTUATION', ','));
            }
            this.consume('PUNCTUATION', ']');
            return { id: generateId(), type: 'ArrayLiteral', elements };
        }
        if (this.match('PUNCTUATION', '(')) {
            const expr = this.expression();
            this.consume('PUNCTUATION', ')');
            return expr;
        }
        throw new Error(`Expect expression. Found ${this.peek().value}`);
    }

    // Helpers
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
        throw new Error(`Expected token ${type} ${value || ''}`);
    }
    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }
    private isAtEnd(): boolean { return this.peek().type === 'EOF'; }
    private peek(): Token { return this.tokens[this.current]; }
    private previous(): Token { return this.tokens[this.current - 1]; }
}