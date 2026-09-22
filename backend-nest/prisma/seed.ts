/**
 * 数据库种子脚本（幂等）
 * 执行方式：pnpm --filter @sanmuzi/backend seed（内部用 tsx 运行）
 *
 * 步骤：
 * 1. 清空旧数据（登录日志 -> 文章 -> 用户 -> 角色）；
 * 2. 写入 2 个内置角色与 2 个演示账号（bcrypt saltRounds=10）；
 * 3. 写入 6 篇演示文章（3 篇多图封面 + 3 篇视频封面，含中文富文本正文）；
 * 4. 可选下载公开示例视频到本地静态目录，并真实执行 ffprobe + 随机抽帧；
 * 5. 写入约 30 条覆盖最近 7 天的登录日志；
 * 6. 打印账号密码、文章数量与封面帧生成结果。
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import {
  AdminStatus,
  ALL_PERMISSIONS,
  CONTENT_EDITOR_PERMISSIONS,
  CoverType,
  LoginResult,
  RoleId,
} from '@sanmuzi/contracts'

/* ------------------------------------------------------------------ *
 * 环境与常量
 * ------------------------------------------------------------------ */

/** backend-nest 根目录（由 process.argv[1] = prisma/seed.ts 推导） */
const backendRoot = resolve(dirname(process.argv[1] ?? process.cwd()), '..')
const envPath = join(backendRoot, '.env')
if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true })
  console.log(`[seed] 已加载环境变量：${envPath}`)
} else {
  console.warn(`[seed] 未找到 ${envPath}，使用进程环境变量`)
}

const prisma = new PrismaClient()

/** 上传根目录：backend-nest/storage/uploads */
const uploadRoot = join(backendRoot, 'storage', 'uploads')
/** 演示素材目录 */
const demoDir = join(uploadRoot, 'demo')
/** 是否下载演示视频 */
const shouldDownloadVideo = ['true', '1', 'yes', 'on'].includes(
  (process.env.SEED_DOWNLOAD_VIDEO ?? '').trim().toLowerCase(),
)

/** 演示账号 */
const ADMIN_ACCOUNT = { username: 'admin', password: 'Admin@123456', realName: '超级管理员', roleId: RoleId.SUPER_ADMIN }
const EDITOR_ACCOUNT = { username: 'editor', password: 'Editor@123456', realName: '内容编辑', roleId: RoleId.CONTENT_EDITOR }

/** 演示视频远程地址（封面类型为 video 的文章；均为公开可下载的示例视频） */
const VIDEO_SOURCES = [
  {
    remote: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    fileName: 'sintel-trailer.mp4',
  },
  {
    remote: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    fileName: 'bunny-trailer.mp4',
  },
  {
    remote: 'https://media.w3.org/2010/05/video/movie_300.mp4',
    fileName: 'movie-300.mp4',
  },
]

/** 文章主题（6 篇各不相同） */
interface ArticleSeed {
  title: string
  shortDesc: string
  coverType: string
  sort: number
  videoIndex?: number
  body: { heading: string; paragraphs: string[]; quote: string; bullets: string[]; closing: string }
}

