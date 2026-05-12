import { resolveDatasetColumnId } from "../csv";
import type { Dataset, DataValue } from "../types";

type ExpressionToken =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "(" | ")" };
type ExpressionOperator = Extract<ExpressionToken, { type: "operator" }>["value"];

type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "column"; columnId: string; label: string }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: ExpressionNode; right: ExpressionNode }
  | { type: "unary"; operator: "+" | "-"; value: ExpressionNode };

export type DatasetExpressionResult = { ok: true; values: number[] } | { ok: false; error: string };

export const evaluateDatasetExpression = (
  dataset: Dataset,
  expression: string,
): DatasetExpressionResult => {
  const parsed = parseDatasetExpression(dataset, expression);
  if (!parsed.ok) return parsed;
  const values: number[] = [];
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const evaluated = evaluateNode(parsed.node, dataset.rows[rowIndex] ?? {}, rowIndex);
    if (!evaluated.ok) return evaluated;
    values.push(evaluated.value);
  }
  return { ok: true, values };
};

const parseDatasetExpression = (
  dataset: Dataset,
  expression: string,
): { ok: true; node: ExpressionNode } | { ok: false; error: string } => {
  const tokenized = tokenizeExpression(expression);
  if (!tokenized.ok) return tokenized;
  const parser = new ExpressionParser(dataset, tokenized.tokens);
  const parsed = parser.parseExpression();
  if (!parsed.ok) return parsed;
  if (!parser.atEnd()) {
    return { ok: false, error: `Unexpected token in expression: ${parser.currentLabel()}` };
  }
  return parsed;
};

const tokenizeExpression = (
  expression: string,
): { ok: true; tokens: ExpressionToken[] } | { ok: false; error: string } => {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const char = expression[index];
    if (!char) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = rest.match(/^\d*\.?\d+(?:e[-+]?\d+)?/i)?.[0];
    if (number) {
      tokens.push({ type: "number", value: Number(number) });
      index += number.length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][\w.-]*/)?.[0];
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier });
      index += identifier.length;
      continue;
    }
    if (isOperator(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    return { ok: false, error: `Invalid expression token: ${char}` };
  }
  if (tokens.length === 0) return { ok: false, error: "Expression is required" };
  return { ok: true, tokens };
};

class ExpressionParser {
  private index = 0;
  private readonly dataset: Dataset;
  private readonly tokens: ExpressionToken[];

  constructor(dataset: Dataset, tokens: ExpressionToken[]) {
    this.dataset = dataset;
    this.tokens = tokens;
  }

  atEnd(): boolean {
    return this.index >= this.tokens.length;
  }

  currentLabel(): string {
    const token = this.tokens[this.index];
    if (!token) return "<end>";
    return token.type === "operator" ? token.value : String(token.value);
  }

  parseExpression(): { ok: true; node: ExpressionNode } | { ok: false; error: string } {
    return this.parseAddition();
  }

  private parseAddition(): { ok: true; node: ExpressionNode } | { ok: false; error: string } {
    let left = this.parseMultiplication();
    if (!left.ok) return left;
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previousOperator();
      const right = this.parseMultiplication();
      if (!right.ok) return right;
      left = { ok: true, node: { type: "binary", operator, left: left.node, right: right.node } };
    }
    return left;
  }

  private parseMultiplication(): { ok: true; node: ExpressionNode } | { ok: false; error: string } {
    let left = this.parseUnary();
    if (!left.ok) return left;
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previousOperator();
      const right = this.parseUnary();
      if (!right.ok) return right;
      left = { ok: true, node: { type: "binary", operator, left: left.node, right: right.node } };
    }
    return left;
  }

  private parseUnary(): { ok: true; node: ExpressionNode } | { ok: false; error: string } {
    if (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previousUnaryOperator();
      const value = this.parseUnary();
      if (!value.ok) return value;
      return { ok: true, node: { type: "unary", operator, value: value.node } };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): { ok: true; node: ExpressionNode } | { ok: false; error: string } {
    const token = this.advance();
    if (!token) return { ok: false, error: "Unexpected end of expression" };
    if (token.type === "number") return { ok: true, node: { type: "number", value: token.value } };
    if (token.type === "identifier") {
      const columnId = resolveDatasetColumnId(this.dataset, token.value);
      if (!columnId) return { ok: false, error: `Unknown column in expression: ${token.value}` };
      return { ok: true, node: { type: "column", columnId, label: token.value } };
    }
    if (token.value === "(") {
      const expression = this.parseExpression();
      if (!expression.ok) return expression;
      if (!this.matchOperator(")")) return { ok: false, error: "Missing closing parenthesis" };
      return expression;
    }
    return { ok: false, error: `Unexpected token in expression: ${token.value}` };
  }

  private matchOperator(operator: ExpressionOperator): boolean {
    const token = this.tokens[this.index];
    if (token?.type !== "operator" || token.value !== operator) return false;
    this.index += 1;
    return true;
  }

  private previousOperator(): "+" | "-" | "*" | "/" {
    const token = this.tokens[this.index - 1];
    if (token?.type === "operator" && ["+", "-", "*", "/"].includes(token.value)) {
      return token.value as "+" | "-" | "*" | "/";
    }
    throw new Error("Previous token is not a binary operator");
  }

  private previousUnaryOperator(): "+" | "-" {
    const token = this.tokens[this.index - 1];
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      return token.value;
    }
    throw new Error("Previous token is not a unary operator");
  }

  private advance(): ExpressionToken | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }
}

const evaluateNode = (
  node: ExpressionNode,
  row: Record<string, DataValue>,
  rowIndex: number,
): { ok: true; value: number } | { ok: false; error: string } => {
  if (node.type === "number") return { ok: true, value: node.value };
  if (node.type === "column") {
    const value = row[node.columnId];
    if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
    return {
      ok: false,
      error: `Non-numeric value in column ${node.label} at row ${rowIndex + 1}`,
    };
  }
  if (node.type === "unary") {
    const value = evaluateNode(node.value, row, rowIndex);
    if (!value.ok) return value;
    return { ok: true, value: node.operator === "-" ? -value.value : value.value };
  }
  const left = evaluateNode(node.left, row, rowIndex);
  if (!left.ok) return left;
  const right = evaluateNode(node.right, row, rowIndex);
  if (!right.ok) return right;
  if (node.operator === "+") return { ok: true, value: left.value + right.value };
  if (node.operator === "-") return { ok: true, value: left.value - right.value };
  if (node.operator === "*") return { ok: true, value: left.value * right.value };
  if (right.value === 0) return { ok: false, error: `Division by zero at row ${rowIndex + 1}` };
  return { ok: true, value: left.value / right.value };
};

const isOperator = (value: string): value is ExpressionOperator =>
  value === "+" ||
  value === "-" ||
  value === "*" ||
  value === "/" ||
  value === "(" ||
  value === ")";
