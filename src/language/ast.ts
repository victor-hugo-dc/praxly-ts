export type NodeType =
    | 'Program' | 'Block' | 'Assignment' | 'Print' | 'If' | 'While' | 'For'
    | 'FunctionDeclaration' | 'ClassDeclaration' | 'FieldDeclaration' | 'Constructor' | 'Return'
    | 'BinaryExpression' | 'UnaryExpression' | 'Identifier' | 'Literal'
    | 'ArrayLiteral' | 'CallExpression' | 'ExpressionStatement' | 'MemberExpression' | 'FunctionDeclaration' | 'Return' | 'BinaryExpression' | 'UnaryExpression'
    | 'Identifier' | 'Literal' | 'ArrayLiteral' | 'CallExpression' | 'ExpressionStatement'
    | 'ClassDeclaration' | 'FieldDeclaration' | 'Constructor' | 'MethodDeclaration'
    | 'NewExpression' | 'MemberExpression' | 'ThisExpression' | 'Parameter';

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
    | Assignment | Print | If | While | For
    | ClassDeclaration | FieldDeclaration | Constructor | Return | ExpressionStatement;

export interface FieldDeclaration extends ASTNode {
    type: 'FieldDeclaration';
    name: string;
    value?: Expression;
    access: 'public' | 'private' | 'protected';
    isStatic: boolean;
    varType?: string;
}

export interface Constructor extends ASTNode {
    type: 'Constructor';
    params: Identifier[];
    body: Block;
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

export interface ExpressionStatement extends ASTNode {
    type: 'ExpressionStatement';
    expression: Expression;
}

export type Expression =
    | BinaryExpression | UnaryExpression | Identifier | Literal
    | ArrayLiteral | CallExpression | MemberExpression;

export interface MemberExpression extends ASTNode {
    type: 'MemberExpression';
    object: Expression;
    property: Identifier;
}

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
    callee: Expression;
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

// OOP-related nodes
export type AccessModifier = 'public' | 'private' | 'protected';

export interface ClassDeclaration extends ASTNode {
    type: 'ClassDeclaration';
    name: string;
    superClass?: Identifier;
    body: (FieldDeclaration | Constructor | MethodDeclaration)[];
}

export interface FieldDeclaration extends ASTNode {
    type: 'FieldDeclaration';
    name: string;
    fieldType: string;
    isStatic: boolean;
    access: AccessModifier;
    initializer?: Expression;
}

export interface Constructor extends ASTNode {
    type: 'Constructor';
    access: AccessModifier;
    params: Identifier[];
    body: Block;
}

export interface Parameter extends ASTNode {
    type: 'Parameter';
    name: string;
    paramType: string;
}

export interface MethodDeclaration extends ASTNode {
    type: 'MethodDeclaration';
    name: string;
    access: AccessModifier;
    isStatic: boolean;
    returnType: string;
    params: Parameter[];
    body: Block;
}

export interface NewExpression extends ASTNode {
    type: 'NewExpression';
    className: string;
    arguments: Expression[];
}

export interface MemberExpression extends ASTNode {
    type: 'MemberExpression';
    object: Expression;
    property: Identifier;
    isMethod: boolean;
}

export interface ThisExpression extends ASTNode {
    type: 'ThisExpression';
}

export const generateId = () => Math.random().toString(36).substr(2, 9);