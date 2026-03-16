// RAG 文档管理功能已禁用
export function DocPanel() {
  return null
}

/* 原始代码已注释
import { useState, useCallback, useEffect } from 'react'
import { api } from '../api'
import type { Document, DocumentStats } from '../types'

export function DocPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [stats, setStats] = useState<DocumentStats>({ totalFiles: 0, totalSize: 0 })
  const [isUploading, setIsUploading] = useState(false)

  const loadDocs = useCallback(async () => {
    try {
      const [docsData, statsData] = await Promise.all([
        api.getDocuments(),
        api.getStats(),
      ])
      setDocs(docsData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load docs:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadDocs()
    }
  }, [isOpen, loadDocs])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const result = await api.uploadDocument(file)
      if (result.success) {
        await loadDocs()
      }
      alert(result.message)
    } catch (error) {
      alert('上传失败: ' + (error as Error).message)
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return

    try {
      await api.deleteDocument(docId)
      await loadDocs()
    } catch (error) {
      alert('删除失败: ' + (error as Error).message)
    }
  }

  return (
    <div className="doc-panel">
      ...
    </div>
  )
}
*/
