import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function getKstTomorrowBounds(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const year = kstNow.getUTCFullYear()
  const month = kstNow.getUTCMonth()
  const day = kstNow.getUTCDate()
  const start = Date.UTC(year, month, day + 1) - KST_OFFSET_MS
  const end = Date.UTC(year, month, day + 2) - KST_OFFSET_MS - 1

  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const tomorrow = getKstTomorrowBounds()

    const { data: expiringPosters, error: postersError } = await supabase
      .from('posters')
      .select('id, title, source_org_name')
      .gte('application_end_at', tomorrow.start)
      .lte('application_end_at', tomorrow.end)
      .eq('poster_status', 'published')
      .eq('verification_status', 'verified')
      .not('verified_at', 'is', null)
      .eq('deadline_type', 'fixed')

    if (postersError) throw postersError

    if (!expiringPosters || expiringPosters.length === 0) {
      return new Response(JSON.stringify({ message: "No posters expiring tomorrow." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const notificationsSent = []

    for (const poster of expiringPosters) {
      // 2. 해당 포스터를 찜한 사용자 및 그들의 푸시 토큰 조회
      const { data: favorites, error: favoritesError } = await supabase
        .from('favorites')
        .select(`
          user_id,
          profiles:user_id (nickname, expo_push_token)
        `)
        .eq('poster_id', poster.id)

      if (favoritesError) continue

      const userIds = (favorites ?? []).map((favorite) => favorite.user_id)
      const existingUserIds = new Set<string>()
      if (userIds.length > 0) {
        const { data: existingNotifications, error: existingError } = await supabase
          .from('notifications')
          .select('user_id')
          .eq('type', 'favorite_deadline')
          .eq('target_id', poster.id)
          .in('user_id', userIds)

        if (existingError) {
          console.error('Existing notification lookup error:', existingError)
          continue
        }
        for (const notification of existingNotifications ?? []) {
          existingUserIds.add(notification.user_id)
        }
      }

      for (const fav of favorites ?? []) {
        const profile = Array.isArray(fav.profiles) ? fav.profiles[0] : fav.profiles
        if (!profile || existingUserIds.has(fav.user_id)) continue

        // 3. 알림 데이터베이스 삽입
        const { data: notification, error: notifyError } = await supabase
          .from('notifications')
          .insert({
            user_id: fav.user_id,
            type: 'favorite_deadline',
            title: '⏰ 마감 임박 알림',
            body: `찜하신 [${poster.title}] 포스터가 내일 마감됩니다! 놓치지 마세요.`,
            target_type: 'poster',
            target_id: poster.id,
          })
          .select('id')
          .single()

        if (notifyError) {
          console.error('Notification insertion error:', notifyError)
          continue
        }

        // 4. Expo Push 알림 발송 (푸시 토큰이 있는 경우)
        if (profile.expo_push_token) {
          const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              to: profile.expo_push_token,
              title: '⏰ 마감 임박 알림',
              body: `찜하신 [${poster.title}] 포스터가 내일 마감됩니다!`,
              data: { posterId: poster.id },
            }),
          })
          const pushResult = await pushResponse.json().catch(() => null)
          const tickets = Array.isArray(pushResult?.data) ? pushResult.data : []
          const delivered = pushResponse.ok && tickets.some((ticket) => ticket?.status === 'ok')
          if (delivered) {
            notificationsSent.push({ userId: fav.user_id, pushResult })
            await supabase
              .from('notifications')
              .update({ push_sent_at: new Date().toISOString() })
              .eq('id', notification.id)
          }
        }
      }
    }

    return new Response(JSON.stringify({ message: "Deadline check complete.", sentCount: notificationsSent.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
