import fetch from 'node-fetch';
import * as vscode from 'vscode';

// todo: https://github.com/microsoft/TypeScript/issues/31535
declare const TextEncoder: typeof import('util').TextEncoder;
declare const TextDecoder: typeof import('util').TextDecoder;

const enum Constants {
  FileName = 'data.json',
  LastUpdatedKey = 'lastUpdated',

  VarPrefix = 'var(',

  SettingSection = 'cssThemeCompletions',
  UrlSetting = 'dataUrl',
  RefreshIntervalSetting = 'dataRefreshInterval',
  DefaultUrl = 'https://vsccssthemecompletions.blob.core.windows.net/out/latest.json',
  DefaultRefresh = 7,
}

const msPerDay = 1000 * 60 * 60 * 24;
const shouldDisplayRe = /^\s*-?-?v?s?c?o?d?e?-?/;

interface IColorData {
  key: string;
  description: string | null;
  default: null | string | { light: string | null; dark: string | null; hc: string | null };
}

export function activate(context: vscode.ExtensionContext): void {
  const storageFile = vscode.Uri.joinPath(context.globalStorageUri, Constants.FileName);
  const settings = vscode.workspace.getConfiguration(Constants.SettingSection);
  let cachedColors: Promise<IColorData[] | undefined> | undefined;

  /**
   * Retrieves color data, either from a local cache or requesting them anew.
   */
  const retrieveItems = async () => {
    const colors = await readExistingColors();
    const updatedAt = context.globalState.get(Constants.LastUpdatedKey, 0);
    const refreshMs =
      settings.get(Constants.RefreshIntervalSetting, Constants.DefaultRefresh) * msPerDay;
    if (colors && Date.now() - updatedAt < refreshMs) {
      return colors;
    }

    const fetched = fetchUpdatedColors();
    return colors || (await fetched); // return cached colors while the update is going, if possible
  };

  /**
   * Retrieves colors and updates cached data.
   */
  const fetchUpdatedColors = async (): Promise<IColorData[] | undefined> => {
    return (cachedColors = (async () => {
      try {
        const res = await fetch(settings.get(Constants.UrlSetting, Constants.DefaultUrl));
        if (!res.ok) {
          console.error('error fetching updated vscode theme colors:', await res.text());
          return;
        }

        const contents = await res.text();
        await vscode.workspace.fs.writeFile(storageFile, new TextEncoder().encode(contents));
        await context.globalState.update(Constants.LastUpdatedKey, Date.now());
        return JSON.parse(contents);
      } catch (e) {
        console.error('error fetching updated vscode theme colors:', e);
      }
    })());
  };

  /**
   * Retrieves colors from the filesystem cache.
   */
  const readExistingColors = () => {
    if (!cachedColors) {
      cachedColors = (async (): Promise<IColorData[] | undefined> => {
        try {
          const contents = await vscode.workspace.fs.readFile(storageFile);
          const text = new TextDecoder('utf-8').decode(contents);
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      })();
    }

    return cachedColors;
  };

  const resolveColor = (color: IColorData, theme: vscode.ColorThemeKind) => {
    if (!color.default) {
      return null;
    }

    if (typeof color.default === 'string') {
      return color.default;
    }

    if (theme === vscode.ColorThemeKind.HighContrast && color.default.hc) {
      return color.default.hc;
    }

    return color.default[theme === vscode.ColorThemeKind.Light ? 'light' : 'dark'];
  };

  /**
   * Completion provider for colors.
   */
  const provider = vscode.languages.registerCompletionItemProvider(
    [{ language: 'css' }, { language: 'less' }, { language: 'scss' }, { language: 'stylus' }],
    {
      async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const line = document.lineAt(position).text;
        const varExprStart = document
          .lineAt(position)
          .text.lastIndexOf(Constants.VarPrefix, position.character);
        if (varExprStart === -1) {
          return;
        }

        const varStart = varExprStart + Constants.VarPrefix.length;
        if (!shouldDisplayRe.test(line.slice(varStart))) {
          return;
        }

        const colors = await retrieveItems();
        if (!colors) {
          return [];
        }

        const currentTheme = vscode.window.activeColorTheme.kind;

        return colors.map((c) => {
          const color = resolveColor(c, currentTheme);
          const item = new vscode.CompletionItem(
            `--vscode-${c.key}`,
            vscode.CompletionItemKind.Color,
          );
          if (color) {
            item.documentation = color;
          }

          if (c.description) {
            item.detail = c.description;
          }

          return item;
        });
      },
    },
    'var(',
  );

  context.subscriptions.push(provider);
}
