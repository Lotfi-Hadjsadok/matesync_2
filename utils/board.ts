import { triggerPushNotification } from '@/utils/pushNotifications'
import { supabase } from '@/utils/supabase'

export type Board = {
  id: string
  couple_id: string
  title: string
  color: string
  /** Present after `20260412000001_board_position` migration; omitted in older DBs. */
  position?: number
  created_by: string | null
  created_at: string
}

function isMissingBoardPositionColumn(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? '').toLowerCase()
  if (!m.includes('position')) return false
  return (
    m.includes('does not exist') ||
    m.includes('unknown') ||
    m.includes('schema cache') ||
    m.includes('could not find') ||
    m.includes('42703')
  )
}

export type Subtask = {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  created_at: string
}

export type Task = {
  id: string
  board_id: string
  title: string
  description: string | null
  points: number
  position: number
  status: 'open' | 'done'
  completed_by: string | null
  completed_at: string | null
  created_by: string | null
  assigned_to: string
  created_at: string
  subtasks: Subtask[]
}

export type TaskListFilter = 'my_open' | 'i_assigned_open' | 'done' | 'all'

export type BoardDetail = Board & { tasks: Task[] }

export async function getBoards(coupleId: string): Promise<Board[]> {
  const ordered = await supabase
    .from('boards')
    .select('*')
    .eq('couple_id', coupleId)
    .order('position', { ascending: true })
  if (!ordered.error) return (ordered.data ?? []) as Board[]
  if (!isMissingBoardPositionColumn(ordered.error)) throw ordered.error
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Board[]
}

export type BoardWithPending = Board & { pending_count: number }

/** Open tasks assigned to `forUserId` (what’s “pending” for whoever is viewing). */
export async function getBoardsWithPendingCounts(
  coupleId: string,
  forUserId: string,
): Promise<BoardWithPending[]> {
  const boards = await getBoards(coupleId)
  if (boards.length === 0) return []
  const boardIds = boards.map((b) => b.id)
  const { data: rows, error } = await supabase
    .from('tasks')
    .select('board_id')
    .in('board_id', boardIds)
    .eq('status', 'open')
    .eq('assigned_to', forUserId)
  if (error) throw error
  const counts = new Map<string, number>()
  for (const r of rows ?? []) {
    counts.set(r.board_id, (counts.get(r.board_id) ?? 0) + 1)
  }
  return boards.map((b) => ({ ...b, pending_count: counts.get(b.id) ?? 0 }))
}

async function nextBoardPosition(coupleId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('boards')
    .select('position')
    .eq('couple_id', coupleId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingBoardPositionColumn(error)) return null
    throw error
  }
  return (data?.position ?? -1) + 1
}

export async function createBoard(coupleId: string, title: string, color: string): Promise<Board> {
  const { data: { user } } = await supabase.auth.getUser()
  const position = await nextBoardPosition(coupleId)
  const base = { couple_id: coupleId, title, color, created_by: user!.id }
  let res =
    position === null
      ? await supabase.from('boards').insert(base).select().single()
      : await supabase.from('boards').insert({ ...base, position }).select().single()
  if (res.error && isMissingBoardPositionColumn(res.error)) {
    res = await supabase.from('boards').insert(base).select().single()
  }
  const { data, error } = res
  if (error) throw error
  void triggerPushNotification({ action: 'board_created', boardId: data.id }).catch((e) =>
    console.warn('[MateSync] push board_created:', e),
  )
  return data
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase.from('boards').delete().eq('id', boardId)
  if (error) throw error
}

function sortNestedTasks(board: BoardDetail): BoardDetail {
  board.tasks = (board.tasks ?? []).sort((a, b) => a.position - b.position)
  board.tasks.forEach((t) => {
    t.subtasks = (t.subtasks ?? []).sort((a, b) => a.position - b.position)
  })
  return board
}

export async function getBoardDetail(boardId: string): Promise<BoardDetail> {
  const { data, error } = await supabase
    .from('boards')
    .select('*, tasks(*, subtasks(*))')
    .eq('id', boardId)
    .single()
  if (error) throw error
  return sortNestedTasks(data as BoardDetail)
}

export async function createTask(
  boardId: string,
  title: string,
  description: string | null,
  points: number,
  position: number,
  assignedToUserId: string,
): Promise<Task> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      board_id: boardId,
      title,
      description,
      points,
      position,
      created_by: user!.id,
      assigned_to: assignedToUserId,
    })
    .select()
    .single()
  if (error) throw error
  if (assignedToUserId !== user!.id) {
    void triggerPushNotification({ action: 'task_assigned', taskId: data.id }).catch((e) =>
      console.warn('[MateSync] push task_assigned:', e),
    )
  }
  return { ...data, subtasks: [] }
}

export async function updateTaskPositions(boardId: string, orderedTaskIds: string[]): Promise<void> {
  await Promise.all(
    orderedTaskIds.map((id, index) =>
      supabase.from('tasks').update({ position: index }).eq('id', id).eq('board_id', boardId),
    ),
  )
}

/** After reordering a filtered task list, merge back into full board order by `position`. */
export function mergeTaskOrderAfterFilteredReorder(
  allTasksSorted: Task[],
  filteredNewOrderIds: string[],
): string[] {
  const visibleSet = new Set(filteredNewOrderIds)
  const merged: string[] = []
  let v = 0
  for (const t of allTasksSorted) {
    if (visibleSet.has(t.id)) {
      merged.push(filteredNewOrderIds[v++])
    } else {
      merged.push(t.id)
    }
  }
  return merged
}

export async function updateSubtaskPositions(taskId: string, orderedSubtaskIds: string[]): Promise<void> {
  await Promise.all(
    orderedSubtaskIds.map((id, index) =>
      supabase.from('subtasks').update({ position: index }).eq('id', id).eq('task_id', taskId),
    ),
  )
}

export async function updateBoardPositions(coupleId: string, orderedBoardIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedBoardIds.map((id, index) =>
      supabase.from('boards').update({ position: index }).eq('id', id).eq('couple_id', coupleId),
    ),
  )
  const firstErr = results.find((r) => r.error)?.error
  if (firstErr && isMissingBoardPositionColumn(firstErr)) return
  if (firstErr) throw firstErr
}

export async function completeTask(taskId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_by: user!.id, completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'open')
  if (error) throw error
  void triggerPushNotification({ action: 'task_completed', taskId }).catch((e) =>
    console.warn('[MateSync] push task_completed:', e),
  )
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

export async function createSubtask(taskId: string, title: string, position: number): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .insert({ task_id: taskId, title, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setSubtaskDone(subtaskId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('subtasks').update({ done }).eq('id', subtaskId)
  if (error) throw error
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId)
  if (error) throw error
}

export function taskCanComplete(task: Task): boolean {
  if (task.status === 'done') return false
  const subs = task.subtasks ?? []
  if (subs.length === 0) return true
  return subs.every((s) => s.done)
}
