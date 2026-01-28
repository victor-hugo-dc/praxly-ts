import type { Token, TokenType } from '../lexer';
import { type Program, type Statement, type Block, type Expression, type If, type While, type For, type FunctionDeclaration, type Return, type CallExpression, type Identifier, type UnaryExpression, generateId } from '../ast';

export class CSPParser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): Program {
        const body: Statement[] = [];
        while (!this.isAtEnd()) {
            body.push(this.statement());
        }
        return { id: generateId(), type: 'Program', body };
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
        if (this.check('KEYWORD', 'IF')) return this.ifStatement();
        if (this.check('KEYWORD', 'REPEAT')) return this.repeatStatement();
        if (this.check('KEYWORD', 'FOR')) return this.forStatement();
        if (this.check('KEYWORD', 'PROCEDURE')) return this.procedureStatement();
        if (this.check('KEYWORD', 'RETURN')) return this.returnStatement();
        if (this.check('KEYWORD', 'DISPLAY')) return this.printStatement();

        // Assignment: x <- 10
        if (this.check('IDENTIFIER') && this.checkNext('OPERATOR', '<-')) {
            const name = this.consume('IDENTIFIER').value;
            this.consume('OPERATOR', '<-');
            const value = this.expression();
            return { id: generateId(), type: 'Assignment', name, value };
        }

        const expr = this.expression();
        return { id: generateId(), type: 'ExpressionStatement', expression: expr };
    }

    private printStatement(): Statement {
        this.consume('KEYWORD', 'DISPLAY');
        // Fix: Optional Parentheses
        if (this.check('PUNCTUATION', '(')) {
            this.consume('PUNCTUATION', '(');
            const expr = this.expression();
            this.consume('PUNCTUATION', ')');
            return { id: generateId(), type: 'Print', expression: expr };
        }
        const expr = this.expression();
        return { id: generateId(), type: 'Print', expression: expr };
    }

    private ifStatement(): If {
        this.consume('KEYWORD', 'IF');
        // Fix: Optional Parentheses
        if (this.check('PUNCTUATION', '(')) this.consume('PUNCTUATION', '(');
        const condition = this.expression();
        if (this.check('PUNCTUATION', ')')) this.consume('PUNCTUATION', ')');

        const thenBranch = this.block();
        let elseBranch: Block | undefined = undefined;
        if (this.match('KEYWORD', 'ELSE')) {
            elseBranch = this.block();
        }
        return { id: generateId(), type: 'If', condition, thenBranch, elseBranch };
    }

    private repeatStatement(): While {
        this.consume('KEYWORD', 'REPEAT');
        this.consume('KEYWORD', 'UNTIL');

        // Fix: Optional Parentheses
        if (this.check('PUNCTUATION', '(')) this.consume('PUNCTUATION', '(');
        const condition = this.expression();
        if (this.check('PUNCTUATION', ')')) this.consume('PUNCTUATION', ')');

        // Invert condition for While
        const negatedCondition: UnaryExpression = {
            id: generateId(),
            type: 'UnaryExpression',
            operator: 'not',
            argument: condition
        };

        const body = this.block();
        return { id: generateId(), type: 'While', condition: negatedCondition, body };
    }

    private forStatement(): For {
        this.consume('KEYWORD', 'FOR');
        this.consume('KEYWORD', 'EACH');
        const variable = this.consume('IDENTIFIER').value;
        this.consume('KEYWORD', 'IN');
        const iterable = this.expression();
        const body = this.block();
        return { id: generateId(), type: 'For', variable, iterable, body };
    }

    private procedureStatement(): FunctionDeclaration {
        this.consume('KEYWORD', 'PROCEDURE');
        const name = this.consume('IDENTIFIER').value;
        this.consume('PUNCTUATION', '(');
        const params: Identifier[] = [];
        if (!this.check('PUNCTUATION', ')')) {
            do {
                const pName = this.consume('IDENTIFIER').value;
                params.push({ id: generateId(), type: 'Identifier', name: pName });
            } while (this.match('PUNCTUATION', ','));
        }
        this.consume('PUNCTUATION', ')');
        const body = this.block();
        return { id: generateId(), type: 'FunctionDeclaration', name, params, body };
    }

    private returnStatement(): Return {
        this.consume('KEYWORD', 'RETURN');
        let value: Expression | undefined = undefined;
        // Heuristic: start of expression check
        if (!this.check('PUNCTUATION', '}') && !this.isAtEnd()) {
            value = this.expression();
        }
        return { id: generateId(), type: 'Return', value };
    }

    // --- Expressions ---

    private expression(): Expression { return this.logicOr(); }

    private logicOr(): Expression {
        let left = this.logicAnd();
        while (this.match('KEYWORD', 'OR')) {
            const right = this.logicAnd();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: 'or', right };
        }
        return left;
    }

    private logicAnd(): Expression {
        let left = this.equality();
        while (this.match('KEYWORD', 'AND')) {
            const right = this.equality();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: 'and', right };
        }
        return left;
    }

    private equality(): Expression {
        let left = this.comparison();
        while (this.match('OPERATOR', '=', '<>')) {
            let op = this.previous().value;
            if (op === '=') op = '==';
            if (op === '<>') op = '!=';
            const right = this.comparison();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: op, right };
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
        while (this.match('OPERATOR', '*', '/')) {
            const operator = this.previous().value;
            const right = this.unary();
            left = { id: generateId(), type: 'BinaryExpression', left, operator, right };
        }
        while (this.match('KEYWORD', 'MOD')) {
            const right = this.unary();
            left = { id: generateId(), type: 'BinaryExpression', left, operator: '%', right };
        }
        return left;
    }

    private unary(): Expression {
        if (this.match('KEYWORD', 'NOT')) {
            const right = this.unary();
            return { id: generateId(), type: 'UnaryExpression', operator: 'not', argument: right };
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

        if (this.match('KEYWORD', 'INPUT')) {
            if (this.check('PUNCTUATION', '(')) {
                this.consume('PUNCTUATION', '(');
                this.consume('PUNCTUATION', ')');
            }
            const callee: Identifier = { id: generateId(), type: 'Identifier', name: 'INPUT' };
            return { id: generateId(), type: 'CallExpression', callee, arguments: [] };
        }

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
        // Improved Error Message
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