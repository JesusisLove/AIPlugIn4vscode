import * as vscode from 'vscode';
import * as http from 'http';

export class ChatPanel {
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentRequest: http.ClientRequest | null = null;
    private _stopping = false;

    public static createOrShow(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel(
            'aiChat',
            'AI 助手',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        new ChatPanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, _context: vscode.ExtensionContext) {
        this._panel = panel;
        this._panel.webview.html = this._getHtml();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                if (message.type === 'sendMessage') {
                    this._handleUserMessage(message.text, message.model);
                } else if (message.type === 'stopGeneration') {
                    this._stopping = true;
                    this._currentRequest?.destroy();
                    this._currentRequest = null;
                    this._panel.webview.postMessage({ type: 'streamEnd' });
                }
            },
            null,
            this._disposables
        );
    }

    private _handleUserMessage(text: string, model: string) {
        this._stopping = false;
        const postData = JSON.stringify({ message: text, model });

        const rawUrl = vscode.workspace.getConfiguration('aiAssistant').get<string>('backendUrl') || 'http://localhost:3000';
        const backendUrl = new URL(rawUrl);

        const req = http.request(
            {
                hostname: backendUrl.hostname,
                port: parseInt(backendUrl.port) || 3000,
                path: '/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'Content-Length': Buffer.byteLength(postData),
                },
            },
            (res) => {
                this._panel.webview.postMessage({ type: 'streamStart' });

                res.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                this._currentRequest = null;
                                this._panel.webview.postMessage({ type: 'streamEnd' });
                                return;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.token) {
                                    this._panel.webview.postMessage({
                                        type: 'streamToken',
                                        token: parsed.token,
                                    });
                                }
                            } catch {
                                // ignore parse errors
                            }
                        }
                    }
                });

                res.on('end', () => {
                    this._currentRequest = null;
                    this._panel.webview.postMessage({ type: 'streamEnd' });
                });
            }
        );

        req.on('error', (err: Error) => {
            this._currentRequest = null;
            if (this._stopping) {
                this._stopping = false;
                return;
            }
            this._panel.webview.postMessage({
                type: 'error',
                message: `连接后端失败：${err.message}\n请确认后端服务器已启动（npm run dev）`,
            });
        });

        this._currentRequest = req;
        req.write(postData);
        req.end();
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 助手</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1e1e1e;
    color: #cccccc;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ヘッダー */
  #header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #252526;
    border-bottom: 1px solid #3e3e3e;
    flex-shrink: 0;
  }
  #header h1 {
    font-size: 13px;
    font-weight: 600;
    color: #cccccc;
  }
  #model-select {
    background: #3c3c3c;
    color: #cccccc;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }
  #model-select:hover { border-color: #007acc; }

  /* チャットエリア */
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    scroll-behavior: smooth;
  }
  #messages::-webkit-scrollbar { width: 6px; }
  #messages::-webkit-scrollbar-track { background: transparent; }
  #messages::-webkit-scrollbar-thumb { background: #424242; border-radius: 3px; }

  /* メッセージバブル */
  .message { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }

  .message.user { align-items: flex-end; }
  .message.user .bubble {
    background: #0e639c;
    color: #ffffff;
    border-radius: 12px 12px 2px 12px;
    padding: 8px 14px;
    max-width: 80%;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.assistant { align-items: flex-start; }
  .message.assistant .bubble {
    background: #2d2d2d;
    color: #cccccc;
    border-radius: 2px 12px 12px 12px;
    padding: 10px 14px;
    max-width: 90%;
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;
  }

  /* Markdownスタイル */
  .bubble code {
    background: #1e1e1e;
    color: #ce9178;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
  }
  .bubble pre {
    background: #1a1a1a;
    border: 1px solid #3e3e3e;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 6px 0;
  }
  .bubble pre code {
    background: none;
    color: #d4d4d4;
    padding: 0;
  }
  .bubble strong { color: #ffffff; }
  .bubble ul, .bubble ol { padding-left: 20px; margin: 4px 0; }
  .bubble li { margin: 2px 0; }
  .bubble p { margin: 4px 0; }
  .bubble h1,.bubble h2,.bubble h3 { color: #ffffff; margin: 8px 0 4px; }

  /* タイピングカーソル */
  .cursor {
    display: inline-block;
    width: 2px;
    height: 14px;
    background: #cccccc;
    margin-left: 2px;
    vertical-align: middle;
    animation: blink 0.8s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

  /* ステータスバー */
  #status {
    font-size: 11px;
    color: #888;
    padding: 0 16px 4px;
    height: 18px;
    flex-shrink: 0;
  }

  /* 入力エリア */
  #input-area {
    padding: 10px 12px;
    background: #252526;
    border-top: 1px solid #3e3e3e;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
  #input {
    flex: 1;
    background: #3c3c3c;
    color: #cccccc;
    border: 1px solid #555;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    outline: none;
    max-height: 120px;
    min-height: 36px;
    line-height: 1.5;
    overflow-y: auto;
  }
  #input:focus { border-color: #007acc; }
  #input::placeholder { color: #666; }

  #send-btn, #stop-btn {
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  #send-btn { background: #0e639c; }
  #send-btn:hover { background: #1177bb; }
  #send-btn:disabled { background: #3c3c3c; color: #666; cursor: not-allowed; }
  #stop-btn { background: #8b1a1a; display: none; }
  #stop-btn:hover { background: #b22222; }
</style>
</head>
<body>

<div id="header">
  <h1>AI 助手</h1>
  <select id="model-select">
    <option value="claude">Claude</option>
    <option value="ollama">Ollama</option>
  </select>
</div>

<div id="messages"></div>
<div id="status"></div>

<div id="input-area">
  <textarea id="input" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1"></textarea>
  <button id="send-btn">发送</button>
  <button id="stop-btn">停止</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusEl = document.getElementById('status');
  const modelSelect = document.getElementById('model-select');

  let isStreaming = false;
  let currentBubble = null;
  let currentText = '';
  let isComposing = false;
  let compositionResetTimer = null;

  inputEl.addEventListener('compositionstart', () => {
    isComposing = true;
    clearTimeout(compositionResetTimer);
  });
  // 延迟50ms重置，确保确认Enter的keydown能看到isComposing=true被拦截
  // 50ms足够让确认Enter触发，同时用户第二次按Enter时已超过该窗口
  inputEl.addEventListener('compositionend', () => {
    compositionResetTimer = setTimeout(() => { isComposing = false; }, 50);
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'stopGeneration' });
  });

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    isStreaming = true;
    appendMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    statusEl.textContent = '正在连接...';

    vscode.postMessage({
      type: 'sendMessage',
      text: text,
      model: modelSelect.value,
    });
  }

  function appendMessage(role, text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'user') {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMarkdown(text);
    }
    msgEl.appendChild(bubble);
    messagesEl.appendChild(msgEl);
    scrollToBottom();
    return bubble;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // シンプルなMarkdownレンダラー
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>')
      .replace(/\\n/g, '<br>');
  }

  // バックエンドからのメッセージ処理
  window.addEventListener('message', (event) => {
    const msg = event.data;

    if (msg.type === 'streamStart') {
      isStreaming = true;
      currentText = '';
      statusEl.textContent = 'AI 正在思考...';
      // 空バブル作成
      const msgEl = document.createElement('div');
      msgEl.className = 'message assistant';
      currentBubble = document.createElement('div');
      currentBubble.className = 'bubble';
      currentBubble.innerHTML = '<span class="cursor"></span>';
      msgEl.appendChild(currentBubble);
      messagesEl.appendChild(msgEl);
      scrollToBottom();
    }

    if (msg.type === 'streamToken' && currentBubble) {
      currentText += msg.token;
      currentBubble.innerHTML = renderMarkdown(currentText) + '<span class="cursor"></span>';
      scrollToBottom();
    }

    if (msg.type === 'streamEnd') {
      isStreaming = false;
      stopBtn.style.display = 'none';
      sendBtn.style.display = 'inline-block';
      statusEl.textContent = '';
      if (currentBubble) {
        currentBubble.innerHTML = renderMarkdown(currentText);
        currentBubble = null;
        currentText = '';
      }
    }

    if (msg.type === 'error') {
      isStreaming = false;
      stopBtn.style.display = 'none';
      sendBtn.style.display = 'inline-block';
      statusEl.textContent = '';
      appendMessage('assistant', '⚠️ ' + msg.message);
    }
  });
</script>
</body>
</html>`;
    }

    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}
