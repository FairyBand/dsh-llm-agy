#!/usr/bin/env node
/**
 * link-profile:把插件安装(link)进一个 dsh profile,并先补齐宿主运行时依赖。
 * 用法:node scripts/link-profile.mjs [--profile web]
 * 等价于官方 `dsh plugin --profile <name> add <dir>`。
 *
 * 两个必要的处理:
 *   1. 先跑 link-runtime-deps:插件入口要 import 宿主 dsh 的包,缺链接时
 *      dsh 会在启动阶段抛 ERR_MODULE_NOT_FOUND 并整体中止。
 *   2. 仓库路径含空格时,dsh CLI 的参数解析会把路径拆开(实测会把
 *      `D:\DSH Working Dirs\dsh-llm-agy` 拆成 `D:\DSH` + `Working` + `Dirs\...`),
 *      而 pnpm 也不接受 file:// URL。因此在盘符根下自动建立一个无空格的
 *      junction 作为装配路径,pnpm 记录的 `link:` 指向它。
 *
 * lib/ 已随仓库提交,clone 后无需构建即可直接装配。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findDshInstall, linkRuntimeDeps } from './link-runtime-deps.mjs'

/** 解析真实路径;路径不可达时返回原值。 */
function realpathOrSelf(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** 为一个含空格的仓库路径挑一个无空格的装配路径:`<盘符>:\<目录名>`。 */
function pickLinkRoot(target) {
  const root = parse(target).root
  const leaf = target.slice(root.length).split(/[\\/]/).filter((part) => part !== '').pop() ?? 'dsh-plugin'
  return `${root}${leaf}`
}

/** 幂等地建立 junction(root → target);已指向同一目标时不动。 */
function ensureJunction(root, target) {
  const current = realpathOrSelf(root)
  if (existsSync(current) && current === target) return
  if (existsSync(root)) rmSync(root, { recursive: true, force: true })
  symlinkSync(target, root, 'junction')
  console.log(`link-profile: 已建立装配路径 ${root} → ${target}`)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(scriptDir, '..')
const profile = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : 'web'

// 1. 运行时依赖必须先就位,否则装完 dsh 反而起不来
console.log('link-profile: linking runtime dependencies first')
try {
  linkRuntimeDeps()
} catch (error) {
  console.error(`link-profile: 运行时依赖链接失败:${error instanceof Error ? error.message : String(error)}`)
  console.error('link-profile: 已中止,避免装出一个会让 dsh 无法启动的插件。')
  process.exit(1)
}

// 2. dsh CLI 的参数解析会把含空格的路径拆开(实测 `D:\DSH Working Dirs\x`
//    被拆成 `D:\DSH` + `Working` + `Dirs\x`),pnpm 也不接受 file:// URL。
//    因此当仓库路径含空格时,在盘符根下建一个无空格的 junction 作为装配路径。
const target = realpathOrSelf(pkgDir)
const linkRoot = target.includes(' ') ? pickLinkRoot(target) : undefined
let spec = target
if (linkRoot !== undefined) {
  ensureJunction(linkRoot, target)
  spec = linkRoot
  console.log(`link-profile: 仓库路径含空格,改用无空格装配路径 ${linkRoot}`)
}

const dshBin = existsSync(process.env.DSH_CLI ?? '')
  ? process.env.DSH_CLI
  : (() => {
      const install = findDshInstall()
      return install === undefined ? undefined : join(install, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    })()
console.log(`link-profile: adding ${spec} to profile "${profile}"`)

if (dshBin !== undefined && existsSync(dshBin)) {
  execFileSync(process.execPath, [dshBin, 'plugin', '--profile', profile, 'add', spec], { stdio: 'inherit' })
} else {
  // 没有本机 dsh 时退回 npx(与官方文档一致)
  execFileSync('npx', ['-y', '@deepseek-ai/dsh', 'plugin', '--profile', profile, 'add', spec], {
    stdio: 'inherit',
    shell: true,
  })
}
console.log('link-profile: done. Restart dsh web for the bundle layer to load.')
