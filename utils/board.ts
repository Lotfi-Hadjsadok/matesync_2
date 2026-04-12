import { supabase } from '@/utils/supabase'

export type Board = {
  id: string
  couple_id: string
  title: string
  color: string
  created_by: string | null
  created_at: string
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
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
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

export async function createBoard(coupleId: string, title: string, color: string): Promise<Board> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('boards')
    .insert({ couple_id: coupleId, title, color, created_by: user!.id })
    .select()
    .single()
  if (error) throw error
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
  return { ...data, subtasks: [] }
}

export async function updateTaskPositions(boardId: string, orderedTaskIds: string[]): Promise<void> {
  await Promise.all(
    orderedTaskIds.map((id, index) =>
      supabase.from('tasks').update({ position: index }).eq('id', id).eq('board_id', boardId),
    ),
  )
}

export async function completeTask(taskId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_by: user!.id, completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'open')
  if (error) throw error
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
