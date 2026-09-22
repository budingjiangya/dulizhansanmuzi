/**
 * 共享契约包的 CommonJS 加载垫片（必须在任何业务模块之前调用）
 *
 * 背景：@sanmuzi/contracts 是 "type": "module" 的工作区包，且其内部使用**无扩展名**的
 * 相对导入（export * from './core'）。Node 在 require(esm) 时不会为 ESM 解析无扩展名路径，
 * 直接运行编译产物会报 ERR_MODULE_NOT_FOUND。
 *
 * 解决方式：注册 require.extensions['.ts']，把该包的 TypeScript **源码**在加载时转译为
 * CommonJS，使无扩展名相对导入走 Node 自身的 CJS 解析算法，从而无需改动契约包即可运行。
 * 该策略与 tsx 在开发期采用的解析行为一致。
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

/** 契约包名（与 package.json 依赖声明保持一致） */
const CONTRACTS_PACKAGE = '@sanmuzi/contracts'

/** 标记：垫片只允许安装一次 */
let installed = false

/**
 * 解析契约包根目录
 * exports 字段禁止子路径解析时，退回到解析包入口（./src/index.ts），再向上寻找 package.json。
 */
function resolveContractsDir(localRequire: NodeRequire): string | null {
  let entryFile = ''
  try {
    entryFile = localRequire.resolve(`${CONTRACTS_PACKAGE}/package.json`)
  } catch {
    try {
      entryFile = localRequire.resolve(CONTRACTS_PACKAGE)
    } catch {
      return null
    }
  }
  if (!entryFile || !existsSync(entryFile)) return null

  let dir = dirname(entryFile)
  for (let depth = 0; depth < 4; depth += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function registerContractsLoader(): void {
  if (installed) return

  // createRequire(__filename)：无论从 backend-nest 还是 dist 运行都能解析到工作区依赖
  const localRequire = createRequire(__filename)
  const packageDir = resolveContractsDir(localRequire)
  if (!packageDir) return

  const contractsEntry = join(packageDir, 'src', 'index.ts')
  if (!existsSync(contractsEntry)) return

  const nodeRequire = localRequire as unknown as NodeRequire & {
    extensions: Record<string, unknown>
  }

  type TsLoader = ((module: NodeModule, filename: string) => void) & { __contractsShim?: boolean }
  const existing = nodeRequire.extensions?.['.ts'] as TsLoader | undefined
  if (typeof existing === 'function') {
    if (existing.__contractsShim === true) {
      installed = true
      return
    }
    throw new Error('检测到其他 TypeScript 运行时加载器，请勿同时使用 --require ts-node/register 等参数')
  }

  const loader: TsLoader = (module: NodeModule, filename: string): void => {
    // 仅接管契约包源码；业务代码已由 nest build 编译为 JS，不会走到这里
    if (!filename.replace(/\\/g, '/').includes('/contracts/src/')) {
      throw new Error(`未预期的 TypeScript 运行时加载：${filename}`)
    }

    const ts = localRequire('typescript') as typeof import('typescript')
    const source = readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        sourceMap: false,
        removeComments: false,
      },
      fileName: filename,
    }).outputText

    ;(module as unknown as { _compile: (code: string, file: string) => void })._compile(output, filename)
  }
  loader.__contractsShim = true
  nodeRequire.extensions['.ts'] = loader

  installed = true
}
