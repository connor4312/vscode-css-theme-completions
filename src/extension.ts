import * as vscode from 'vscode';

const enum Constants {
  FileName = 'data.json',
  LastUpdatedKey = 'lastUpdated',

  VarPrefix = 'var(',
  ThemeVarPrefix = '--vscode-',

  SettingSection = 'cssThemeCompletions',
  UrlSetting = 'dataUrl',
  RefreshIntervalSetting = 'dataRefreshInterval',
  DefaultUrl = 'https://vsccssthemecompletions.blob.core.windows.net/out/latest.json',
  DefaultRefresh = 7,
}

const cssVarRe = /^\s*--([a-z0-9_-]*)/i;

interface IColorData {
  key: string;
  description: string | null;
}

export function activate(context: vscode.ExtensionContext): void {
  let cachedColors: Promise<IColorData[] | undefined> | undefined;

  /**
   * Retrieves color data, either from a local cache or requesting them anew.
   */
  const retrieveItems = async () => {
    cachedColors ??= (async () => {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse('vscode://schemas/workbench-colors'));
        const contents = JSON.parse(doc.getText());

        return Object.entries(contents.properties).map(([key, value]) => ({
          description: (value as { description: string }).description,
          key: key.replace(/\./g, '-'),
        }));
      } catch (e) {
        console.error('error fetching updated vscode theme colors:', e);
        return [];
      }
    })();

    return cachedColors;
  };

  /**
   * Completion provider for colors.
   */
  const provider = vscode.languages.registerCompletionItemProvider(
    [
      { language: 'css' },
      { language: 'less' },
      { language: 'scss' },
      { language: 'stylus' },
      { language: 'sass' },
      { language: 'html' },
    ],
    {
      async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const line = document.lineAt(position).text;
        const varExprStart = document
          .lineAt(position)
          .text.lastIndexOf(Constants.VarPrefix, position.character);
        if (varExprStart === -1) {
          return;
        }

        const varMatch = cssVarRe.exec(line.slice(varExprStart + Constants.VarPrefix.length));
        if (!varMatch) {
          return;
        }

        const colors = await retrieveItems();
        if (!colors) {
          return [];
        }

        const currentTheme = vscode.window.activeColorTheme.kind;
        const varStart = new vscode.Position(
          position.line,
          varExprStart + Constants.VarPrefix.length,
        );
        const varEnd = varStart.translate(0, varMatch[0].length);

        return colors.map((c) => {
          const item = new vscode.CompletionItem(
            Constants.ThemeVarPrefix + c.key,
            vscode.CompletionItemKind.Color,
          );
          item.range = new vscode.Range(varStart, varEnd);
          if (c.description) {
            item.detail = c.description;
          }

          return item;
        });
      },
    },
    'var(--vs',
  );

  context.subscriptions.push(provider);
}
