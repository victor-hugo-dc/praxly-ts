import type { Token } from '../lexer';

export class JavaLexer {
    private pos = 0;
    private input: string;

    constructor(input: string) {
        this.input = input;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];
        while (this.pos < this.input.length) {
            const char = this.input[this.pos];

            if (/\s/.test(char)) { this.pos++; continue; }

            // Comments
            if (char === '/' && this.input[this.pos + 1] === '/') {
                while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.pos++;
                continue;
            }

            if (/\d/.test(char)) {
                let value = '';
                const start = this.pos;
                while (this.pos < this.input.length && (/\d/.test(this.input[this.pos]) || this.input[this.pos] === '.')) {
                    value += this.input[this.pos++];
                }
                tokens.push({ type: 'NUMBER', value, start });
                continue;
            }

            if (char === '"') {
                const start = this.pos;
                this.pos++;
                let value = '';
                while (this.pos < this.input.length && this.input[this.pos] !== '"') {
                    value += this.input[this.pos++];
                }
                this.pos++;
                tokens.push({ type: 'STRING', value, start });
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                const start = this.pos;
                let value = '';
                while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
                    value += this.input[this.pos++];
                }
                // FIXED: Removed 'main' from keywords so it parses as IDENTIFIER
                const keywords = ['public', 'class', 'static', 'void', 'int', 'double', 'boolean', 'if', 'else', 'while', 'for', 'return', 'true', 'false', 'var', 'new'];
                const type = keywords.includes(value) ? 'KEYWORD' : 'IDENTIFIER';
                if (value === 'true' || value === 'false') tokens.push({ type: 'BOOLEAN', value, start });
                else tokens.push({ type, value, start });
                continue;
            }

            if (['+', '-', '*', '/', '=', '>', '<', '!', '&', '|', '%'].includes(char)) {
                const start = this.pos;
                const next = this.input[this.pos + 1];
                if (char === '=' && next === '=') { tokens.push({ type: 'OPERATOR', value: '==', start }); this.pos += 2; continue; }
                if (char === '!' && next === '=') { tokens.push({ type: 'OPERATOR', value: '!=', start }); this.pos += 2; continue; }
                if (char === '&' && next === '&') { tokens.push({ type: 'OPERATOR', value: '&&', start }); this.pos += 2; continue; }
                if (char === '|' && next === '|') { tokens.push({ type: 'OPERATOR', value: '||', start }); this.pos += 2; continue; }
                if (char === '<' && next === '=') { tokens.push({ type: 'OPERATOR', value: '<=', start }); this.pos += 2; continue; }
                if (char === '>' && next === '=') { tokens.push({ type: 'OPERATOR', value: '>=', start }); this.pos += 2; continue; }

                tokens.push({ type: 'OPERATOR', value: char, start: this.pos++ });
                continue;
            }

            if (['(', ')', '{', '}', '[', ']', ';', ',', '.', ':'].includes(char)) {
                tokens.push({ type: 'PUNCTUATION', value: char, start: this.pos++ });
                continue;
            }

            throw new Error(`Unexpected character: ${char} at position ${this.pos}`);
        }
        tokens.push({ type: 'EOF', value: '', start: this.pos });
        return tokens;
    }
}