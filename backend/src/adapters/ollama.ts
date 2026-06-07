import * as http from 'http';
import * as https from 'https';
import { Response } from 'express';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL!;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL!;

export async function streamOllama(message: string, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
        const url = new URL(`${OLLAMA_BASE_URL}/chat/completions`);
        const body = JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: 'user', content: message }],
            stream: true,
        });

        const transport = url.protocol === 'https:' ? https : http;

        const req = transport.request(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (ollamaRes) => {
                let buffer = '';

                ollamaRes.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        if (!trimmed.startsWith('data: ')) continue;
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const token = json.choices?.[0]?.delta?.content;
                            if (token) {
                                res.write(`data: ${JSON.stringify({ token })}\n\n`);
                            }
                        } catch {
                            // skip malformed chunks
                        }
                    }
                });

                ollamaRes.on('end', () => {
                    res.write('data: [DONE]\n\n');
                    resolve();
                });

                ollamaRes.on('error', reject);
            }
        );

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
