import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiResponse } from '@sanmuzi/contracts'
import { API_BASE } from '@/config'

/** 业务错误：携带后端业务码，供页面区分「无数据」与「真失败」 */
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

const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

/** 统一拆包：后端永远返回 { code, message, data }，code !== 0 一律抛 BizError */
http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown> | undefined
    if (payload && typeof payload.code === 'number') {
      if (payload.code !== 0) {
        throw new BizError(payload.code, payload.message || '请求失败', payload.traceId)
      }
      return payload.data as never
    }
    return response.data as never
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response?.data && typeof error.response.data.code === 'number') {
      const { code, message, traceId } = error.response.data
      throw new BizError(code, message || '请求失败', traceId)
    }
    if (error.code === 'ECONNABORTED') {
      throw new BizError(-1, '请求超时，请稍后重试')
    }
    throw new BizError(-1, '网络异常，接口服务可能未启动')
  },
)

/** 类型化 GET：返回 data 段 */
export function httpGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return http.get(url, { params }) as unknown as Promise<T>
}

/** 类型化 POST：返回 data 段 */
export function httpPost<T>(url: string, data?: unknown): Promise<T> {
  return http.post(url, data) as unknown as Promise<T>
}

export default http
