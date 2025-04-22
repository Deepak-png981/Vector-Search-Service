export interface Vector {
    id: string;
    values: number[];
    metadata: {
        repoUrl: string;
        filePath: string;
        chunkIndex: number;
        commit: string;
        userId: string;
        startLine: number;
        endLine: number;
    };
}