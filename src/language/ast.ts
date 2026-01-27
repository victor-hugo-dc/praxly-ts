export type NodeType =
    | 'Program' | 'Block' | 'Assignment' | 'Print' | 'If' | 'While' | 'For'
    | 'FunctionDeclaration' | 'Return' | 'BinaryExpression' | 'UnaryExpression'
    | 'Identifier' | 'Literal' | 'ArrayLiteral' | 'CallExpression' | 'ExpressionStatement';

export interface ASTNode {
    id: string;
    type: NodeType;
    loc?: { start: number; end: number };
}

export interface Program extends ASTNode {
    type: 'Program';
    body: Statement[];
}

export interface Block extends ASTNode {
    type: 'Block';
    body: Statement[];
}

export type Statement =
    | Assignment | Print | If | While | For | FunctionDeclaration | Return | ExpressionStatement;

export interface ExpressionStatement extends ASTNode {
    type: 'ExpressionStatement';
    expression: Expression;
}

export interface Assignment extends ASTNode {
    type: 'Assignment';
    name: string;
    value: Expression;
}

export interface Print extends ASTNode {
    type: 'Print';
    expression: Expression;
}

export interface If extends ASTNode {
    type: 'If';
    condition: Expression;
    thenBranch: Block;
    elseBranch?: Block;
}

export interface While extends ASTNode {
    type: 'While';
    condition: Expression;
    body: Block;
}

export interface For extends ASTNode {
    type: 'For';
    variable: string;
    iterable: Expression;
    body: Block;
}

export interface FunctionDeclaration extends ASTNode {
    type: 'FunctionDeclaration';
    name: string;
    params: Identifier[];
    body: Block;
}

export interface Return extends ASTNode {
    type: 'Return';
    value?: Expression;
}

export type Expression =
    | BinaryExpression | UnaryExpression | Identifier | Literal | ArrayLiteral | CallExpression;

export interface BinaryExpression extends ASTNode {
    type: 'BinaryExpression';
    left: Expression;
    operator: string;
    right: Expression;
}

export interface UnaryExpression extends ASTNode {
    type: 'UnaryExpression';
    operator: string;
    argument: Expression;
}

export interface CallExpression extends ASTNode {
    type: 'CallExpression';
    callee: Identifier;
    arguments: Expression[];
}

export interface Identifier extends ASTNode {
    type: 'Identifier';
    name: string;
}

export interface Literal extends ASTNode {
    type: 'Literal';
    value: any;
    raw: string;
}

export interface ArrayLiteral extends ASTNode {
    type: 'ArrayLiteral';
    elements: Expression[];
}

export const generateId = () => Math.random().toString(36).substr(2, 9);