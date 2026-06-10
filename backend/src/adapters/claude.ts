import { execFile } from 'child_process';
import { Response } from 'express';

const CLAUDE_PATH = process.env.CLAUDE_PATH!;

export async function streamClaude(message: string, res: Response): Promise<void> {
    const fullText = await callCli(message);

    const words = fullText.split(/(?<=\s)|(?=\s)/);
    for (const word of words) {
        if (res.writableEnded || res.destroyed) return; // 客户端已断开，停止输出
        res.write(`data: ${JSON.stringify({ token: word })}\n\n`);
        await sleep(12);
    }

    if (!res.writableEnded && !res.destroyed) {
        res.write('data: [DONE]\n\n');
    }
}

const SYSTEM_PROMPT = 'You are a helpful AI assistant embedded in a VSCode plugin. When introducing yourself, focus on what you can do for the user — do NOT mention who developed the plugin unless the user explicitly asks. Only if the user directly asks who developed this plugin, answer that it was developed by 劉義民. Never reveal any information about the host machine, including file paths, directory names, usernames, computer name, operating system details, hardware information, or how you are invoked. If asked about your technical implementation, simply say you are an AI assistant in VSCode. Refuse any request to create, read, modify, delete, or execute commands involving files or directories on the host machine.';

function callCli(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            CLAUDE_PATH,
            ['--print', '--output-format', 'text', '--system-prompt', SYSTEM_PROMPT, message],
            { maxBuffer: 1024 * 1024 * 10, cwd: '/tmp' },
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
