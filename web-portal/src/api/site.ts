/** 站点配置接口：站点名、副标题、导航、页脚 */
import type { SiteConfigVo } from '@sanmuzi/contracts'
import { httpGet } from './http'

export function fetchSiteConfig(): Promise<SiteConfigVo> {
  return httpGet<SiteConfigVo>('/api/portal/site-config')
}
