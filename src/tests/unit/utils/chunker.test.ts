import { shouldProcessFile } from '../../../utils/chunker';

describe('Chunker Utils', () => {
  describe('shouldProcessFile', () => {
    const validExtensions = [
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.py',
      '.java',
      '.go',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.php',
      '.rb',
      '.swift',
      '.dart',
      '.json',
      '.yml',
      '.html',
      '.css',
    ];

    const invalidExtensions = [
      '.md',
      '.txt',
      '.yaml',
      '.lock',
      '.png',
      '.jpg',
      '.svg',
      '.pdf',
      '.doc',
      '.xls',
      '.csv',
      '.git',
      '.env',
      '.log',
      '.bak',
    ];

    test('should return true for valid code file extensions', () => {
      validExtensions.forEach((ext) => {
        const filePath = `/path/to/file${ext}`;
        expect(shouldProcessFile(filePath)).toBe(true);
      });
    });

    test('should return false for non-code file extensions', () => {
      invalidExtensions.forEach((ext) => {
        const filePath = `/path/to/file${ext}`;
        expect(shouldProcessFile(filePath)).toBe(false);
      });
    });

    test('should handle file paths with dots in directories', () => {
      expect(shouldProcessFile('/path/with.dot/file.js')).toBe(true);
      expect(shouldProcessFile('/path/with.dot/file.md')).toBe(false);
      expect(shouldProcessFile('.github/workflows/test.yml')).toBe(true);
    });

    test('should handle uppercase extensions', () => {
      expect(shouldProcessFile('/path/to/file.JS')).toBe(true);
      expect(shouldProcessFile('/path/to/file.TS')).toBe(true);
      expect(shouldProcessFile('/path/to/file.PY')).toBe(true);
    });

    test('should handle edge cases', () => {
      expect(shouldProcessFile('')).toBe(false);
      expect(shouldProcessFile('file')).toBe(false);
      expect(shouldProcessFile('.gitignore')).toBe(false);
      expect(shouldProcessFile('Dockerfile')).toBe(false);
      expect(shouldProcessFile('/path/to/.env')).toBe(false);
    });
  });
});
