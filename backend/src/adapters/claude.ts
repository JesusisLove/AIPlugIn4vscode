import { execFile } from 'child_process';
import { Response } from 'express';

const CLAUDE_PATH = process.env.CLAUDE_PATH!;

export async function streamClaude(message: string, res: Response): Promise<void> {
    const fullText = await callCli(message);

    // 逐単語でストリーミング送信（タイピングエフェクト）
    const words = fullText.split(/(?<=\s)|(?=\s)/);
    for (const word of words) {
        res.write(`data: ${JSON.stringify({ token: word })}\n\n`);
        await sleep(12);
    }

    res.write('data: [DONE]\n\n');
}

function callCli(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            CLAUDE_PATH,
            ['--print', '--output-format', 'text', message],
            { maxBuffer: 1024 * 1024 * 10 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve(stdout.trim());
            }
        );
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
