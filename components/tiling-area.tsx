"use client"

import { useMemo, useRef, useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TileCard, type TextBlock } from "@/components/tile-card"
import { CONTENT_TYPE_CONFIG, type ContentType } from "@/lib/content-types"
import { getRelatedIds } from "@/lib/utils"
import { KanbanArea } from "./kanban-area"
import { TilingMinimap } from "./tiling-minimap"

/** Number of tiles per BSP page */
const PAGE_SIZE = 7

interface BSPNode {
  id: string
  type: 'split' | 'leaf'
  direction?: 'h' | 'v'
  left?: BSPNode
  right?: BSPNode
  blockId?: string
}

interface TilingAreaProps {
  blocks: TextBlock[]
  collapsedIds: Set<string>
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onEditAnnotation: (id: string, newAnnotation: string) => void
  onReEnrich: (id: string, newCategory?: string) => void
  onToggleCollapse: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleSubTask: (id: string, subTaskId: string) => void
  onDeleteSubTask: (id: string, subTaskId: string) => void
  highlightedBlockId?: string | null
  onHighlight: (id: string | null) => void
  hasApiKey: boolean
  onOpenSidebar: () => void
}

export function TilingArea({
  blocks,
  collapsedIds,
  onDelete,
  onEdit,
  onEditAnnotation,
  onReEnrich,
  onToggleCollapse,
  onTogglePin,
  onToggleSubTask,
  onDeleteSubTask,
  highlightedBlockId,
  onHighlight,
  hasApiKey,
  onOpenSidebar
}: TilingAreaProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null)
  const [lockedConnectionId, setLockedConnectionId] = useState<string | null>(null)

  const activeConnectionId = lockedConnectionId ?? hoveredConnectionId

  const relatedIds = useMemo<Set<string>>(
    () => activeConnectionId ? getRelatedIds(activeConnectionId, blocks) : new Set(),
    [activeConnectionId, blocks]
  )

  const handleConnectionHover = useCallback((id: string | null) => {
    setHoveredConnectionId(id)
  }, [])

  const handleConnectionLock = useCallback((id: string) => {
    setLockedConnectionId(prev => prev === id ? null : id)
  }, [])

  // Clear lock when locked block's connections change (enrichment can change influencedBy)
  useEffect(() => {
    if (!lockedConnectionId) return
    const lockedBlock = blocks.find(b => b.id === lockedConnectionId)
    if (!lockedBlock || !lockedBlock.influencedBy?.length) {
      setLockedConnectionId(null)
    }
  }, [blocks, lockedConnectionId])

  // Escape key clears lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLockedConnectionId(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // 1. Chunking into elastic chunks — declared before effects that depend on them
  const chunkedPages = useMemo(() => {
    const gridBlocks = blocks
      .filter((b: TextBlock) => b.contentType !== "task")
      .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
    if (gridBlocks.length === 0) return []
    const chunks: TextBlock[][] = []
    for (let i = 0; i < gridBlocks.length; i += PAGE_SIZE) {
      chunks.push(gridBlocks.slice(i, i + PAGE_SIZE))
    }
    return chunks
  }, [blocks])

  // Helper to build a recursive BSP tree for a single page
  const buildPageTree = (pageBlocks: TextBlock[], depth: number = 0): BSPNode => {
    if (pageBlocks.length === 1) {
      return { id: pageBlocks[0].id, type: 'leaf', blockId: pageBlocks[0].id }
    }
    const mid = Math.floor(pageBlocks.length / 2)
    return {
      id: `split-${depth}-${pageBlocks[0].id}`,
      type: 'split',
      direction: depth % 2 === 0 ? 'v' : 'h',
      left: buildPageTree(pageBlocks.slice(0, mid), depth + 1),
      right: buildPageTree(pageBlocks.slice(mid), depth + 1)
    }
  }

  const pageTrees = useMemo(() => {
    return chunkedPages.map(page => buildPageTree(page))
  }, [chunkedPages])

  const taskBlock = useMemo(() => blocks.find((b: TextBlock) => b.contentType === "task"), [blocks])

  // Track which page is in view via IntersectionObserver
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const idx = Number((visible.target as HTMLElement).dataset.pageIdx)
          if (!isNaN(idx)) setActivePageIdx(idx)
        }
      },
      { root: container, threshold: 0.3 }
    )
    container.querySelectorAll("[data-page-idx]").forEach(p => observer.observe(p))
    return () => observer.disconnect()
  }, [pageTrees.length])

  const scrollToPage = useCallback((idx: number) => {
    const container = scrollContainerRef.current
    if (!container) return
    container.querySelector<HTMLElement>(`[data-page-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  // Show minimap as soon as content overflows the visible area, regardless of page count
  const [isScrollable, setIsScrollable] = useState(false)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const check = () => setIsScrollable(container.scrollHeight > container.clientHeight)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(container)
    // Also re-check when children change size
    const mo = new MutationObserver(check)
    mo.observe(container, { childList: true, subtree: true, attributes: false })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  // 2. Tile Renderer with Width Invariant
  const TileRenderer = ({ node, pageBlocks, parentDir }: { node: BSPNode, pageBlocks: TextBlock[], parentDir?: 'h' | 'v' }) => {
    if (!node) return null
    
    if (node.type === 'leaf') {
      const block = pageBlocks.find((b: TextBlock) => b.id === node.blockId)
      if (!block) return null
      const isDimmed = activeConnectionId !== null && !relatedIds.has(block.id)
      return (
        <div
          id={`tile-${block.id}`}
          className="flex flex-1 p-0.5 overflow-hidden"
        >
          <div className={`flex flex-1 min-w-0 transition-[opacity,filter] duration-300 ${isDimmed ? 'opacity-15 saturate-0' : 'opacity-100'}`}>
            <TileCard
              block={block}
              isCollapsed={false}
              hideCollapse={true}
              onDelete={onDelete}
              onEdit={onEdit}
              onEditAnnotation={onEditAnnotation}
              onReEnrich={onReEnrich}
              onToggleCollapse={onToggleCollapse}
              onTogglePin={onTogglePin}
              onToggleSubTask={onToggleSubTask}
              onDeleteSubTask={onDeleteSubTask}
              isHighlighted={highlightedBlockId === block.id}
              onHighlight={onHighlight}
              onConnectionHover={handleConnectionHover}
              onConnectionLock={handleConnectionLock}
              isConnectionLocked={lockedConnectionId === block.id}
              allBlocks={blocks}
            />
          </div>
        </div>
      )
    }

    const getWeight = (n: BSPNode): number => {
      if (n.type === 'leaf') return 1
      return getWeight(n.left!) + getWeight(n.right!)
    }

    const leftWeight = getWeight(node.left!)
    const rightWeight = getWeight(node.right!)

    return (
      <div 
        className={`flex flex-1 min-h-0 min-w-0 ${node.direction === 'v' ? 'flex-row' : 'flex-col'}`}
      >
        <div style={{ flex: leftWeight }} className="flex min-h-0 min-w-0">
          <TileRenderer node={node.left!} pageBlocks={pageBlocks} parentDir={node.direction} />
        </div>
        <div style={{ flex: rightWeight }} className="flex min-h-0 min-w-0">
          <TileRenderer node={node.right!} pageBlocks={pageBlocks} parentDir={node.direction} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#020202]">
      {/* Task Header stays sticky at top */}
      <AnimatePresence>
        {taskBlock && (
          <div className={`w-full shrink-0 p-1 z-10 transition-[opacity,filter] duration-300 ${activeConnectionId && !relatedIds.has(taskBlock.id) ? 'opacity-15 saturate-0' : 'opacity-100'}`}>
            <TileCard
              block={taskBlock}
              isCollapsed={collapsedIds.has(taskBlock.id)}
              onDelete={onDelete}
              onEdit={onEdit}
              onEditAnnotation={onEditAnnotation}
              onReEnrich={onReEnrich}
              onToggleCollapse={onToggleCollapse}
              onTogglePin={onTogglePin}
              onToggleSubTask={onToggleSubTask}
              onDeleteSubTask={onDeleteSubTask}
              isHighlighted={highlightedBlockId === taskBlock.id}
              onHighlight={onHighlight}
              onConnectionHover={handleConnectionHover}
              onConnectionLock={handleConnectionLock}
              isConnectionLocked={lockedConnectionId === taskBlock.id}
              allBlocks={blocks}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Paged Mosaic with Vertical Scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-0.5 relative"
        onClick={e => {
          // Clear connection lock when clicking the canvas background (not a tile)
          if (e.target === e.currentTarget) setLockedConnectionId(null)
        }}
      >
        {pageTrees.length > 0 ? (
          <>
            <div className="flex flex-col w-full">
              {pageTrees.map((tree, idx) => {
                const count = chunkedPages[idx].length
                // Elastic height: if only 1 tile, don't take a whole screen
                const heightClass = count <= 2 ? 'h-[300px]' : count <= 4 ? 'h-[60vh]' : 'h-screen'
                return (
                  <div
                    key={idx}
                    data-page-idx={idx}
                    className={`flex w-full ${heightClass} border-b border-white/5 last:border-0`}
                  >
                    <TileRenderer node={tree} pageBlocks={chunkedPages[idx]} />
                  </div>
                )
              })}
            </div>

          </>
        ) : (
          !taskBlock && (
            <div className="flex h-[80vh] w-full items-center justify-center">
              <div className="flex flex-col items-center gap-10 w-[320px]">
                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/40">spatial research workspace</p>

                <div className="flex flex-col gap-4 w-full">
                  {([
                    { color: "var(--type-question)", label: "question", text: "Does consciousness require a physical substrate?" },
                    { color: "var(--type-claim)",    label: "#claim",   text: "Caffeine improves short-term recall by ~15%" },
                    { color: "var(--type-quote)",    label: "quote",    text: "Attention is the rarest form of generosity — Simone Weil" },
                    { color: "var(--type-task)",     label: "task",     text: "Review papers on distributed consensus" },
                  ] as const).map(({ color, label, text }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: color }} />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color }}>{label}</span>
                        <p className="font-mono text-[11px] leading-relaxed text-foreground/55">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {!hasApiKey && (
                  <div className="flex flex-col gap-2 rounded-sm border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
                    <p className="font-mono text-[9px] text-amber-400/80 leading-relaxed">
                      AI enrichment is inactive — no OpenRouter API key configured.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onOpenSidebar}
                        className="font-mono text-[9px] text-amber-300 underline underline-offset-2 hover:text-amber-200 transition-colors"
                      >
                        Open Settings →
                      </button>
                      <span className="font-mono text-[8px] text-amber-500/40">or</span>
                      <a
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[9px] text-amber-500/60 hover:text-amber-400 transition-colors"
                      >
                        Get a key ↗
                      </a>
                    </div>
                  </div>
                )}

                <p className="font-mono text-[9px] text-foreground/30 uppercase tracking-[0.2em] text-center">
                  type anything · #type to classify · ⌘K for commands
                </p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Floating minimap — shown as soon as content overflows the visible area */}
      {isScrollable && chunkedPages.length >= 1 && (
        <div className="absolute right-4 bottom-4 pointer-events-none z-20">
          <div className="pointer-events-auto">
            <TilingMinimap
              pages={chunkedPages}
              activePageIdx={activePageIdx}
              onPageClick={scrollToPage}
            />
          </div>
        </div>
      )}
    </div>
  )
}
