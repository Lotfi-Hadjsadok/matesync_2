import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

function createServiceRoleClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type NotifyBody =
  | { action: 'task_assigned'; taskId: string }
  | { action: 'task_completed'; taskId: string }
  | { action: 'board_created'; boardId: string }
  | { action: 'reward_created'; rewardId: string }
  | { action: 'reward_pending'; redemptionId: string }
  | { action: 'reward_approved'; redemptionId: string }
  | { action: 'reward_rejected'; redemptionId: string }

type ExpoPushMessage = {
  to: string
  sound: 'default'
  title: string
  body: string
  data: Record<string, unknown>
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sendExpoPushToUser(
  sb: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
) {
  const { data: pushTokenRows, error: pushTokenError } = await sb
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)

  if (pushTokenError) return jsonResponse({ error: pushTokenError.message }, 500)

  const tokens = Array.from(
    new Set(
      (pushTokenRows ?? [])
        .map((row) => row.expo_push_token as string)
        .filter((t) => t.startsWith('ExponentPushToken[')),
    ),
  )

  if (tokens.length === 0) return jsonResponse({ delivered: false, reason: 'No registered push token.' })

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: message,
    data,
  }))

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  const tickets = await expoResponse.json()
  return jsonResponse({ delivered: true, tickets })
}

