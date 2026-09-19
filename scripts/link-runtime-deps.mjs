#!/usr/bin/env node
/**
 * link-runtime-deps — 把宿主 dsh 的运行时依赖链接进本包。
 *
 * 背景(为什么必须有这一步):
 *   dsh 以 `link:` 形式装配本插件时,插件模块的真实路径就是本仓库目录。
 *   Node 解析 `import '@deepseek-ai/schemastery'` 会从 `lib/` 逐级向上找
 *   node_modules —— 找不到时抛 `ERR_MODULE_NOT_FOUND`,而 dsh 的
 *   `assertEntriesLoaded` 会因为入口无法解析直接中止启动:
 *
 *     dsh: plugin(s) failed to load: llm-agy; Cordis startup failed
 *     Cannot find package '@deepseek-ai/schemastery' imported from .../lib/index.js
 *
 *   表现为"装了插件 dsh 就起不来,必须卸载才能启动"。
 *
 *   本脚本自动定位宿主 dsh 的 node_modules(桌面版/CLI 版/DSH_HOME 三种布局),
 *   把运行时真正会解析的那几个包链接到本包 node_modules 下。纯离线、幂等,
 *   重复执行只刷新链接。
 *
 * 用法:
 *   node scripts/link-runtime-deps.mjs
 *   DSH_INSTALL_DIR=<dsh 安装目录> node scripts/link-runtime-deps.mjs
 * @module scripts/link-runtime-deps
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(scriptDir, '..')
const targetDir = join(pkgDir, 'node_modules', '@deepseek-ai')

/**
 * 运行时会被 Node 真正解析的裸包(见 src/*.ts 的 import)。
 * 其余 `import type` 只参与类型检查,不需要运行期解析。
 */
const RUNTIME_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-util-values',
  '@deepseek-ai/dsh-web',
]

/** 标志包:它的 package.json 存在,才说明这个目录里的 node_modules 是完整可用的。 */
const MARKER = join('node_modules', '@deepseek-ai', 'schemastery', 'package.json')