const ARTICLES: ArticleSeed[] = [
  {
    title: '2026 年 4K 显示器怎么选？六款高性价比型号实测对比',
    shortDesc:
      '我们自费买了六台 4K 显示器，从色准、亮度、接口、支架到售后逐项实测，帮你按预算直接锁定最合适的那一台。',
    coverType: CoverType.IMAGE,
    sort: 60,
    body: {
      heading: '先定尺寸，再定面板',
      paragraphs: [
        '27 英寸是 4K 的甜点尺寸：缩放 150% 时字迹锐利且不需要大幅转头；32 英寸适合一眼看三栏代码或剪辑时间线，但桌深不足 70 厘米就会觉得压迫。',
        '面板上，IPS Black 把静态对比度做到了 2000:1，暗场终于不再是灰蒙蒙的一片；如果预算卡在两千元档，常规 IPS 依旧是更稳妥的选择，别为了追新去碰低端 VA，拖影会明显影响阅读体验。',
      ],
      quote: '显示器是每天面对最久的硬件，把钱花在护眼与色准上，回报远高于多一个用不上的接口。',
      bullets: [
        '27 英寸 4K + IPS：适合文字工作与轻度修图，缩放 150% 最舒服',
        '32 英寸 4K + IPS Black：适合剪辑与多窗口办公，需预留桌深',
        '务必确认支持 DP 1.4 或 HDMI 2.1，否则 4K 60Hz 会掉到 30Hz',
        '带 USB-C 65W 以上的型号可以一根线接笔记本，桌面立刻清爽',
      ],
      closing: '如果只推荐一台：27 英寸 4K IPS、覆盖 99% sRGB、支持 USB-C 供电的型号，是目前最不容易后悔的选择。',
    },
  },
  {
    title: '通勤降噪耳机横评：地铁里的安静到底值多少钱',
    shortDesc:
      '我们把四款热门降噪耳机带上早高峰地铁，实测低频轰鸣抑制、通话降噪与佩戴舒适度，告诉你差价究竟差在哪里。',
    coverType: CoverType.IMAGE,
    sort: 50,
    body: {
      heading: '降噪深度不等于体验',
      paragraphs: [
        '厂商标称的 40dB、48dB 是在实验室单频点测出的理想值。真实地铁里更关键的是 100-500Hz 低频段的抑制能力，以及风噪、报站声这类突发中高频的处理。',
        '实测下来，头戴式在低频抑制上仍明显强于入耳式，但入耳式在夏天和长时间佩戴上更友好。通勤一小时以内，入耳式的综合体验往往更好。',
      ],
      quote: '降噪耳机最贵的不是芯片，而是让耳压保持自然的那套算法调校。',
      bullets: [
        '地铁通勤：优先选低频抑制强、耳压轻的头戴式',
        '步行或骑行：务必开启通透模式，安全第一',
        '通话降噪看麦克风数量与波束成形，不只看降噪深度',
        '续航低于 20 小时的头戴式，出差会明显焦虑',
      ],
      closing: '预算一千元以内，选降噪与佩戴均衡的型号；预算上到两千元，重点看通话与多设备切换是否顺手。',
    },
  },
  {
    title: '久坐党的人体工学椅选购指南：腰托才是核心',
    shortDesc:
      '从腰托支撑、坐深调节到网面回弹，我们连续坐满 30 天实测四把椅子，总结出一份不踩坑的选购清单与调校方法。',
    coverType: CoverType.VIDEO,
    sort: 40,
    videoIndex: 0,
    body: {
      heading: '腰托比头枕重要得多',
      paragraphs: [
        '很多椅子把预算堆在头枕和扶手，却给了个只能上下微调的腰托。真正决定久坐舒适度的是腰托能否顶住腰椎前凸，并且随手一靠就贴合，而不是需要刻意挺腰去找位置。',
        '其次看坐深：坐深过大，膝盖后侧会被顶住，血液回流受影响；坐深可调或者坐垫前缘有瀑布弧度的型号，更适合身高差异大的家庭共用。',
      ],
      quote: '椅子不能治病，但一把调校正确的椅子能让你忘记自己正在久坐。',
      bullets: [
        '腰托高度应落在腰带上方一到两指处，硬度要能回弹',
        '坐深以膝窝留出两指宽为宜，脚掌必须能踩实地面',
        '扶手至少要能上下调节，方便手肘自然下垂',
        '网面选高回弹材质，坐久了不塌陷才是真耐用',
      ],
      closing: '预算有限时，优先保证腰托与坐深可调，其余功能都是锦上添花。',
    },
  },
  {
    title: '千元便携投影仪实测：白天能看吗，值不值得买',
    shortDesc:
      '我们实测了三台千元级便携投影仪的亮度、对焦速度与噪音表现，并给出卧室、出租屋与露营三种场景的真实购买建议。',
    coverType: CoverType.VIDEO,
    sort: 30,
    videoIndex: 1,
    body: {
      heading: '亮度决定上限，环境决定下限',
      paragraphs: [
        '标称 800 ANSI 流明的机型，白天拉上纱帘仍然偏灰，晚上关灯才能发挥。所以便携投影的正确预期是「夜间卧室影院」，而不是替代客厅电视。',
        '自动对焦与梯形校正的速度非常影响体验：开机 5 秒内完成对焦、移动后能自动重校的机型，日常使用几乎无感；反之每次都要手动调，用两次就吃灰。',
      ],
      quote: '投影仪卖的是氛围感，不是画质。想清楚你要的是哪种，就不会买错。',
      bullets: [
        '卧室夜间观影：优先看亮度与对焦速度，噪音低于 30dB 更舒适',
        '出租屋：选自带系统与音响的一体机，省下一套外设',
        '露营：必须支持 PD 充电宝供电，否则只能当摆设',
        '投距一米能投 40 英寸以上的机型，小房间也能用',
      ],
      closing: '如果你的主要场景是晚上关灯看剧，千元便携投影确实值得；如果白天也要看，请直接考虑电视或加钱上激光。',
    },
  },
  {
    title: '机械键盘怎么选轴体？一篇讲清线性、段落与静音',
    shortDesc:
      '从触发压力、触底手感讲到宿舍与办公室的噪音边界，用最直白的方式帮你选出第一把不会后悔的机械键盘。',
    coverType: CoverType.IMAGE,
    sort: 20,
    body: {
      heading: '先想清楚在哪里用',
      paragraphs: [
        '线性轴顺滑直上直下，适合长时间打字的游戏玩家；段落轴有明确的确认感，写代码时误触率更低；静音轴通过轴心缓冲垫削弱触底声，是宿舍与开放工位的安全牌。',
        '触发压力在 35-45gf 之间最适合长时间输入，超过 55gf 打一天字手指会明显疲劳。克制一点，不要一上手就追重轴。',
      ],
      quote: '键盘手感是极其私人的事，别人的神轴在你手上可能就是噪音源。',
      bullets: [
        '办公室/宿舍：优先静音红轴或静音茶轴，避免青轴',
        '写代码：段落轴或提前大段落轴，盲打确认感强',
        '游戏：线性银轴触发行程短，操作响应更快',
        '结构上优先选 gasket 与多层填充，声音更聚拢',
      ],
      closing: '第一把键盘建议选可热插拔的套件，轴体不喜欢还能换，试错成本最低。',
    },
  },
  {
    title: '智能台灯不是越贵越好：显色、频闪与照度实测',
    shortDesc:
      '我们用照度计和频闪测试仪对比了五款智能台灯，告诉你哪些参数真的影响用眼舒适度，哪些只是营销话术。',
    coverType: CoverType.IMAGE,
    sort: 10,
    body: {
      heading: '看三个硬指标就够了',
      paragraphs: [
        '第一是照度均匀度：国 AA 级要求中心区域 500lx 以上，但边缘如果掉到 150lx 以下，纸面与键盘会形成明显明暗差，眼睛更容易累。',
        '第二是显色指数，Ra95 以上才能让彩色插画与衣物不失真；第三是无可视频闪，用手机摄像头对着灯拍，出现滚动条纹的直接排除。',
      ],
      quote: '所谓护眼，本质是让眼睛少做额外的调节动作。',
      bullets: [
        '中心照度 500-1000lx，均匀度越好越舒服',
        'Ra95 以上、R9 大于 50，画面才不偏色',
        '色温 4000K 左右最适合夜间阅读',
        '智能功能里最实用的是定时休息提醒与场景记忆',
      ],
      closing: '把预算放在照度、显色与频闪上，比多一个 App 联动功能划算得多。',
    },
  },
]

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