async function areInSameCouple(sb: SupabaseClient, userIdA: string, userIdB: string): Promise<boolean> {
  const { data, error } = await sb.from('profiles').select('id, couple_id').in('id', [userIdA, userIdB])
  if (error || !data || data.length < 2) return false
  const coupleA = data.find((p) => p.id === userIdA)?.couple_id
  const coupleB = data.find((p) => p.id === userIdB)?.couple_id
  return coupleA != null && coupleA === coupleB
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Only POST is supported.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, 401)

  const jwtToken = authHeader.replace(/^Bearer\s+/i, '')
  const supabase = createServiceRoleClient()

  const {
    data: { user: caller },
    error: authError,
  } = await supabase.auth.getUser(jwtToken)
  if (authError || !caller?.email) {
    return jsonResponse({ error: 'Invalid JWT.' }, 401)
  }

  const callerId = caller.id

  let body: NotifyBody
  try {
    body = (await req.json()) as NotifyBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const action = body?.action
  if (!action) return jsonResponse({ error: 'action is required.' }, 400)

  if (action === 'task_assigned') {
    const taskId = body.taskId?.trim()
    if (!taskId) return jsonResponse({ error: 'taskId is required.' }, 400)

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, board_id, title, description, points, created_by, assigned_to')
      .eq('id', taskId)
      .maybeSingle()

    if (taskError || !task) return jsonResponse({ error: taskError?.message ?? 'Task not found.' }, 404)
    if (task.created_by !== callerId) {
      return jsonResponse({ error: 'Only the task creator can send this notification.' }, 403)
    }
    if (task.assigned_to === task.created_by) {
      return jsonResponse({ delivered: false, reason: 'Self-assigned; no push.' })
    }

    const { data: board } = await supabase.from('boards').select('couple_id').eq('id', task.board_id).maybeSingle()
    if (!board?.couple_id) return jsonResponse({ error: 'Board not found.' }, 404)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, couple_id, display_name')
      .in('id', [callerId, task.assigned_to])

    const callerProfile = profiles?.find((p) => p.id === callerId)
    const assigneeProfile = profiles?.find((p) => p.id === task.assigned_to)
    if (
      callerProfile?.couple_id !== board.couple_id ||
      assigneeProfile?.couple_id !== board.couple_id
    ) {
      return jsonResponse({ error: 'Not allowed.' }, 403)
    }

    const callerName = callerProfile.display_name?.trim() || 'Your partner'
    const notifTitle = `✨ New mission from ${callerName}!`
    const notifMessage =
      task.description?.trim() ||
      `${callerName} queued up a ${task.points}-pt task for you: ${task.title} 🚀`

    return sendExpoPushToUser(supabase, task.assigned_to, notifTitle, notifMessage, {
      type: 'task_assigned',
      taskId: task.id,
      boardId: task.board_id,
    })
  }

  if (action === 'task_completed') {
    const taskId = body.taskId?.trim()
    if (!taskId) return jsonResponse({ error: 'taskId is required.' }, 400)

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, board_id, title, points, status, created_by, completed_by, assigned_to')
      .eq('id', taskId)
      .maybeSingle()

    if (taskError || !task) return jsonResponse({ error: taskError?.message ?? 'Task not found.' }, 404)
    if (task.status !== 'done') return jsonResponse({ error: 'Task is not completed.' }, 400)
    if (task.completed_by !== callerId) {
      return jsonResponse({ error: 'Only the completer can send this notification.' }, 403)
    }
    if (task.created_by === callerId) {
      return jsonResponse({ delivered: false, reason: 'No partner to notify.' })
    }

    const { data: board } = await supabase.from('boards').select('couple_id').eq('id', task.board_id).maybeSingle()
    if (!board?.couple_id) return jsonResponse({ error: 'Board not found.' }, 404)
    if (!(await areInSameCouple(supabase, callerId, task.created_by))) {
      return jsonResponse({ error: 'Not allowed.' }, 403)
    }

    const { data: completerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', callerId)
      .maybeSingle()
    const completerName = completerProfile?.display_name?.trim() || 'Your partner'

    return sendExpoPushToUser(
      supabase,
      task.created_by,
      '🎉 Quest complete!',
      `${completerName} crushed "${task.title}" — ${task.points} pts nabbed! 💪`,
      { type: 'task_completed', taskId: task.id, boardId: task.board_id, points: task.points },
    )
  }

  if (action === 'board_created') {
    const boardId = body.boardId?.trim()
    if (!boardId) return jsonResponse({ error: 'boardId is required.' }, 400)

    const { data: board, error: boardError } = await supabase
      .from('boards')
      .select('id, couple_id, title, created_by')
      .eq('id', boardId)
      .maybeSingle()

    if (boardError || !board) return jsonResponse({ error: boardError?.message ?? 'Board not found.' }, 404)
    if (board.created_by !== callerId) {
      return jsonResponse({ error: 'Only the board creator can send this notification.' }, 403)
    }

    const { data: partner } = await supabase
      .from('profiles')
      .select('id')
      .eq('couple_id', board.couple_id)
      .neq('id', callerId)
      .maybeSingle()

    if (!partner?.id) return jsonResponse({ delivered: false, reason: 'No partner yet.' })

    const { data: callerProfile } = await supabase.from('profiles').select('display_name').eq('id', callerId).maybeSingle()
    const callerName = callerProfile?.display_name?.trim() || 'Your partner'

    return sendExpoPushToUser(supabase, partner.id, '🗂️ Fresh board just dropped!', `${callerName} opened "${board.title}" — go peek! 👀`, {
      type: 'board_created',
      boardId: board.id,
    })
  }

  if (action === 'reward_created') {
    const rewardId = body.rewardId?.trim()
    if (!rewardId) return jsonResponse({ error: 'rewardId is required.' }, 400)

    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select('id, couple_id, title, cost_points, created_by')
      .eq('id', rewardId)
      .maybeSingle()

    if (rewardError || !reward) return jsonResponse({ error: rewardError?.message ?? 'Reward not found.' }, 404)
    if (reward.created_by !== callerId) {
      return jsonResponse({ error: 'Only the reward creator can send this notification.' }, 403)
    }

    const { data: partner } = await supabase
      .from('profiles')
      .select('id')
      .eq('couple_id', reward.couple_id)
      .neq('id', callerId)
      .maybeSingle()

    if (!partner?.id) return jsonResponse({ delivered: false, reason: 'No partner yet.' })

    const { data: callerProfile } = await supabase.from('profiles').select('display_name').eq('id', callerId).maybeSingle()
    const callerName = callerProfile?.display_name?.trim() || 'Your partner'

    return sendExpoPushToUser(supabase, partner.id, '🎁 New treat on the menu!', `${callerName} added "${reward.title}" — ${reward.cost_points} pts to claim! 😍`, {
      type: 'reward_created',
      rewardId: reward.id,
    })
  }

  if (action === 'reward_pending') {
    const redemptionId = body.redemptionId?.trim()
    if (!redemptionId) return jsonResponse({ error: 'redemptionId is required.' }, 400)

    const { data: redemption, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .select('id, reward_id, profile_id, status')
      .eq('id', redemptionId)
      .maybeSingle()

    if (redemptionError || !redemption) return jsonResponse({ error: redemptionError?.message ?? 'Redemption not found.' }, 404)
    if (redemption.status !== 'pending') return jsonResponse({ error: 'Redemption is not pending.' }, 400)
    if (redemption.profile_id !== callerId) {
      return jsonResponse({ error: 'Only the redeemer can send this notification.' }, 403)
    }

    const { data: reward } = await supabase
      .from('rewards')
      .select('title, created_by, couple_id')
      .eq('id', redemption.reward_id)
      .maybeSingle()

    if (reward?.created_by === callerId) {
      return jsonResponse({ delivered: false, reason: 'No creator to notify.' })
    }

    if (!(await areInSameCouple(supabase, callerId, reward?.created_by))) {
      return jsonResponse({ error: 'Not allowed.' }, 403)
    }

    const { data: redeemerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', callerId)
      .maybeSingle()
    const redeemerName = redeemerProfile?.display_name?.trim() || 'Your partner'

    return sendExpoPushToUser(supabase, reward.created_by, '🙏 Treat request incoming!', `${redeemerName} is eyeing "${reward.title}" — will you say yes? ✨`, {
      type: 'reward_pending',
      redemptionId: redemption.id,
      rewardId: redemption.reward_id,
    })
  }

  if (action === 'reward_approved') {
    const redemptionId = body.redemptionId?.trim()
    if (!redemptionId) return jsonResponse({ error: 'redemptionId is required.' }, 400)

    const { data: redemption, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .select('id, reward_id, profile_id, status, approved_by')
      .eq('id', redemptionId)
      .maybeSingle()

    if (redemptionError || !redemption) return jsonResponse({ error: redemptionError?.message ?? 'Redemption not found.' }, 404)
    if (redemption.status !== 'approved') return jsonResponse({ error: 'Redemption is not approved.' }, 400)
    if (redemption.approved_by !== callerId) {
      return jsonResponse({ error: 'Only the approver can send this notification.' }, 403)
    }

    const { data: reward } = await supabase.from('rewards').select('title').eq('id', redemption.reward_id).maybeSingle()
    const rewardTitle = reward?.title ?? 'your treat'

    const { data: approverProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', callerId)
      .maybeSingle()
    const approverName = approverProfile?.display_name?.trim() || 'Your partner'

    return sendExpoPushToUser(supabase, redemption.profile_id, '🎊 Treat approved!', `${approverName} said YES to "${rewardTitle}" — enjoy! 💕`, {
      type: 'reward_approved',
      redemptionId: redemption.id,
      rewardId: redemption.reward_id,
    })
  }

  if (action === 'reward_rejected') {
    const redemptionId = body.redemptionId?.trim()
    if (!redemptionId) return jsonResponse({ error: 'redemptionId is required.' }, 400)

    const { data: redemption, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .select('id, reward_id, profile_id, status')
      .eq('id', redemptionId)
      .maybeSingle()

    if (redemptionError || !redemption) return jsonResponse({ error: redemptionError?.message ?? 'Redemption not found.' }, 404)
    if (redemption.status !== 'rejected') return jsonResponse({ error: 'Redemption is not rejected.' }, 400)

    if (redemption.profile_id === callerId) {
      return jsonResponse({ delivered: false, reason: 'Self-cancel; no push.' })
    }
    if (!(await areInSameCouple(supabase, callerId, redemption.profile_id))) {
      return jsonResponse({ error: 'Not allowed.' }, 403)
    }

    const { data: reward } = await supabase.from('rewards').select('title').eq('id', redemption.reward_id).maybeSingle()
    const rewardTitle = reward?.title ?? 'that treat'

    return sendExpoPushToUser(
      supabase,
      redemption.profile_id,
      '😅 Not this time…',
      `"${rewardTitle}" wasn't approved this round. Keep earning those pts! 💪`,
      { type: 'reward_rejected', redemptionId: redemption.id, rewardId: redemption.reward_id },
    )
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400)
})
