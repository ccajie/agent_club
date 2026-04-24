import { useState, useEffect, useCallback, useRef } from 'react'
import type { HtmlFileInfo } from '../types'
import { api } from '../api'

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
)

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

const NewFileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="18" x2="12" y2="12"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </svg>
)

const GlobeIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function HtmlPreviewPage() {
  const [files, setFiles] = useState<HtmlFileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newFilename, setNewFilename] = useState('')
  const [newContent, setNewContent] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await api.getHtmlPreviews()
      setFiles(list)
      // If selected file no longer exists, clear selection
      if (selectedFile && !list.find(f => f.filename === selectedFile)) {
        setSelectedFile(null)
      }
    } catch (err) {
      console.error('Failed to load HTML previews:', err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFile])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleDelete = async (filename: string) => {
    try {
      await api.deleteHtmlPreview(filename)
      setShowDeleteConfirm(null)
      loadFiles()
    } catch (err) {
      console.error('Failed to delete file:', err)
      alert('删除失败')
    }
  }

  const handleCreate = async () => {
    const name = newFilename.trim()
    if (!name) return
    try {
      await api.saveHtmlPreview({ filename: name, content: newContent })
      setShowNewModal(false)
      setNewFilename('')
      setNewContent('')
      loadFiles()
    } catch (err) {
      console.error('Failed to save file:', err)
      alert('保存失败')
    }
  }

  const previewUrl = selectedFile ? `/preview/${selectedFile}` : ''

  return (
    <div className="html-preview-page">
      <div className="html-preview-header">
        <h2>网页预览</h2>
        <p className="header-desc">查看和管理 AI 生成的 HTML 文件</p>
      </div>

      <div className="html-preview-layout">
        {/* 左侧文件列表 */}
        <div className="html-preview-sidebar">
          <div className="sidebar-toolbar">
            <button
              className="toolbar-btn primary"
              onClick={() => setShowNewModal(true)}
              title="新建 HTML 文件"
            >
              <NewFileIcon />
              <span>新建</span>
            </button>
            <button
              className="toolbar-btn"
              onClick={loadFiles}
              disabled={isLoading}
              title="刷新列表"
            >
              <RefreshIcon />
            </button>
          </div>

          <div className="file-list">
            {files.length === 0 ? (
              <div className="file-list-empty">
                <GlobeIcon />
                <p>暂无 HTML 文件</p>
                <span>AI 生成的 HTML 将显示在这里</span>
              </div>
            ) : (
              files.map(file => (
                <div
                  key={file.filename}
                  className={`file-item ${selectedFile === file.filename ? 'active' : ''}`}
                  onClick={() => setSelectedFile(file.filename)}
                >
                  <div className="file-icon">
                    <FileIcon />
                  </div>
                  <div className="file-info">
                    <div className="file-name" title={file.filename}>
                      {file.filename}
                    </div>
                    <div className="file-meta">
                      {formatFileSize(file.size)} · {formatTime(file.updated_at)}
                    </div>
                  </div>
                  <button
                    className="file-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteConfirm(file.filename)
                    }}
                    title="删除"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧预览区域 */}
        <div className="html-preview-content">
          {selectedFile ? (
            <>
              <div className="preview-toolbar">
                <span className="preview-filename">{selectedFile}</span>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="toolbar-link"
                >
                  新窗口打开
                </a>
              </div>
              <div className="preview-iframe-wrapper">
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  title={selectedFile}
                  className="preview-iframe"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </>
          ) : (
            <div className="preview-placeholder">
              <GlobeIcon />
              <p>选择左侧文件进行预览</p>
              <span>或者点击"新建"创建一个 HTML 文件</span>
            </div>
          )}
        </div>
      </div>

      {/* 新建文件弹窗 */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>新建 HTML 文件</h3>
            <div className="form-group">
              <label>文件名</label>
              <input
                type="text"
                value={newFilename}
                onChange={e => setNewFilename(e.target.value)}
                placeholder="example.html"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>HTML 内容</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="<!DOCTYPE html>..."
                rows={12}
              />
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowNewModal(false)}>
                取消
              </button>
              <button
                className="btn primary"
                onClick={handleCreate}
                disabled={!newFilename.trim()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除 <strong>{showDeleteConfirm}</strong> 吗？此操作不可撤销。</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowDeleteConfirm(null)}>
                取消
              </button>
              <button
                className="btn danger"
                onClick={() => handleDelete(showDeleteConfirm)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
