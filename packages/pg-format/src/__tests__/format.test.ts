import { describe, it, expect } from "vitest";
import format, { ident, literal, string, withArray, config } from "../index";

describe("pg-format", () => {
  describe("format()", () => {
    it("should format %I identifiers", () => {
      expect(format("SELECT %I FROM %I", "name", "users")).toBe(
        'SELECT name FROM users'
      );
    });

    it("should format %L literals", () => {
      expect(format("SELECT * FROM users WHERE name = %L", "John")).toBe(
        "SELECT * FROM users WHERE name = 'John'"
      );
    });

    it("should format %s strings", () => {
      expect(format("SELECT * FROM %s", "users")).toBe(
        "SELECT * FROM users"
      );
    });

    it("should handle positional arguments", () => {
      expect(format("SELECT %2$I FROM %1$I", "users", "name")).toBe(
        "SELECT name FROM users"
      );
    });

    it("should escape %% as %", () => {
      expect(format("SELECT %% FROM users")).toBe("SELECT % FROM users");
    });

    it("should handle mixed types", () => {
      expect(
        format("INSERT INTO %I (%I, %I) VALUES (%L, %L)", "users", "name", "age", "John", 25)
      ).toBe("INSERT INTO users (name, age) VALUES ('John', '25')");
    });

    it("should throw on too few arguments", () => {
      expect(() => format("SELECT %I, %I FROM users", "name")).toThrow("too few arguments");
    });

    it("should throw on invalid positional argument", () => {
      expect(() => format("SELECT %0$I FROM users", "name")).toThrow(
        "specified argument 0 but arguments start at 1"
      );
    });
  });

  describe("ident()", () => {
    it("should quote reserved words", () => {
      expect(ident("user")).toBe('"user"');
      expect(ident("USER")).toBe('"USER"');
      expect(ident("select")).toBe('"select"');
    });

    it("should not quote valid identifiers", () => {
      expect(ident("name")).toBe("name");
      expect(ident("user_id")).toBe("user_id");
      expect(ident("table1")).toBe("table1");
    });

    it("should quote identifiers with special characters", () => {
      expect(ident("user-name")).toBe('"user-name"');
      expect(ident("user name")).toBe('"user name"');
      expect(ident("123")).toBe('"123"');
    });

    it("should escape quotes in identifiers", () => {
      expect(ident('user"name')).toBe('"user""name"');
    });

    it("should handle boolean values", () => {
      expect(ident(true)).toBe('"t"');
      expect(ident(false)).toBe('"f"');
    });

    it("should handle arrays", () => {
      expect(ident(["name", "age", "email"])).toBe("name, age, email");
      expect(ident(["user", "group"])).toBe('"user", "group"');
    });

    it("should throw on null/undefined", () => {
      expect(() => ident(null)).toThrow("SQL identifier cannot be null or undefined");
      expect(() => ident(undefined)).toThrow("SQL identifier cannot be null or undefined");
    });

    it("should throw on Buffer", () => {
      expect(() => ident(Buffer.from("test"))).toThrow("SQL identifier cannot be a buffer");
    });

    it("should throw on objects", () => {
      expect(() => ident({ name: "test" })).toThrow("SQL identifier cannot be an object");
    });

    it("should throw on nested arrays", () => {
      expect(() => ident([["a", "b"], "c"])).toThrow(
        "Nested array to grouped list conversion is not supported for SQL identifier"
      );
    });
  });

  describe("literal()", () => {
    it("should handle null/undefined", () => {
      expect(literal(null)).toBe("NULL");
      expect(literal(undefined)).toBe("NULL");
    });

    it("should handle booleans", () => {
      expect(literal(true)).toBe("'t'");
      expect(literal(false)).toBe("'f'");
    });

    it("should handle numbers", () => {
      expect(literal(42)).toBe("'42'");
      expect(literal(3.14)).toBe("'3.14'");
      expect(literal(-100)).toBe("'-100'");
    });

    it("should handle strings", () => {
      expect(literal("hello")).toBe("'hello'");
      expect(literal("")).toBe("''");
    });

    it("should escape quotes", () => {
      expect(literal("it's")).toBe("'it''s'");
      expect(literal("say 'hello'")).toBe("'say ''hello'''");
    });

    it("should handle backslashes", () => {
      expect(literal("path\\to\\file")).toBe("E'path\\\\to\\\\file'");
    });

    it("should handle dates", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      expect(literal(date)).toBe("'2024-01-15 10:30:00.000+00'");
    });

    it("should handle buffers", () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03]);
      expect(literal(buffer)).toBe("E'\\\\x010203'");
    });

    it("should handle arrays", () => {
      expect(literal([1, 2, 3])).toBe("'1', '2', '3'");
      expect(literal(["a", "b", "c"])).toBe("'a', 'b', 'c'");
      expect(literal([true, false, null])).toBe("'t', 'f', NULL");
    });

    it("should handle nested arrays", () => {
      expect(literal([[1, 2], [3, 4]])).toBe("('1', '2'), ('3', '4')");
      expect(literal([["a", "b"], ["c", "d"]])).toBe("('a', 'b'), ('c', 'd')");
    });

    it("should handle objects as JSONB", () => {
      expect(literal({ name: "John", age: 30 })).toBe('\'{"name":"John","age":30}\'::jsonb');
      expect(literal({ items: [1, 2, 3] })).toBe('\'{"items":[1,2,3]}\'::jsonb');
    });
  });

  describe("string()", () => {
    it("should handle null/undefined", () => {
      expect(string(null)).toBe("");
      expect(string(undefined)).toBe("");
    });

    it("should handle booleans", () => {
      expect(string(true)).toBe("t");
      expect(string(false)).toBe("f");
    });

    it("should handle numbers", () => {
      expect(string(42)).toBe("42");
      expect(string(3.14)).toBe("3.14");
    });

    it("should handle strings without quotes", () => {
      expect(string("hello")).toBe("hello");
      expect(string("hello world")).toBe("hello world");
    });

    it("should handle dates", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      expect(string(date)).toBe("2024-01-15 10:30:00.000+00");
    });

    it("should handle buffers", () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03]);
      expect(string(buffer)).toBe("\\x010203");
    });

    it("should handle arrays", () => {
      expect(string([1, 2, 3])).toBe("1, 2, 3");
      expect(string(["a", "b", "c"])).toBe("a, b, c");
    });

    it("should handle nested arrays", () => {
      expect(string([[1, 2], [3, 4]])).toBe("(1, 2), (3, 4)");
    });

    it("should handle objects as JSON", () => {
      expect(string({ name: "John", age: 30 })).toBe('{"name":"John","age":30}');
    });
  });

  describe("withArray()", () => {
    it("should format with array of values", () => {
      expect(withArray("SELECT %I FROM %I WHERE %I = %L", ["name", "users", "id", 1])).toBe(
        "SELECT name FROM users WHERE id = '1'"
      );
    });

    it("should handle empty array", () => {
      expect(withArray("SELECT * FROM users", [])).toBe("SELECT * FROM users");
    });
  });

  describe("config()", () => {
    it("should allow custom patterns", () => {
      config({ pattern: { ident: "i", literal: "l", string: "S" } });
      
      expect(format("SELECT %i FROM users WHERE name = %l", "id", "John")).toBe(
        "SELECT id FROM users WHERE name = 'John'"
      );
      
      expect(format("SELECT * FROM %S", "users")).toBe("SELECT * FROM users");
      
      // Reset to defaults
      config({});
    });
  });
});