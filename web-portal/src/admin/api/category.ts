/** 分类管理接口（后台） */
import type { CategoryVo, CreateCategoryDto, UpdateCategoryDto } from '@sanmuzi/contracts'
import { http } from './request'

/** 全部分类（不分页），含各分类下的文章数 */
export function fetchCategories(): Promise<CategoryVo[]> {
  return http.get<CategoryVo[]>('/api/admin/categories')
}

export function createCategory(data: CreateCategoryDto): Promise<CategoryVo> {
  return http.post<CategoryVo>('/api/admin/categories', data)
}

export function updateCategory(id: number, data: UpdateCategoryDto): Promise<CategoryVo> {
  return http.put<CategoryVo>(`/api/admin/categories/${id}`, data)
}

export function deleteCategory(id: number): Promise<null> {
  return http.delete<null>(`/api/admin/categories/${id}`)
}
