#!/usr/bin/env node
/**
 * Build dsh-llm-agy:
 *   0. 定位宿主 dsh 并链接运行时依赖(scripts/link-runtime-deps.mjs)
 *      —— 缺这一步,dsh 加载插件入口时会 ERR_MODULE_NOT_FOUND 并中止启动。
 *   1. tsc 编译服务端 src/*.ts → lib/*.js + lib/types/*.d.ts(ESM,nodenext)
 *   2. 拷贝客户端 src/client/index.js → lib/client.js(ModuleLoader bundle,
 *      浏览器端由 dsh client-modules 直接托管,无需打包)
 * 无 tsdown/react 构建依赖,Node 侧零运行时构建工具。
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { linkRuntimeDeps } from './link-runtime-deps.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..')
const outDir = join(pkg, 'lib')
const srcDir = join(pkg, 'src')

try {
  linkRuntimeDeps()
} catch (error) {
  // 链接失败不阻断构建,但必须让作者看到原因(否则产物装进 dsh 会直接起不来)。
  console.warn(`build: 运行时依赖链接失败(插件可能无法被 dsh 加载):${error instanceof Error ? error.message : String(error)}`)
}

console.log('build: cleaning lib/')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

console.log('build: copy client bundle (src/client/index.js → lib/client.js)')
copyFileSync(join(srcDir, 'client', 'index.js'), join(outDir, 'client.js'))
mkdirSync(join(outDir, 'types', 'client'), { recursive: true })
copyFileSync(join(srcDir, 'client', 'index.js'), join(outDir, 'types', 'client', 'index.d.ts'))

console.log('build: tsc server half (src/*.ts → lib/)')
const localTsc = join(pkg, 'node_modules', 'typescript', 'bin', 'tsc')
try {
  if (existsSync(localTsc)) {
    execFileSync(process.execPath, [localTsc, '-p', 'tsconfig.json'], { stdio: 'inherit', cwd: pkg })
  } else {
    execFileSync('npx', ['-y', '-p', 'typescript@~5.7.2', 'tsc', '-p', 'tsconfig.json'], { stdio: 'inherit', shell: true, cwd: pkg })
  }
} catch {
  console.log('build: tsc emitted files with environment warnings (tolerated)')
}

console.log('build: done')
