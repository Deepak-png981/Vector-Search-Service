import fs from 'fs';
import path from 'path';
import logger from './logger';

export interface CodeChunk {
  content: string;
  filePath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
}

export const shouldProcessFile = (filePath: string): boolean => {
  const extensions = [
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
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
};

export const chunkFile = async (filePath: string, chunkSize = 500): Promise<CodeChunk[]> => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];

    let currentChunk = '';
    let lineCount = 0;
    let chunkIndex = 0;
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk += line + '\n';
      lineCount += 1;

      if (lineCount >= chunkSize || i === lines.length - 1) {
        chunks.push({
          content: currentChunk,
          filePath,
          chunkIndex,
          startLine,
          endLine: startLine + lineCount - 1,
        });

        currentChunk = '';
        chunkIndex += 1;
        startLine += lineCount;
        lineCount = 0;
      }
    }

    return chunks;
  } catch (error) {
    logger.error({ error, filePath }, 'Error chunking file');
    return [];
  }
};

const IGNORED_DIRS = [
  // VCS
  '.git',
  '.svn',
  '.hg',

  // Node / JS
  'node_modules',

  // Python
  '__pycache__',
  'venv',
  '.venv',
  'env',

  // Java / JVM
  'target',

  // Build / Artifacts
  'dist',
  'build',
  'out',
  'coverage',

  // Package managers / vendors
  'vendor',

  // IDE / Editor
  '.idea',
  '.vscode',

  // CMake
  'CMakeFiles',
  'cmake-build-debug',
];
export const walkAndChunkDirectory = async (
  directoryPath: string,
  chunkSize = 500,
): Promise<CodeChunk[]> => {
  const chunks: CodeChunk[] = [];

  const processDirectory = async (dirPath: string): Promise<void> => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
            await processDirectory(fullPath);
          }
        } else if (entry.isFile() && shouldProcessFile(fullPath)) {
          const fileChunks = await chunkFile(fullPath, chunkSize);
          chunks.push(...fileChunks);
        }
      }
    } catch (error) {
      logger.error({ error, dirPath }, 'Error processing directory');
    }
  };
  await processDirectory(directoryPath);
  return chunks;
};
