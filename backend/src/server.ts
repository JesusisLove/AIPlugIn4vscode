import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { streamClaude } from './adapters/claude';
import { streamOllama } from './adapters/ollama';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ヘルスチェック
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.0.1' });
});

// チャットエンドポイント（SSEストリーミング）
app.post('/chat', async (req: Request, res: Response) => {
    const { message, model } = req.body as { message: string; model: string };

    if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
    }

    // SSEヘッダー設定
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        switch (model) {
            case 'ollama':
                await streamOllama(message, res);
                break;
            case 'claude':
            default:
                await streamClaude(message, res);
                break;
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.write('data: [DONE]\n\n');
    } finally {
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
    console.log(`claude CLI: ${process.env.CLAUDE_PATH || 'claude'}`);
});
