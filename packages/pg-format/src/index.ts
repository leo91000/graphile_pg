import { RESERVED_WORDS } from "./reserved";

export interface FormatConfig {
  pattern?: {
    ident?: string;
    literal?: string;
    string?: string;
  };
}

type FormatValue = string | number | boolean | Date | Buffer | null | undefined | FormatValue[] | Record<string, any>;

// Default format patterns
let formatPattern = {
  ident: "I",
  literal: "L",
  string: "s",
};

/**
 * Convert date to PostgreSQL ISO 8601 format
 */
function formatDate(date: Date): string {
  const isoString = date.toISOString();
  return isoString.replace("T", " ").replace("Z", "+00");
}

/**
 * Check if a word is a PostgreSQL reserved word
 */
function isReserved(value: string): boolean {
  return RESERVED_WORDS.has(value.toUpperCase());
}

/**
 * Convert array to SQL list format
 */
function arrayToList(
  useSpace: boolean,
  array: FormatValue[],
  formatter: (value: FormatValue) => string
): string {
  let sql = useSpace ? "(" : "(";
  
  for (let i = 0; i < array.length; i++) {
    sql += (i === 0 ? "" : ", ") + formatter(array[i]);
  }
  
  sql += ")";
  return sql;
}

/**
 * Quote a PostgreSQL identifier
 * Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
 */
export function quoteIdent(value: FormatValue): string {
  if (value === undefined || value === null) {
    throw new Error("SQL identifier cannot be null or undefined");
  }
  
  if (value === false) {
    return '"f"';
  }
  
  if (value === true) {
    return '"t"';
  }
  
  if (value instanceof Date) {
    return `"${formatDate(value)}"`;
  }
  
  if (value instanceof Buffer) {
    throw new Error("SQL identifier cannot be a buffer");
  }
  
  if (Array.isArray(value)) {
    const temp: string[] = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        throw new Error("Nested array to grouped list conversion is not supported for SQL identifier");
      }
      temp.push(quoteIdent(item));
    }
    return temp.join(", ");
  }
  
  if (typeof value === "object" && value !== null) {
    throw new Error("SQL identifier cannot be an object");
  }

  const ident = String(value);

  // Do not quote a valid, unquoted identifier
  if (/^[a-z_][a-z0-9_$]*$/.test(ident) && !isReserved(ident)) {
    return ident;
  }

  // Quote the identifier
  let quoted = '"';
  for (const char of ident) {
    quoted += char === '"' ? '""' : char;
  }
  quoted += '"';

  return quoted;
}

/**
 * Quote a PostgreSQL literal value
 * Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
 */
export function quoteLiteral(value: FormatValue): string {
  if (value === undefined || value === null) {
    return "NULL";
  }
  
  if (value === false) {
    return "'f'";
  }
  
  if (value === true) {
    return "'t'";
  }
  
  if (value instanceof Date) {
    return `'${formatDate(value)}'`;
  }
  
  if (value instanceof Buffer) {
    return `E'\\\\x${value.toString("hex")}'`;
  }
  
  if (Array.isArray(value)) {
    const temp: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (Array.isArray(value[i])) {
        temp.push(arrayToList(i !== 0, value[i] as FormatValue[], quoteLiteral));
      } else {
        temp.push(quoteLiteral(value[i]));
      }
    }
    return temp.join(", ");
  }
  
  let literal: string;
  let explicitCast: string | null = null;
  
  if (typeof value === "object" && value !== null) {
    explicitCast = "jsonb";
    literal = JSON.stringify(value);
  } else {
    literal = String(value);
  }

  let hasBackslash = false;
  let quoted = "'";
  
  for (const char of literal) {
    if (char === "'") {
      quoted += "''";
    } else if (char === "\\") {
      quoted += "\\\\";
      hasBackslash = true;
    } else {
      quoted += char;
    }
  }
  
  quoted += "'";

  if (hasBackslash) {
    quoted = "E" + quoted;
  }

  if (explicitCast) {
    quoted += "::" + explicitCast;
  }

  return quoted;
}

/**
 * Format a value as a simple string (no quotes)
 */
export function quoteString(value: FormatValue): string {
  if (value === undefined || value === null) {
    return "";
  }
  
  if (value === false) {
    return "f";
  }
  
  if (value === true) {
    return "t";
  }
  
  if (value instanceof Date) {
    return formatDate(value);
  }
  
  if (value instanceof Buffer) {
    return `\\x${value.toString("hex")}`;
  }
  
  if (Array.isArray(value)) {
    const temp: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== null && value[i] !== undefined) {
        if (Array.isArray(value[i])) {
          temp.push(arrayToList(i !== 0, value[i] as FormatValue[], quoteString));
        } else {
          temp.push(quoteString(value[i]));
        }
      }
    }
    return temp.join(", ");
  }
  
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Configure format patterns
 */
export function config(cfg: FormatConfig): void {
  // Reset to defaults
  formatPattern = {
    ident: "I",
    literal: "L",
    string: "s",
  };

  if (cfg?.pattern) {
    if (cfg.pattern.ident) {
      formatPattern.ident = cfg.pattern.ident;
    }
    if (cfg.pattern.literal) {
      formatPattern.literal = cfg.pattern.literal;
    }
    if (cfg.pattern.string) {
      formatPattern.string = cfg.pattern.string;
    }
  }
}

/**
 * Format a string with an array of parameters
 */
export function withArray(fmt: string, parameters: FormatValue[]): string {
  let index = 0;

  // Build regex pattern dynamically based on current format patterns
  const re = new RegExp(
    `%(%|(\\d+\\$)?[${formatPattern.ident}${formatPattern.literal}${formatPattern.string}])`,
    "g"
  );

  return fmt.replace(re, (match, type) => {
    if (type === "%") {
      return "%";
    }

    let position = index;
    const tokens = type.split("$");

    if (tokens.length > 1) {
      position = parseInt(tokens[0], 10) - 1;
      type = tokens[1];
    }

    if (position < 0) {
      throw new Error("specified argument 0 but arguments start at 1");
    }
    
    if (position > parameters.length - 1) {
      throw new Error("too few arguments");
    }

    index = position + 1;

    if (type === formatPattern.ident) {
      return quoteIdent(parameters[position]);
    }
    
    if (type === formatPattern.literal) {
      return quoteLiteral(parameters[position]);
    }
    
    if (type === formatPattern.string) {
      return quoteString(parameters[position]);
    }

    // This shouldn't happen if regex is correct
    return match;
  });
}

/**
 * Format a string with variadic arguments
 */
export function format(fmt: string, ...args: FormatValue[]): string {
  return withArray(fmt, args);
}

// Default export
export default format;

// Named exports for compatibility
export {
  quoteIdent as ident,
  quoteLiteral as literal,
  quoteString as string,
};