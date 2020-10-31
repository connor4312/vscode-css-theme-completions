import { AzureFunction, Context } from '@azure/functions';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import got from 'got';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pipeline } from 'stream';
import * as ts from 'typescript';
import { Extract as extract } from 'unzipper';
import { promisify } from 'util';

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
  const dir = await fetchSources();
  context.log('Sources fetched');
  const colors = await enumerate(dir, context);
  context.log(`Enumerated ${colors.length} colors`);
  context.bindings.outputBlob = JSON.stringify(colors);
  context.done();
};

export default timerTrigger;

async function fetchSources() {
  const target = join(tmpdir(), `vscode-main-${randomBytes(8).toString('hex')}`);
  await promisify(pipeline)(
    got.stream('https://github.com/microsoft/vscode/archive/master.zip'),
    extract({ path: target }),
  );

  return join(target, 'vscode-master');
}

const readJson = async (filePath: string) => {
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents);
};

const walkVscode = async (vscodePath: string, traverse: (file: ts.SourceFile) => void) => {
  const basePath = resolve(vscodePath, 'src', 'vs');
  const configPath = ts.findConfigFile(basePath, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) {
    throw new Error(`Could not find expected tsconfig.json file`);
  }

  const compiler = ts.createCompilerHost(await readJson(configPath), true);
  const queue: string[] = [basePath];
  while (queue.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const entry = queue.shift()!;
    if ((await fs.stat(entry)).isDirectory()) {
      const children = await fs.readdir(entry);
      queue.push(...children.map((c) => join(entry, c)));
    } else if (entry.endsWith('.ts')) {
      const file = compiler.getSourceFile(entry, ts.ScriptTarget.ES2020);
      if (file) {
        traverse(file);
      }
    }
  }
};

async function enumerate(dir: string, context: Context) {
  const seen = new Set<string>();
  const items: { description: string; key: string; default: object | string | null }[] = [
    { key: 'font-family', description: '', default: 'sans-serif' },
    { key: 'font-weight', description: '', default: '400' },
    { key: 'font-size', description: '', default: '14' },
    { key: 'editor-font-family', description: '', default: 'monospace' },
    { key: 'editor-font-weight', description: '', default: '400' },
    { key: 'editor-font-size', description: '', default: '14' },
  ];

  const extract = (node: ts.Node): boolean => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'registerColor'
    ) {
      return false;
    }

    const [name, defaultValue, descriptionCall] = node.arguments;
    if (!ts.isStringLiteral(name)) {
      context.log(`Line did not have string literal name: ${node.getText()}`);
      return false;
    }

    if (seen.has(name.text)) {
      return true;
    }

    seen.add(name.text);

    let description: string | undefined;
    if (ts.isStringLiteralLike(descriptionCall)) {
      description = descriptionCall.text;
    } else if (
      ts.isCallExpression(descriptionCall) &&
      ts.isStringLiteralLike(descriptionCall.arguments[1])
    ) {
      // nls.localize(...)
      description = (descriptionCall.arguments[1] as ts.StringLiteralLike).text;
    } else {
      context.log(`Could not get description for: ${node.getText()}`);
    }

    let parsedDefault: null | object;
    try {
      parsedDefault = new Function(`return ${defaultValue.getText()}`)();
    } catch {
      parsedDefault = null;
    }

    items.push({ description, key: name.text.replace('.', '-'), default: parsedDefault });
    return true;
  };

  await walkVscode(dir, (file) => {
    const traverse = (node: ts.Node) => {
      if (!extract(node)) {
        ts.forEachChild(node, traverse);
      }
    };

    traverse(file);
  });

  return items;
}
