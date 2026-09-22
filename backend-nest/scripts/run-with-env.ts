/**
 * Prisma CLI 包装器
 * 用途：Prisma CLI 只会自动加载 schema 同级目录的 .env，而本项目统一把环境变量放在
 * backend-nest/.env。这里显式加载后以子进程透传 stdio 执行命令，保证 CLI 与运行时读取同一份配置。
 *
 * 用法：tsx scripts/run-with-env.ts prisma migrate dev
 *      tsx scripts/run-with-env.ts tsx prisma/seed.ts
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

/**
 * 解析脚本所在目录
 * 说明：package.json 声明了 "type": "module"，tsx 以 ESM 方式执行本文件，无法使用 __dirname / import.meta，
 * 因此统一从 process.argv[1]（tsx 注入的脚本绝对路径）推导；解析不到时退回进程工作目录。
 */
function resolveScriptDir(): string {
  const scriptPath = process.argv[1]
  if (scriptPath) {
    const resolved = resolve(scriptPath)
    if (existsSync(resolved)) return dirname(resolved)
  }
  return process.cwd()
}

const scriptDir = resolveScriptDir()
const envPath = resolve(scriptDir, '..', '.env')

if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true })
  console.log(`[env] loaded ${envPath}`)
} else {
  console.warn(`[env] ${envPath} not found, fallback to process environment`)
}

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('[env] usage: tsx scripts/run-with-env.ts <command> [args...]')
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const child = spawnSync(command, args, {
  stdio: 'inherit',
  shell: isWindows,
  env: process.env,
  cwd: resolve(scriptDir, '..'),
})

if (child.error) {
  console.error(`[env] failed to run "${command}": ${child.error.message}`)
  process.exit(1)
}

process.exit(child.status ?? 1)