/** 构造稳定的占位图地址（远程 CDN，无需本地文件即可演示） */
function picsum(seed: string, width = 1200, height = 800): string {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`
}

/** 构造富文本正文（含 h2 / p / img / blockquote / ul，视频文章额外插入 video 标签） */
function buildContent(article: ArticleSeed, index: number, videoUrl?: string): string {
  const { heading, paragraphs, quote, bullets, closing } = article.body
  const parts: string[] = []
  parts.push(`<h2>${heading}</h2>`)
  parts.push(`<p>${paragraphs[0] ?? ''}</p>`)
  parts.push(`<img src="${picsum(`sanmuzi-body-${index + 1}`, 1200, 700)}" alt="${article.title}" />`)
  parts.push(`<p>${paragraphs[1] ?? ''}</p>`)
  if (videoUrl) {
    parts.push(`<video src="${videoUrl}" controls playsinline></video>`)
    parts.push('<p>上面是实测录制的动态画面，可以直观看到实际使用状态。</p>')
  }
  parts.push(`<blockquote>${quote}</blockquote>`)
  parts.push(`<ul>${bullets.map((item) => `<li>${item}</li>`).join('')}</ul>`)
  parts.push(`<p>${closing}</p>`)
  return parts.join('\n')
}

/** 生成最近 7 天内的随机登录时间 */
function randomLoginTime(daysAgo: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(7 + Math.floor(Math.random() * 15), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0)
  return date
}

/** 内网与公网混合的假 IP */
function randomIp(): string {
  const pools = [
    () => `192.168.${Math.floor(Math.random() * 4) + 1}.${Math.floor(Math.random() * 200) + 10}`,
    () => `10.0.${Math.floor(Math.random() * 8)}.${Math.floor(Math.random() * 200) + 10}`,
    () => `172.16.${Math.floor(Math.random() * 8)}.${Math.floor(Math.random() * 200) + 10}`,
    () => `113.${Math.floor(Math.random() * 100) + 80}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    () => `223.${Math.floor(Math.random() * 100) + 60}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    () => `47.${Math.floor(Math.random() * 100) + 90}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
  ]
  return (pools[Math.floor(Math.random() * pools.length)] ?? pools[0])()
}

