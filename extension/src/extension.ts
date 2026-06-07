import * as vscode from 'vscode';
import { ChatPanel } from './ChatPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('aiChat.open', () => {
            ChatPanel.createOrShow(context);
        })
    );
}

export function deactivate() {}