/** 解析链接/路径后的真实路径;路径不存在时返回原值。 */
function realOrSelf(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * 探测一个候选目录是否是**可用**的 dsh 安装目录。
 * 必须落到真实存在的 package.json:仅 `existsSync` 会放过断链的 junction
 * (那个断链正是"脚本说链接成功、dsh 仍然起不来"的原因)。
 */
function isDshInstall(dir) {
  return dir !== undefined && existsSync(join(realOrSelf(dir), MARKER))
}

/** DSH_HOME 默认位置(未设置环境变量时)。 */
function defaultDshHome() {
  return process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

/**
 * 列出候选 dsh 安装目录,按优先级:
 *   1. DSH_INSTALL_DIR 显式指定
 *   2. 本包已建立的链接所指向的位置(优先复用之前的解析结果)
 *   3. $DSH_HOME/profiles/node_modules 下的 dsh 包(CLI / 桌面共用;可能是链接,会解析)
 *   4. 桌面应用自带的 dependencies/dsh
 * @returns 候选目录绝对路径列表。
 */
function candidates() {
  const list = []
  if (process.env.DSH_INSTALL_DIR) list.push(resolve(process.env.DSH_INSTALL_DIR))

  // 已建立的链接:解析真实路径后回推安装根,避免重复执行时漂移到别的候选。
  // schemastery 目录位于 <dsh>/node_modules/@deepseek-ai/schemastery,故向上三级。
  const existing = join(targetDir, 'schemastery')
  if (existsSync(existing)) {
    list.push(dirname(dirname(dirname(realOrSelf(existing)))))
  }

  const home = defaultDshHome()
  const viaProfiles = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh')
  if (existsSync(viaProfiles)) {
    // 可能本身就是指向桌面安装的链接,必须解析后再回推
    list.push(dirname(dirname(dirname(realOrSelf(viaProfiles)))))
  }

  // 桌面版: %APPDATA%/io.github.hairyf.deepseek-harness-desktop/dependencies/dsh
  const appData = process.env.APPDATA
  if (appData) {
    const desktop = join(appData, 'io.github.hairyf.deepseek-harness-desktop', 'dependencies')
    if (existsSync(desktop)) {
      for (const entry of readdirSync(desktop, { withFileTypes: true })) {
        if (entry.isDirectory() && (entry.name === 'dsh' || entry.name.startsWith('dsh-'))) {
          list.push(join(desktop, entry.name))
        }
      }
    }
  }
  return list
}

/** 找到第一个**可用**的 dsh 安装目录。 */
export function findDshInstall() {
  for (const dir of candidates()) {
    if (isDshInstall(dir)) return realOrSelf(dir)
  }
  return undefined
}

/**
 * 为一个包建立指向宿主 dsh 的链接(幂等:先删后建)。
 * @returns true 表示已就绪,false 表示宿主缺少该包。
 */
function linkPackage(dshDir, packageName) {
  const shortName = packageName.slice('@deepseek-ai/'.length)
  const source = join(dshDir, 'node_modules', '@deepseek-ai', shortName)
  const link = join(targetDir, shortName)
  if (!existsSync(join(source, 'package.json'))) return false
  try {
    rmSync(link, { recursive: true, force: true })
    symlinkSync(source, link, 'junction')
    return true
  } catch (error) {
    // junction 失败(非 Windows / 权限)时退回普通目录符号链接
    try {
      symlinkSync(source, link, 'dir')
      return true
    } catch {
      throw new Error(`无法建立链接 ${link} → ${source}: ${String(error)}`)
    }
  }
}

/** 主流程:定位宿主并补齐链接,返回 { dshDir, linked, missing }。 */
export function linkRuntimeDeps({ quiet = false } = {}) {
  const dshDir = findDshInstall()
  if (dshDir === undefined) {
    throw new Error(
      '找不到可用的宿主 dsh 安装目录(需要其中的 node_modules/@deepseek-ai/schemastery/package.json)。\n'
      + `已尝试: ${candidates().join(' | ') || '(无候选)'}\n`
      + '请设置 DSH_INSTALL_DIR 指向 dsh 安装目录后重试,例如:\n'
      + '  DSH_INSTALL_DIR="C:\\path\\to\\dependencies\\dsh" node scripts/link-runtime-deps.mjs',
    )
  }
  mkdirSync(targetDir, { recursive: true })
  const linked = []
  const missing = []
  for (const packageName of RUNTIME_PACKAGES) {
    if (linkPackage(dshDir, packageName)) linked.push(packageName)
    else missing.push(packageName)
  }

  // 额外根目录:本包被一个"无空格路径"(如 C:\dsh-llm-agy 的 junction)引用时,
  // Node 从该逻辑路径解析依赖,需要在那条路径下也有一份链接。工作区里的链接是
  // 绝对路径,经 junction 访问时全部失效,所以必须逐包重建。
  const extraRoots = (process.env.DSH_LINK_ROOTS ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value !== '')
  const extraLinked = []
  for (const root of extraRoots) {
    const dir = join(root, 'node_modules', '@deepseek-ai')
    mkdirSync(dir, { recursive: true })
    for (const packageName of RUNTIME_PACKAGES) {
      const shortName = packageName.slice('@deepseek-ai/'.length)
      const source = join(dshDir, 'node_modules', '@deepseek-ai', shortName)
      const link = join(dir, shortName)
      if (!existsSync(join(source, 'package.json'))) continue
      try {
        rmSync(link, { recursive: true, force: true })
        symlinkSync(source, link, 'junction')
        extraLinked.push(link)
      } catch { /* 该根不可写时跳过,不影响主路径 */ }
    }
  }

  if (!quiet) {
    console.log(`link-runtime-deps: 宿主 dsh = ${dshDir}`)
    console.log(`link-runtime-deps: 已链接 ${linked.length}/${RUNTIME_PACKAGES.length} 个运行时依赖`)
    if (extraRoots.length > 0) {
      console.log(`link-runtime-deps: 额外根目录链接 ${extraLinked.length} 条(${extraRoots.join(', ')})`)
    }
    if (missing.length > 0) {
      console.log(`link-runtime-deps: 宿主缺少(可选,不影响加载): ${missing.join(', ')}`)
    }
  }
  return { dshDir, linked, missing, extraLinked }
}

// 直接执行时(非被 build.mjs 导入)打印结果
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  try {
    linkRuntimeDeps()
  } catch (error) {
    console.error(`link-runtime-deps: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
