// Handles tokenization and indentation
export type TokenType =
    | 'KEYWORD' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BOOLEAN'
    | 'OPERATOR' | 'PUNCTUATION' | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    start: number;
}