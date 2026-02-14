import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { watch } from 'chokidar';
import { createJiti } from 'jiti';
import type { Rule, RuleConfig } from './types.js';
import type { TransformModule } from '../transforms/types.js';

const jiti = createJiti(import.meta.url, { interopDefault: true });

export class RuleLoader extends EventEmitter {
  private rulesDir: string;
  private rules = new Map<string, Rule>();
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(rulesDir: string) {
    super();
    this.rulesDir = rulesDir;
  }

  async start() {
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }

    await this.loadAll();

    this.watcher = watch(this.rulesDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('unlink', (filePath) => this.handleFileRemove(filePath));
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
  }

  getRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  getRule(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  private async loadAll() {
    const files = fs.readdirSync(this.rulesDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      await this.loadRuleFromFile(path.join(this.rulesDir, file));
    }
  }

  private async handleFileChange(filePath: string) {
    const ext = path.extname(filePath);

    if (ext === '.json') {
      await this.loadRuleFromFile(filePath);
    } else if (ext === '.ts' || ext === '.js') {
      // Transform file changed — reload associated rule
      const baseName = path.basename(filePath, ext);
      const jsonPath = path.join(this.rulesDir, baseName + '.json');
      if (fs.existsSync(jsonPath)) {
        await this.loadRuleFromFile(jsonPath);
      }
    }

    this.emit('change', this.getRules());
  }

  private handleFileRemove(filePath: string) {
    const ext = path.extname(filePath);
    if (ext !== '.json') return;

    const baseName = path.basename(filePath, ext);
    const id = `file:${baseName}`;
    this.rules.delete(id);
    this.emit('change', this.getRules());
  }

  private async loadRuleFromFile(jsonPath: string): Promise<Rule | null> {
    const baseName = path.basename(jsonPath, '.json');
    const id = `file:${baseName}`;

    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      const config = JSON.parse(content) as RuleConfig;

      let transform: TransformModule | undefined;

      // Look for matching .ts or .js transform
      const transformName = config.transform || baseName;
      const tsPath = path.join(this.rulesDir, transformName + '.ts');
      const jsPath = path.join(this.rulesDir, transformName + '.js');

      const transformPath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(jsPath) ? jsPath : null;

      if (transformPath) {
        try {
          // Clear jiti cache for hot-reload
          const resolvedPath = path.resolve(transformPath);
          delete jiti.cache?.[resolvedPath];
          transform = (await jiti.import(resolvedPath, { default: true })) as TransformModule;
        } catch (err) {
          console.error(`[rule-loader] Failed to load transform ${transformPath}:`, (err as Error).message);
          const rule: Rule = {
            id,
            source: 'file',
            config,
            filePath: jsonPath,
            enabled: false,
            error: `Transform load error: ${(err as Error).message}`,
          };
          this.rules.set(id, rule);
          return rule;
        }
      }

      const rule: Rule = {
        id,
        source: 'file',
        config,
        transform,
        filePath: jsonPath,
        enabled: config.enabled !== false,
      };

      this.rules.set(id, rule);
      this.emit('rule-loaded', rule);
      return rule;
    } catch (err) {
      console.error(`[rule-loader] Failed to load rule ${jsonPath}:`, (err as Error).message);
      return null;
    }
  }
}
