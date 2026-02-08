import type { Token } from "../lexer";

export class Lexer {
    private pos = 0;
    private input: string;
    private indentStack: number[] = [0];
    private pendingTokens: Token[] = [];

    constructor(input: string) {
        this.input = input;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];

        while (this.pos < this.input.length || this.pendingTokens.length > 0) {
            if (this.pendingTokens.length > 0) {
                tokens.push(this.pendingTokens.shift()!);
                continue;
            }

            const char = this.input[this.pos];

            if (char === '\n') {
                const start = this.pos;
                this.pos++;
                let indentLevel = 0;
                while (this.pos < this.input.length && this.input[this.pos] === ' ') {
                    indentLevel++;
                    this.pos++;
                }
                if (this.pos < this.input.length && this.input[this.pos] === '\n') {
                    continue;
                }
                tokens.push({ type: 'NEWLINE', value: '\n', start });
                const currentIndent = this.indentStack[this.indentStack.length - 1];
                if (indentLevel > currentIndent) {
                    this.indentStack.push(indentLevel);
                    tokens.push({ type: 'INDENT', value: '  ', start: this.pos });
                } else if (indentLevel < currentIndent) {
                    while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1] > indentLevel) {
                        this.indentStack.pop();
                        tokens.push({ type: 'DEDENT', value: '', start: this.pos });
                    }
                }
                continue;
            }

            if (/\s/.test(char)) { this.pos++; continue; }
            if (char === '#') { while (this.pos < this.input.length && this.input[this.pos] !== '\n') { this.pos++; } continue; }

            if (/\d/.test(char)) {
                let value = '';
                const start = this.pos;
                while (this.pos < this.input.length && (/\d/.test(this.input[this.pos]) || this.input[this.pos] === '.')) {
                    value += this.input[this.pos++];
                }
                tokens.push({ type: 'NUMBER', value, start });
                continue;
            }

            if (char === '"' || char === "'") {
                const quote = char;
                const start = this.pos;
                this.pos++;
                let value = '';
                while (this.pos < this.input.length && this.input[this.pos] !== quote) {
                    value += this.input[this.pos++];
                }
                this.pos++;
                tokens.push({ type: 'STRING', value, start });
                continue;
            }

            // Handle f-strings (f"..." or f'...')
            if ((char === 'f' || char === 'r' || char === 'b') && this.pos + 1 < this.input.length && (this.input[this.pos + 1] === '"' || this.input[this.pos + 1] === "'")) {
                const prefix = char;
                const quote = this.input[this.pos + 1];
                const start = this.pos;
                this.pos += 2; // skip prefix and quote
                let value = '';
                while (this.pos < this.input.length && this.input[this.pos] !== quote) {
                    value += this.input[this.pos++];
                }
                this.pos++; // skip closing quote
                tokens.push({ type: 'STRING', value: `${prefix}${value}`, start });
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                const start = this.pos;
                let value = '';
                while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
                    value += this.input[this.pos++];
                }
                const keywords = ['print', 'if', 'else', 'while', 'for', 'def', 'return', 'and', 'or', 'not', 'True', 'False', 'in', 'class', 'import', 'from', 'as', 'pass', 'break', 'continue', 'try', 'except', 'finally', 'with', 'None', 'self', 'super'];
                const type = keywords.includes(value) ? 'KEYWORD' : 'IDENTIFIER';
                if (value === 'True' || value === 'False') tokens.push({ type: 'BOOLEAN', value, start });
                else tokens.push({ type, value, start });
                continue;
            }

            if (['+', '-', '*', '/', '=', '>', '<', '!', '%'].includes(char)) {
                const start = this.pos;
                if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === '=') {
                    tokens.push({ type: 'OPERATOR', value: char + '=', start });
                    this.pos += 2;
                    continue;
                }
                tokens.push({ type: 'OPERATOR', value: char, start: this.pos++ });
                continue;
            }

            if (['(', ')', '[', ']', '{', '}', ':', ',', '.'].includes(char)) {
                tokens.push({ type: 'PUNCTUATION', value: char, start: this.pos++ });
                continue;
            }
            throw new Error(`Unexpected character: ${char} at position ${this.pos}`);
        }
        while (this.indentStack.length > 1) {
            this.indentStack.pop();
            tokens.push({ type: 'DEDENT', value: '', start: this.pos });
        }
        tokens.push({ type: 'EOF', value: '', start: this.pos });
        return tokens;
    }
}