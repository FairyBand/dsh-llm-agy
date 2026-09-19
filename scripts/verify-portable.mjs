#!/usr/bin/env node
/**
 * verify:portable — 无依赖可移植性验证。
 * 验证 clone 后(lib/ 已提交)包是否可直接被 dsh 装配:
 *   1. lib/ 产物齐全(服务端入口 + 客户端 bundle + 类型声明)
 *   2. exports 指向的每个文件都存在
 *   3. cordis.patch.yml 引用的包名一致
 *   4. 运行时依赖已链接(node_modules/@deepseek-ai/*)—— 缺了 dsh 启动会直接中止
 *   5. lib/index.js 可被 import 且导出 apply/inject/name
 * 零依赖(node 内置模块),任何环境可跑。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..')
let failed = false
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`) }
const pass = (msg) => console.log(`✓ ${msg}`)

const p = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))

// 1. lib 产物
const required = [
  p.main,
  p.exports['./client'].default,
  p.exports['.'].types,
]
for (const rel of required) {
  if (existsSync(join(pkg, rel))) pass(`存在 ${rel}`)
  else fail(`缺失 ${rel}`)
}

// 2. client bundle 完整性
const clientPath = join(pkg, p.exports['./client'].default)
if (existsSync(clientPath)) {
  const clientSrc = readFileSync(clientPath, 'utf8')
  if (clientSrc.includes('window.__ModuleLoader__.load')) pass('客户端 bundle 为 ModuleLoader 格式')
  else fail('客户端 bundle 缺少 __ModuleLoader__.load')
}

// 3. patch 包名一致
const patch = readFileSync(join(pkg, 'cordis.patch.yml'), 'utf8')
if (patch.includes(p.name)) pass(`cordis.patch.yml 引用包名 ${p.name}`)
else fail('cordis.patch.yml 与 package.json name 不一致')

// 4. 运行时依赖:服务端入口 import 的宿主包必须能从本包解析到。
//    dsh 以 link 方式装配时,Node 从本目录向上找 node_modules;缺包会让
//    dsh 在启动阶段抛 ERR_MODULE_NOT_FOUND 并整体中止(必须卸载插件才能启动)。
const runtimeDeps = [
  '@deepseek-ai/schemastery',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-util-values',
]
const missingDeps = runtimeDeps.filter((name) => !existsSync(join(pkg, 'node_modules', ...name.split('/'))))
if (missingDeps.length === 0) {
  pass(`运行时依赖已就位(${runtimeDeps.length} 个)`)
} else {
  fail(
    `缺少运行时依赖: ${missingDeps.join(', ')}\n`
    + '  → 运行 `node scripts/link-runtime-deps.mjs`(或 `pnpm run link:runtime`)'
    + '把宿主 dsh 的包链接进来;缺依赖时 dsh 加载插件会直接失败。',
  )
}

// 5. 服务端入口可 import
const entryAbs = join(pkg, p.main)
const entryPath = new URL(`file:///${entryAbs.replace(/\\/g, '/')}`).href
try {
  const m = await import(entryPath)
  if (typeof m.apply === 'function' && Array.isArray(m.inject) && typeof m.name === 'string') {
    pass(`lib 入口导出 apply/inject/name (${m.name})`)
  } else fail('lib 入口缺少 apply/inject/name 导出')
} catch (e) {
  fail(`lib 入口 import 失败: ${String(e).slice(0, 300)}`)
}

if (failed) {
  console.error('\nverify:portable 失败 — 包不可直接装配。')
  process.exit(1)
}
console.log('\nverify:portable 通过 — 包可直接被 dsh plugin add 装配。')
