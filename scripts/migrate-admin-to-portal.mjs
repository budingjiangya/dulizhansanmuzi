/**
 * 一次性迁移脚本：把后台从独立应用（web-admin，根路径）合并进 web-portal 的 /admin 区域。
 *
 * 处理内容：
 * 1. 组件相对引用 @/views、@/layout 等 -> @/admin/...
 * 2. 路由 name 统一加 admin- 前缀
 * 3. 硬编码路径 /dashboard、/login ... -> /admin/...
 * 4. AdminLayout 顶层包一层 #admin-app 容器（让后台样式与 Naive-UI 主题作用域明确）
 *
 * 该脚本是幂等的；重复执行不会产生重复替换。
 * 用法：node scripts/migrate-admin-to-portal.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const adminDir = resolve(scriptDir, '..', 'web-portal', 'src', 'admin')

/** 需要把根路径改成 /admin 前缀的字面量 */
const PATH_REWRITES = [
  ["'/dashboard'", "'/admin/dashboard'"],
  ['"/dashboard"', '"/admin/dashboard"'],
  ["'/login'", "'/admin/login'"],
  ['"/login"', '"/admin/login"'],
  ["'/403'", "'/admin/403'"],
  ['"/403"', '"/admin/403"'],
  ["'/404'", "'/admin/404'"],
  ['"/404"', '"/admin/404"'],
  ["'/blog/articles/create'", "'/admin/blog/articles/create'"],
  ["'/blog/articles'", "'/admin/blog/articles'"],
  ["'/system/users'", "'/admin/system/users'"],
  ["'/system/roles'", "'/admin/system/roles'"],
  ["'/system/login-logs'", "'/admin/system/login-logs'"],
  ["'/profile/password'", "'/admin/profile/password'"],
]

/** 路由 name 前缀 */
const ROUTE_NAME_REWRITES = [
  ["name: 'dashboard'", "name: 'admin-dashboard'"],
  ["name: 'login'", "name: 'admin-login'"],
  ["name: 'forbidden'", "name: 'admin-forbidden'"],
  ["name: 'not-found'", "name: 'admin-not-found'"],
  ["name: 'blog-article-list'", "name: 'admin-blog-article-list'"],
  ["name: 'blog-article-create'", "name: 'admin-blog-article-create'"],
  ["name: 'blog-article-edit'", "name: 'admin-blog-article-edit'"],
  ["name: 'system-user-list'", "name: 'admin-system-user-list'"],
  ["name: 'system-role-list'", "name: 'admin-system-role-list'"],
  ["name: 'system-login-log'", "name: 'admin-system-login-log'"],
  ["name: 'profile-password'", "name: 'admin-profile-password'"],
]

/** 组件引用前缀 */
const IMPORT_REWRITES = [
  ["from '@/views/", "from '@/admin/views/"],
  ["from '@/layout/", "from '@/admin/layout/"],
  ["from '@/stores/", "from '@/admin/stores/"],
  ["from '@/permission/", "from '@/admin/permission/"],
  ["from '@/api/", "from '@/admin/api/"],
  ["from '@/utils/", "from '@/admin/utils/"],
  ["from '@/config'", "from '@/admin/config'"],
  // 共用组件（图标、上传、富文本）已提升到访客端 components 目录
  ["from '@/admin/components/", "from '@/components/"],
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (['.ts', '.vue', '.d.ts'].includes(extname(full))) out.push(full)
  }
  return out
}

const files = walk(adminDir)
let totalEdits = 0

for (const file of files) {
  let source = readFileSync(file, 'utf8')
  const before = source

  for (const [from, to] of [...IMPORT_REWRITES, ...ROUTE_NAME_REWRITES, ...PATH_REWRITES]) {
    source = source.split(from).join(to)
  }

  if (source !== before) {
    writeFileSync(file, source, 'utf8')
    totalEdits += 1
    console.log(`updated ${file.replace(resolve(scriptDir, '..'), '')}`)
  }
}

// AdminLayout 顶层容器
const layoutFile = join(adminDir, 'layout', 'AdminLayout.vue')
let layout = readFileSync(layoutFile, 'utf8')
const OPEN_OLD = '<NLayout class="h-screen" has-sider>'
const OPEN_NEW = `<!-- #admin-app：后台样式作用域根节点，避免与访客端样式互相影响 -->
  <div id="admin-app" class="h-screen w-full">
    <NLayout class="h-screen" has-sider>`
if (layout.includes(OPEN_OLD) && !layout.includes('id="admin-app"')) {
  layout = layout.replace(OPEN_OLD, OPEN_NEW)
  layout = layout.replace('  </NLayout>\n</template>', '    </NLayout>\n  </div>\n</template>')
  writeFileSync(layoutFile, layout, 'utf8')
  console.log('wrapped AdminLayout with #admin-app container')
  totalEdits += 1
}

console.log(`\n完成：${totalEdits} 个文件被更新（共扫描 ${files.length} 个文件）`)
