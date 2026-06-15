import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as jsyaml from 'js-yaml';

// Bản sao hàm parseFrontmatter từ skill-parser.ts để thực hiện test PBT độc lập
function parseFrontmatter(content: string): { data: any; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, body: content };
  }

  const [, yamlString, body] = match;
  try {
    const data = jsyaml.load(yamlString) as any;
    return { data: data || {}, body };
  } catch (e) {
    return { data: {}, body: content };
  }
}

describe('Property-Based Testing với fast-check (TypeScript)', () => {
  it('Tính chất 1: Hàm parseFrontmatter KHÔNG bao giờ bị crash với mọi chuỗi đầu vào ngẫu nhiên', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        // Hành vi mong đợi: Hàm xử lý êm đẹp mọi loại dữ liệu lạ và trả về object cấu trúc chuẩn, không bao giờ ném lỗi (throw error)
        const result = parseFrontmatter(content);
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('body');
      }),
      { numRuns: 1000 } // Chạy 1000 bộ test case ngẫu nhiên tự động sinh ra
    );
  });

  it('Tính chất 2: Khi tạo chuỗi định dạng chuẩn, hàm phải trích xuất chính xác các thuộc tính YAML', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter(str => /^[a-zA-Z]+$/.test(str)), // Key chỉ chứa chữ cái
        fc.string({ minLength: 0, maxLength: 20 }).filter(str => /^[a-zA-Z0-9]+$/.test(str)), // Value chỉ chứa chữ và số
        fc.string(), // Phần body ngẫu nhiên
        (key, value, body) => {
          // Tạo chuỗi YAML frontmatter chuẩn
          const content = `---\n${key}: "${value}"\n---\n${body}`;

          const result = parseFrontmatter(content);

          // Kiểm tra xem trường key được parse ra có bằng đúng value ban đầu không
          expect(result.data[key]).toBe(value);
          expect(result.body).toBe(body);
        }
      ),
      { numRuns: 500 }
    );
  });
});