/** 下载远程视频到本地演示目录（失败返回 null，仅告警） */
async function downloadVideo(url: string, fileName: string): Promise<string | null> {
  const target = join(demoDir, fileName)
  if (existsSync(target)) {
    console.log(`[seed] 演示视频已存在，跳过下载：${fileName}`)
    return `/static/uploads/demo/${fileName}`
  }
  try {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) {
      console.warn(`[seed] 下载失败（HTTP ${response.status}）：${url}`)
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) {
      console.warn(`[seed] 下载内容为空：${url}`)
      return null
    }
    await mkdir(demoDir, { recursive: true })
    await writeFile(target, buffer)
    console.log(`[seed] 演示视频下载成功：${fileName}（${(buffer.length / 1024 / 1024).toFixed(2)} MB）`)
    return `/static/uploads/demo/${fileName}`
  } catch (error) {
    console.warn(`[seed] 下载异常，保留远程地址：${url}（${error instanceof Error ? error.message : String(error)}）`)
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log('[seed] ================ 开始写入种子数据 ================')

  // 1. 清空旧数据（顺序：登录日志 -> 文章 -> 用户 -> 角色）
  const deletedLogs = await prisma.adminLoginLog.deleteMany()
  const deletedArticles = await prisma.blogArticle.deleteMany()
  const deletedUsers = await prisma.adminUser.deleteMany()
  const deletedRoles = await prisma.adminRole.deleteMany()
  console.log(
    `[seed] 已清理旧数据：登录日志 ${deletedLogs.count} 条、文章 ${deletedArticles.count} 篇、账号 ${deletedUsers.count} 个、角色 ${deletedRoles.count} 个`,
  )

  // 2. 内置角色
  await prisma.adminRole.create({
    data: {
      id: RoleId.SUPER_ADMIN,
      roleName: '超级管理员',
      permissions: JSON.stringify(ALL_PERMISSIONS),
    },
  })
  await prisma.adminRole.create({
    data: {
      id: RoleId.CONTENT_EDITOR,
      roleName: '内容编辑',
      permissions: JSON.stringify(CONTENT_EDITOR_PERMISSIONS),
    },
  })
  console.log(`[seed] 角色写入完成：超级管理员（${ALL_PERMISSIONS.length} 项权限）、内容编辑（${CONTENT_EDITOR_PERMISSIONS.length} 项权限）`)

  // 3. 演示账号
  const [admin, editor] = await Promise.all([
    prisma.adminUser.create({
      data: {
        username: ADMIN_ACCOUNT.username,
        password: await bcrypt.hash(ADMIN_ACCOUNT.password, 10),
        realName: ADMIN_ACCOUNT.realName,
        roleId: ADMIN_ACCOUNT.roleId,
        status: AdminStatus.ENABLED,
      },
    }),
    prisma.adminUser.create({
      data: {
        username: EDITOR_ACCOUNT.username,
        password: await bcrypt.hash(EDITOR_ACCOUNT.password, 10),
        realName: EDITOR_ACCOUNT.realName,
        roleId: EDITOR_ACCOUNT.roleId,
        status: AdminStatus.ENABLED,
      },
    }),
  ])
  console.log(`[seed] 账号写入完成：${admin.username}（id=${admin.id}）、${editor.username}（id=${editor.id}）`)

  // 4. 演示视频素材（可选下载 + 真实抽帧）
  const demoVideoUrls = new Map<number, string>()
  const demoVideoFrames = new Map<number, string>()
  const frameReport: string[] = []

  if (shouldDownloadVideo) {
    // 动态导入后端工具，复用同一套 ffprobe / ffmpeg 逻辑（避免绕开服务端实现）
    const { configureFfmpeg, probeVideo, extractRandomFrame } = await import('../src/common/utils/ffmpeg.util')
    configureFfmpeg({
      ffmpegPath: process.env.FFMPEG_PATH ?? '',
      ffprobePath: process.env.FFPROBE_PATH ?? '',
    })
    await mkdir(demoDir, { recursive: true })

    for (let index = 0; index < VIDEO_SOURCES.length; index += 1) {
      const source = VIDEO_SOURCES[index]
      if (!source) continue
      const localUrl = await downloadVideo(source.remote, source.fileName)
      if (!localUrl) continue

      const localPath = join(uploadRoot, 'demo', source.fileName)
      const probe = probeVideo(localPath)
      const frameName = `${source.fileName.replace(/\.[^.]+$/, '')}-frame.jpg`
      const framePath = join(demoDir, frameName)
      const frameResult = extractRandomFrame(localPath, framePath)

      if (frameResult.ok) {
        demoVideoUrls.set(index, localUrl)
        demoVideoFrames.set(index, `/static/uploads/demo/${frameName}`)
        frameReport.push(
          `文章${index + 1} 视频=${source.fileName} 时长=${probe.duration ?? '未知'}s 分辨率=${probe.resolution ?? '未知'} 抽帧时间=${frameResult.frameTime}s 封面=/static/uploads/demo/${frameName} ✅`,
        )
      } else {
        demoVideoUrls.set(index, localUrl)
        frameReport.push(`文章${index + 1} 视频=${source.fileName} 抽帧失败：${frameResult.error} ❌（保留本地视频地址）`)
      }
    }
  } else {
    console.log('[seed] SEED_DOWNLOAD_VIDEO 未开启，视频类文章使用远程示例地址与占位封面帧')
  }

  // 5. 写入 6 篇演示文章
  let videoArticleIndex = 0
  for (let index = 0; index < ARTICLES.length; index += 1) {
    const article = ARTICLES[index]
    if (!article) continue

    const isVideo = article.coverType === CoverType.VIDEO
    const videoSlot = article.videoIndex ?? videoArticleIndex
    const source = VIDEO_SOURCES[videoSlot] ?? VIDEO_SOURCES[0]
    const localVideoUrl = demoVideoUrls.get(videoSlot)

    // 视频地址：本地下载成功用站内地址，否则保留远程示例地址
    const coverVideo = isVideo ? (localVideoUrl ?? source?.remote ?? null) : null
    // 封面帧：本地视频用真实抽帧结果，否则用固定占位图
    const coverVideoFrame = isVideo
      ? (demoVideoFrames.get(videoSlot) ?? picsum(`sanmuzi-frame-${index + 1}`, 1200, 800))
      : null
    // 正文中的 video 标签：走同一份地址
    const bodyVideoUrl = isVideo ? (coverVideo ?? undefined) : undefined

    await prisma.blogArticle.create({
      data: {
        title: article.title,
        shortDesc: article.shortDesc,
        coverType: article.coverType,
        coverImages: isVideo
          ? null
          : JSON.stringify([
              picsum(`sanmuzi-${index + 1}-1`, 1200, 800),
              picsum(`sanmuzi-${index + 1}-2`, 1200, 800),
              picsum(`sanmuzi-${index + 1}-3`, 1200, 800),
            ]),
        coverVideo,
        coverVideoFrame,
        content: buildContent(article, index, bodyVideoUrl),
        isRecommend: true,
        isPublish: true,
        sort: article.sort,
      },
    })
    if (isVideo) videoArticleIndex += 1
  }
  const articleCount = await prisma.blogArticle.count()
  console.log(`[seed] 文章写入完成：共 ${articleCount} 篇（推荐+已上架，sort 60/50/40/30/20/10）`)

  // 6. 约 30 条登录日志，覆盖最近 7 天
  const accountIds = [admin.id, editor.id]
  const logRows: Array<{ adminUserId: number; loginIp: string; loginResult: number; loginTime: Date }> = []
  const totalLogs = 30
  for (let index = 0; index < totalLogs; index += 1) {
    const daysAgo = Math.floor((index / totalLogs) * 7)
    logRows.push({
      adminUserId: Math.random() > 0.25 ? admin.id : (accountIds[Math.floor(Math.random() * accountIds.length)] ?? admin.id),
      loginIp: randomIp(),
      loginResult: Math.random() > 0.3 ? LoginResult.SUCCESS : LoginResult.FAIL,
      loginTime: randomLoginTime(daysAgo),
    })
  }
  await prisma.adminLoginLog.createMany({ data: logRows })
  const logCount = await prisma.adminLoginLog.count()
  console.log(`[seed] 登录日志写入完成：共 ${logCount} 条（覆盖最近 7 天，含成功与失败）`)

  // 7. 结果汇总
  console.log('[seed] ================ 种子数据写入完成 ================')
  console.log(`[seed] 超管账号：${ADMIN_ACCOUNT.username} / ${ADMIN_ACCOUNT.password}`)
  console.log(`[seed] 编辑账号：${EDITOR_ACCOUNT.username} / ${EDITOR_ACCOUNT.password}`)
  console.log(`[seed] 文章数量：${articleCount} 篇（视频封面 3 篇、多图封面 3 篇）`)
  if (frameReport.length > 0) {
    console.log('[seed] 封面帧生成结果：')
    for (const line of frameReport) console.log(`[seed]   - ${line}`)
  } else {
    console.log('[seed] 封面帧生成结果：未执行本地抽帧（视频文章使用 picsum 占位帧）')
  }
}

main()
  .catch((error: unknown) => {
    console.error('[seed] 写入失败：', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
