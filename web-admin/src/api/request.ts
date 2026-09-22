/**
 * 统一请求封装
 * - 请求拦截：注入 Authorization: Bearer <token>
 * - 响应拦截：拆解 { code, message, data }，非 0 抛 BizError
 * - 401：清除登录态并跳转登录页（携带 redirect）
 *
 * 实现说明：后端「业务错误也返回 HTTP 200 + code!==0」，所以拆包与抛错都放在
 * 响应拦截器里完成，调用方拿到的是已经解包的业务数据。
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@sanmuzi/contracts'
import { BizCode } from '@sanmuzi/contracts'
import { API_BASE, ASSET_BASE, TOKEN_KEY } from '@/config'

export class BizError extends Error {
  readonly code: number
  readonly traceId?: string

  constructor(code: number, message: string, traceId?: string) {
    super(message)
    this.name = 'BizError'
    this.code = code
    this.traceId = traceId
  }
}

let unauthorizedHandler: (() => void) | null = null

/** 由 main.ts 注入：收到 40100 时清理登录态并跳转登录页 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

/** 把站内相对资源地址转成浏览器可访问地址 */
export function resolveAssetUrl(raw?: string | null): string {
  if (!raw) return ''
  const value = raw.trim()
  if (!value) return ''
  if (/^(https?:)?\/\//i.test(value) || /^data:/i.test(value)) return value
  return `${ASSET_BASE}${value.startsWith('/') ? value : `/${value}`}`
}

const instance: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

instance.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown> | undefined
    if (payload && typeof payload.code === 'number') {
      if (payload.code !== 0) {
        if (payload.code === BizCode.UNAUTHORIZED) unauthorizedHandler?.()
        throw new BizError(payload.code, payload.message || '请求失败', payload.traceId)
      }
      return payload.data as never
    }
    return response.data as never
  },
  (error) => {
    const response = error?.response
    const body = response?.data as ApiResponse<unknown> | undefined
    if (body && typeof body.code === 'number') {
      if (body.code === BizCode.UNAUTHORIZED) unauthorizedHandler?.()
      throw new BizError(body.code, body.message || '请求失败', body.traceId)
    }
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      throw new BizError(-1, '请求超时，请稍后重试')
    }
    throw new BizError(-1, '网络异常，接口服务可能未启动')
  },
)

export interface RequestOptions extends Omit<AxiosRequestConfig, 'onUploadProgress'> {
  /** 上传进度回调：0-100 的整数百分比 */
  onUploadProgress?: (percent: number) => void
}

/** 统一请求方法：返回已解包的 data 段 */
export function request<T>(options: RequestOptions): Promise<T> {
  const { onUploadProgress, ...rest } = options
  const config: AxiosRequestConfig = { ...rest }
  if (onUploadProgress) {
    config.onUploadProgress = (event) => {
      const total = event.total ?? 0
      if (total > 0) onUploadProgress(Math.round((event.loaded / total) * 100))
    }
  }
  // 响应拦截器已经把 AxiosResponse 解包成业务数据，这里的类型断言是必要的
  return instance.request(config) as Promise<T>
}

export const http = {
  get: <T>(url: string, params?: Record<string, unknown>): Promise<T> => request<T>({ url, method: 'GET', params }),
  post: <T>(url: string, data?: unknown, options?: Omit<RequestOptions, 'url' | 'method' | 'data'>): Promise<T> =>
    request<T>({ url, method: 'POST', data, ...options }),
  put: <T>(url: string, data?: unknown): Promise<T> => request<T>({ url, method: 'PUT', data }),
  patch: <T>(url: string, data?: unknown): Promise<T> => request<T>({ url, method: 'PATCH', data }),
  delete: <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
    request<T>({ url, method: 'DELETE', params }),
}

export default http
