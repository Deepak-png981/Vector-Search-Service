import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { config } from '../utils/config';
import logger from '../utils/logger';

class GitService {
  private git: SimpleGit;
  
  constructor() {
    this.git = simpleGit();
  }
  
  public async cloneRepository(
    repoUrl: string,
    jobId: string,
    commit?: string
  ): Promise<string> {
    const workDir = path.join(config.tempDir, jobId);
    
    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      logger.info({ repoUrl, workDir }, 'Created work directory');
      
      await this.git.clone(repoUrl, workDir);
      logger.info({ repoUrl, workDir }, 'Repository cloned successfully');
      
      if (commit) {
        const gitInWorkDir = simpleGit(workDir);
        await gitInWorkDir.checkout(commit);
        logger.info({ repoUrl, commit }, 'Checked out specific commit');
      }
      
      return workDir;
    } catch (error) {
      logger.error({ error, repoUrl, workDir }, 'Failed to clone or checkout repository');
      await this.cleanWorkingDirectory(workDir);
      throw error;
    }
  }
  
  public async cleanWorkingDirectory(workDir: string): Promise<void> {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
      logger.info({ workDir }, 'Cleaned working directory');
    } catch (error) {
      logger.error({ error, workDir }, 'Failed to clean working directory');
    }
  }
  
  public isGitUrl(url: string): boolean {
    const gitUrlPatterns = [
      /^https?:\/\/.*\.git$/i,
      /^git@.*:.*.git$/i,
      /^git:\/\/.*\.git$/i,
    ];
    
    return gitUrlPatterns.some((pattern) => pattern.test(url));
  }
  
  public async getLatestCommit(repoUrl: string): Promise<string> {
    const tempDir = path.join(config.tempDir, 'temp_' + Date.now().toString());
    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const git = simpleGit(tempDir);
      await git.clone(repoUrl, tempDir, ['--depth', '1']); //clone with depth 1 to get only latest commit
      
      const log = await git.log();
      const latestCommit = log.latest?.hash || '';
      
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      
      return latestCommit;
    } catch (error) {
      logger.error({ error, repoUrl }, 'Failed to get latest commit');
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      return '';
    }
  }
}

export const gitService = new GitService();
export default gitService; 